import { hashValue } from "./canonical.js";
import { asMomentSealError, MomentSealError } from "./errors.js";
import type { ActionDecision, MomentCompilation, MomentFinding, MomentFindingCode, PlannedAction } from "./types.js";
import { assertPlan, assertPolicy } from "./validation.js";

const mutationKinds = new Set<PlannedAction["kind"]>(["create", "update", "delete", "external-effect"]);
const finding = (
  code: MomentFindingCode,
  message: string,
  options: { actionId?: string; observationId?: string; resourceId?: string; relatedIds?: string[] } = {},
): MomentFinding => ({
  code,
  severity: "blocked",
  message,
  ...(options.actionId ? { actionId: options.actionId } : {}),
  ...(options.observationId ? { observationId: options.observationId } : {}),
  ...(options.resourceId ? { resourceId: options.resourceId } : {}),
  relatedIds: options.relatedIds ?? [],
});

export async function compileMoments(input: {
  plan: unknown;
  policy: unknown;
  compiledAt?: Date;
}): Promise<MomentCompilation> {
  try {
    assertPlan(input.plan);
  } catch (error) {
    throw asMomentSealError("INVALID_PLAN", error);
  }
  try {
    assertPolicy(input.policy);
  } catch (error) {
    throw asMomentSealError("INVALID_POLICY", error);
  }
  const { plan, policy } = input;
  if (plan.planId !== policy.planId) throw new MomentSealError("COMPILATION_INPUT_MISMATCH", "Plan and policy target different plan ids.");
  const compiledAt = input.compiledAt ?? new Date();
  if (!Number.isFinite(compiledAt.getTime())) throw new MomentSealError("COMPILATION_TIMESTAMP_INVALID", "Compilation timestamp is invalid.");

  const [planHash, policyHash] = await Promise.all([hashValue(plan), hashValue(policy)]);
  const observations = new Map(plan.observations.map((item) => [item.id, item]));
  const states = new Map(plan.commitStates.map((item) => [item.id, item]));
  const actions = new Map(plan.actions.map((item) => [item.id, item]));
  const planFindings: MomentFinding[] = [];
  const findingsByAction = new Map<string, MomentFinding[]>();
  const addActionFinding = (actionId: string, item: MomentFinding) => findingsByAction.set(actionId, [...(findingsByAction.get(actionId) ?? []), item]);
  const edgeCount = plan.actions.reduce((total, action) => total + action.dependsOnActionIds.length, 0);

  if (plan.actions.length > policy.maximumActions) planFindings.push(finding("action-limit-exceeded", `Plan contains ${plan.actions.length} actions; policy allows ${policy.maximumActions}.`));
  if (plan.observations.length > policy.maximumObservations) planFindings.push(finding("observation-limit-exceeded", `Plan contains ${plan.observations.length} observations; policy allows ${policy.maximumObservations}.`));
  if (edgeCount > policy.maximumDependencyEdges) planFindings.push(finding("dependency-edge-limit-exceeded", `Plan contains ${edgeCount} dependency edges; policy allows ${policy.maximumDependencyEdges}.`));
  for (const state of plan.commitStates) {
    const action = actions.get(state.actionId);
    if (!action) planFindings.push(finding("orphan-commit-state", "Commit state targets an action that does not exist.", { resourceId: state.resourceId, relatedIds: [state.id, state.actionId] }));
    else if (action.commitStateId !== state.id) addActionFinding(action.id, finding("unbound-commit-state", "Commit state is not selected by its declared action.", { actionId: action.id, resourceId: state.resourceId, relatedIds: [state.id] }));
  }

  const outgoing = new Map<string, string[]>();
  const indegree = new Map(plan.actions.map((action) => [action.id, 0]));
  for (const action of plan.actions) {
    const missing = action.dependsOnActionIds.filter((id) => !actions.has(id));
    if (missing.length) addActionFinding(action.id, finding("orphan-action-dependency", "One or more action dependencies do not exist.", { actionId: action.id, resourceId: action.resourceId, relatedIds: missing }));
    const validParents = action.dependsOnActionIds.filter((id) => actions.has(id));
    indegree.set(action.id, validParents.length);
    for (const parent of validParents) outgoing.set(parent, [...(outgoing.get(parent) ?? []), action.id]);
    const invalidOrder = validParents.filter((id) => (actions.get(id)?.sequence ?? -1) >= action.sequence);
    if (invalidOrder.length) addActionFinding(action.id, finding("dependency-order-invalid", "Action depends on a step that is not earlier in sequence.", { actionId: action.id, resourceId: action.resourceId, relatedIds: invalidOrder }));
  }

  const ready = plan.actions.filter((action) => indegree.get(action.id) === 0).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)).map((action) => action.id);
  const depths = new Map<string, number>(ready.map((id) => [id, 0]));
  let processed = 0;
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    processed += 1;
    for (const child of (outgoing.get(id) ?? []).sort()) {
      depths.set(child, Math.max(depths.get(child) ?? 0, (depths.get(id) ?? 0) + 1));
      const remaining = (indegree.get(child) ?? 1) - 1;
      indegree.set(child, remaining);
      if (remaining === 0) ready.push(child);
    }
    ready.sort((a, b) => (actions.get(a)?.sequence ?? 0) - (actions.get(b)?.sequence ?? 0) || a.localeCompare(b));
  }
  if (processed !== plan.actions.length) {
    for (const action of plan.actions.filter((item) => (indegree.get(item.id) ?? 0) > 0)) {
      addActionFinding(action.id, finding("action-dependency-cycle", "Action participates in a dependency cycle.", { actionId: action.id, resourceId: action.resourceId, relatedIds: action.dependsOnActionIds }));
    }
  }

  const writesByVersion = new Map<string, PlannedAction[]>();
  for (const action of plan.actions.filter((item) => mutationKinds.has(item.kind) && item.expectedVersion)) {
    const key = `${action.resourceId}\u0000${action.expectedVersion ?? ""}`;
    writesByVersion.set(key, [...(writesByVersion.get(key) ?? []), action]);
  }
  for (const writes of writesByVersion.values()) {
    if (writes.length < 2) continue;
    for (const action of writes) addActionFinding(action.id, finding("competing-plan-writes", "Multiple actions attempt to mutate the same resource version.", { actionId: action.id, resourceId: action.resourceId, relatedIds: writes.filter((item) => item.id !== action.id).map((item) => item.id) }));
  }

  const decisions: ActionDecision[] = [];
  const priorMutationsByResource = new Map<string, PlannedAction[]>();
  for (const action of [...plan.actions].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))) {
    const findings = [...(findingsByAction.get(action.id) ?? [])];
    const observation = action.observationId ? observations.get(action.observationId) : undefined;
    const state = action.commitStateId ? states.get(action.commitStateId) : undefined;
    const mutation = mutationKinds.has(action.kind);
    const commit = Date.parse(action.commitAt);

    if (action.observationId && !observation) findings.push(finding("observation-missing", "Referenced observation does not exist.", { actionId: action.id, observationId: action.observationId, resourceId: action.resourceId }));
    if (mutation && action.kind !== "create" && !action.observationId) findings.push(finding("mutation-observation-missing", "Mutation requires a bound resource observation.", { actionId: action.id, resourceId: action.resourceId }));
    if (mutation && !action.commitStateId) findings.push(finding("commit-state-missing", "Mutation requires a bound commit-time state.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.commitStateId && !state) findings.push(finding("commit-state-missing", "Referenced commit-time state does not exist.", { actionId: action.id, resourceId: action.resourceId, relatedIds: [action.commitStateId] }));

    if (observation) {
      const observed = Date.parse(observation.observedAt);
      const gap = commit - observed;
      if (observation.resourceId !== action.resourceId) findings.push(finding("observation-resource-mismatch", "Observation belongs to a different resource.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId, relatedIds: [observation.resourceId] }));
      if (observation.authority < policy.minimumAuthority) findings.push(finding("observation-authority-low", `Observation authority ${observation.authority} is below ${policy.minimumAuthority}.`, { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (gap < 0) findings.push(finding("commit-before-observation", "Action commits before its evidence was observed.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (gap > policy.maximumCheckUseGapMs) findings.push(finding("check-use-gap-exceeded", `Check-to-use gap ${gap}ms exceeds ${policy.maximumCheckUseGapMs}ms.`, { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (gap > policy.maximumObservationAgeMs || commit > Date.parse(observation.expiresAt)) findings.push(finding("observation-expired", "Observation is no longer fresh at commit time.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (policy.requireScopeBinding && observation.scopeHash !== action.scopeHash) findings.push(finding("scope-observation-mismatch", "Action scope differs from the authority scope of its observation.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
    }

    if (state) {
      const stateAge = commit - Date.parse(state.capturedAt);
      if (state.actionId !== action.id) findings.push(finding("commit-state-action-mismatch", "Commit state is bound to a different action.", { actionId: action.id, resourceId: action.resourceId, relatedIds: [state.actionId] }));
      if (state.resourceId !== action.resourceId) findings.push(finding("commit-state-resource-mismatch", "Commit state belongs to a different resource.", { actionId: action.id, resourceId: action.resourceId, relatedIds: [state.resourceId] }));
      if (stateAge < 0) findings.push(finding("commit-state-from-future", "Commit state was captured after the action commit time.", { actionId: action.id, resourceId: action.resourceId }));
      if (stateAge > policy.maximumCommitStateAgeMs) findings.push(finding("commit-state-age-exceeded", `Commit-state age ${stateAge}ms exceeds ${policy.maximumCommitStateAgeMs}ms.`, { actionId: action.id, resourceId: action.resourceId }));
      if (policy.requireScopeBinding && state.scopeHash !== action.scopeHash) findings.push(finding("scope-commit-state-mismatch", "Action scope differs from the commit-state authorization scope.", { actionId: action.id, resourceId: action.resourceId }));
      if (action.kind === "create" && state.exists) findings.push(finding("resource-already-exists", "Create action targets a resource that already exists.", { actionId: action.id, resourceId: action.resourceId }));
      if (action.kind !== "create" && !state.exists) findings.push(finding("resource-missing-at-commit", "Action targets a resource that no longer exists.", { actionId: action.id, resourceId: action.resourceId }));
      if (observation && state.exists && observation.version !== state.currentVersion) findings.push(finding("state-version-drift", `Observed version "${observation.version}" differs from commit version "${state.currentVersion}".`, { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
    }

    if (action.expectedVersion && observation && action.expectedVersion !== observation.version) findings.push(finding("expected-version-observation-mismatch", "Expected version differs from the bound observation.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
    if (action.expectedVersion && state?.exists && action.expectedVersion !== state.currentVersion) findings.push(finding("if-match-would-fail", "Expected version does not match commit-time state.", { actionId: action.id, resourceId: action.resourceId }));
    if (mutation && policy.requireConditionalForMutations && action.consistency === "none") findings.push(finding("conditional-mutation-missing", "Mutation lacks If-Match, If-None-Match, transaction, or lease protection.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.consistency === "if-match" && !action.expectedVersion) findings.push(finding("expected-version-missing", "If-Match action requires an expected version.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.kind === "create" && action.consistency === "if-match") findings.push(finding("create-guard-invalid", "Create actions cannot use If-Match; use If-None-Match, a transaction, or a lease.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.kind !== "create" && action.consistency === "if-none-match") findings.push(finding("create-guard-invalid", "If-None-Match is only valid for create actions.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.consistency === "if-none-match" && action.expectedVersion) findings.push(finding("unexpected-version-guard", "If-None-Match creation must not declare an expected existing version.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.consistency === "lease") {
      if (!action.leaseScope) findings.push(finding("lease-scope-missing", "Lease-protected action requires a declared scope.", { actionId: action.id, resourceId: action.resourceId }));
      else if (policy.requireScopeBinding && action.leaseScope !== action.scopeHash) findings.push(finding("lease-scope-mismatch", "Lease scope differs from the action authority scope.", { actionId: action.id, resourceId: action.resourceId }));
    }

    if (action.irreversible && policy.requireRevalidationForIrreversible) {
      if (!action.revalidatedAt || !action.revalidatedVersion || !action.revalidatedScopeHash) findings.push(finding("irreversible-revalidation-missing", "Irreversible action requires timestamp, version, and scope revalidation.", { actionId: action.id, resourceId: action.resourceId }));
      if (action.revalidatedAt) {
        const age = commit - Date.parse(action.revalidatedAt);
        if (age < 0 || age > policy.maximumRevalidationAgeMs || (state && Date.parse(action.revalidatedAt) < Date.parse(state.capturedAt))) findings.push(finding("irreversible-revalidation-stale", "Irreversible action revalidation is outside the permitted commit window or predates commit-state capture.", { actionId: action.id, resourceId: action.resourceId }));
      }
      if (action.revalidatedVersion && state?.exists && action.revalidatedVersion !== state.currentVersion) findings.push(finding("revalidation-version-mismatch", "Revalidated version differs from commit-time state.", { actionId: action.id, resourceId: action.resourceId }));
      if (action.revalidatedScopeHash && action.revalidatedScopeHash !== action.scopeHash) findings.push(finding("revalidation-scope-mismatch", "Revalidated scope differs from the action authority scope.", { actionId: action.id, resourceId: action.resourceId }));
    }

    const earlierMutations = priorMutationsByResource.get(action.resourceId) ?? [];
    if (observation && earlierMutations.length) {
      const latestPriorCommit = Math.max(...earlierMutations.map((item) => Date.parse(item.commitAt)));
      if (Date.parse(observation.observedAt) <= latestPriorCommit || !state || Date.parse(state.capturedAt) <= latestPriorCommit) findings.push(finding("internally-invalidated-observation", "An earlier action mutates this resource; later evidence and commit state must be captured after that mutation.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId, relatedIds: earlierMutations.map((item) => item.id) }));
    }
    if (mutation) priorMutationsByResource.set(action.resourceId, [...earlierMutations, action]);

    const actionDepth = (indegree.get(action.id) ?? 0) > 0 ? null : (depths.get(action.id) ?? 0);
    if (actionDepth !== null && actionDepth > policy.maximumDependencyDepth) findings.push(finding("dependency-depth-exceeded", `Dependency depth ${actionDepth} exceeds ${policy.maximumDependencyDepth}.`, { actionId: action.id, resourceId: action.resourceId }));
    const gap = observation ? commit - Date.parse(observation.observedAt) : null;
    decisions.push({ actionId: action.id, status: findings.some((item) => item.severity === "blocked") ? "reject" : findings.length ? "review" : "commit", checkUseGapMs: gap, dependencyDepth: actionDepth, findings });
  }

  const allFindings = [...planFindings, ...decisions.flatMap((item) => item.findings)];
  const blocked = allFindings.filter((item) => item.severity === "blocked").length;
  const warnings = allFindings.filter((item) => item.severity === "warning").length;
  const mutationActions = plan.actions.filter((item) => mutationKinds.has(item.kind));
  const observedDecisions = decisions.filter((item) => item.checkUseGapMs !== null);
  const freshObservations = decisions.filter((item) => item.checkUseGapMs !== null && !item.findings.some((entry) => ["commit-before-observation", "check-use-gap-exceeded", "observation-expired"].includes(entry.code))).length;
  const stateBoundActions = plan.actions.filter((item) => item.commitStateId);
  const freshStates = decisions.filter((item) => stateBoundActions.some((action) => action.id === item.actionId) && !item.findings.some((entry) => ["commit-state-missing", "commit-state-from-future", "commit-state-age-exceeded"].includes(entry.code))).length;
  const scopedActions = decisions.filter((item) => !item.findings.some((entry) => entry.code.includes("scope-") || entry.code.startsWith("scope-"))).length;
  const drifted = new Set(decisions.flatMap((item) => item.findings.filter((entry) => entry.code === "state-version-drift").map((entry) => entry.resourceId ?? ""))).size;
  const base = {
    planId: plan.planId,
    planHash,
    policyHash,
    status: blocked ? "blocked" as const : warnings ? "review" as const : "clean" as const,
    score: Math.max(0, 100 - blocked * 6 - warnings * 2),
    compiledAt: compiledAt.toISOString(),
    summary: { actions: decisions.length, commit: decisions.filter((item) => item.status === "commit").length, review: decisions.filter((item) => item.status === "review").length, reject: decisions.filter((item) => item.status === "reject").length },
    metrics: {
      conditionalCoverage: mutationActions.length ? mutationActions.filter((item) => item.consistency !== "none").length / mutationActions.length : 1,
      freshObservationCoverage: observedDecisions.length ? freshObservations / observedDecisions.length : 1,
      freshCommitStateCoverage: stateBoundActions.length ? freshStates / stateBoundActions.length : 1,
      scopeBindingCoverage: decisions.length ? scopedActions / decisions.length : 1,
      driftedResources: drifted,
      maximumCheckUseGapMs: Math.max(0, ...decisions.map((item) => item.checkUseGapMs ?? 0)),
      maximumDependencyDepth: Math.max(0, ...decisions.map((item) => item.dependencyDepth ?? 0)),
      irreversibleActions: plan.actions.filter((item) => item.irreversible).length,
      internallyInvalidatedActions: decisions.filter((item) => item.findings.some((entry) => entry.code === "internally-invalidated-observation")).length,
    },
    decisions,
    findings: planFindings,
    graph: {
      observations: [...plan.observations].sort((a, b) => a.id.localeCompare(b.id)),
      states: [...plan.commitStates].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.id.localeCompare(b.id)),
      actions: [...plan.actions].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
      dependencyEdges: plan.actions.flatMap((item) => item.dependsOnActionIds.map((parent) => ({ from: parent, to: item.id }))),
      evidenceEdges: plan.actions.flatMap((item) => item.observationId ? [{ from: item.observationId, to: item.id }] : []),
    },
  };
  return { ...base, compilationHash: await hashValue(base) };
}
