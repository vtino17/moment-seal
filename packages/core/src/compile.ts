import { hashValue } from "./canonical.js";
import type { ActionDecision, MomentCompilation, MomentFinding } from "./types.js";
import { assertPlan, assertPolicy } from "./validation.js";

const mutationKinds = new Set(["create", "update", "delete", "external-effect"]);
const finding = (
  code: string,
  severity: MomentFinding["severity"],
  message: string,
  options: { actionId?: string; observationId?: string; resourceId?: string; relatedIds?: string[] } = {},
): MomentFinding => ({
  code, severity, message,
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
  assertPlan(input.plan);
  assertPolicy(input.policy);
  const { plan, policy } = input;
  if (plan.planId !== policy.planId) throw new Error("Plan and policy target different plan ids.");
  const observations = new Map(plan.observations.map((item) => [item.id, item]));
  const states = new Map(plan.commitStates.map((item) => [item.resourceId, item]));
  const actions = new Map(plan.actions.map((item) => [item.id, item]));
  const globalFindings: MomentFinding[] = [];

  for (const action of plan.actions) {
    const missing = action.dependsOnActionIds.filter((id) => !actions.has(id));
    if (missing.length) globalFindings.push(finding("orphan-action-dependency", "blocked", "One or more action dependencies do not exist.", { actionId: action.id, resourceId: action.resourceId, relatedIds: missing }));
  }
  const hasCycle = (id: string, stack: string[] = [], done = new Set<string>()): boolean => {
    if (stack.includes(id)) return true;
    if (done.has(id)) return false;
    const action = actions.get(id);
    if (!action) return false;
    const result = action.dependsOnActionIds.some((parent) => hasCycle(parent, [...stack, id], done));
    done.add(id);
    return result;
  };
  const depthMemo = new Map<string, number | null>();
  const depth = (id: string, stack: string[] = []): number | null => {
    if (depthMemo.has(id)) return depthMemo.get(id) ?? null;
    if (stack.includes(id)) return null;
    const action = actions.get(id);
    if (!action) return null;
    if (!action.dependsOnActionIds.length) return 0;
    const parents = action.dependsOnActionIds.map((parent) => depth(parent, [...stack, id]));
    if (parents.some((item) => item === null)) return null;
    const result = 1 + Math.max(...parents.map((item) => item ?? 0));
    depthMemo.set(id, result);
    return result;
  };
  for (const action of plan.actions) {
    if (hasCycle(action.id)) globalFindings.push(finding("action-dependency-cycle", "blocked", "Action participates in a dependency cycle.", { actionId: action.id, resourceId: action.resourceId, relatedIds: action.dependsOnActionIds }));
    const invalidOrder = action.dependsOnActionIds.filter((id) => (actions.get(id)?.sequence ?? -1) >= action.sequence);
    if (invalidOrder.length) globalFindings.push(finding("dependency-order-invalid", "blocked", "Action depends on a step that is not earlier in sequence.", { actionId: action.id, resourceId: action.resourceId, relatedIds: invalidOrder }));
  }

  const decisions: ActionDecision[] = [];
  for (const action of [...plan.actions].sort((a, b) => a.sequence - b.sequence)) {
    const findings: MomentFinding[] = globalFindings.filter((item) => item.actionId === action.id);
    const observation = action.observationId ? observations.get(action.observationId) : undefined;
    const state = states.get(action.resourceId);
    const mutation = mutationKinds.has(action.kind);
    if (action.observationId && !observation) findings.push(finding("observation-missing", "blocked", "Referenced observation does not exist.", { actionId: action.id, observationId: action.observationId, resourceId: action.resourceId }));
    if (mutation && action.kind !== "create" && !action.observationId) findings.push(finding("mutation-observation-missing", "blocked", "Mutation requires a bound resource observation.", { actionId: action.id, resourceId: action.resourceId }));
    if (observation) {
      const commit = Date.parse(action.commitAt);
      const observed = Date.parse(observation.observedAt);
      const gap = commit - observed;
      if (observation.resourceId !== action.resourceId) findings.push(finding("observation-resource-mismatch", "blocked", "Observation belongs to a different resource.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId, relatedIds: [observation.resourceId] }));
      if (observation.authority < policy.minimumAuthority) findings.push(finding("observation-authority-low", "blocked", `Observation authority ${observation.authority} is below ${policy.minimumAuthority}.`, { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (gap < 0) findings.push(finding("commit-before-observation", "blocked", "Action commits before its evidence was observed.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (gap > policy.maximumCheckUseGapMs) findings.push(finding("check-use-gap-exceeded", "blocked", `Check-to-use gap ${gap}ms exceeds ${policy.maximumCheckUseGapMs}ms.`, { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (gap > policy.maximumObservationAgeMs || commit > Date.parse(observation.expiresAt)) findings.push(finding("observation-expired", "blocked", "Observation is no longer fresh at commit time.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (state && observation.version !== state.currentVersion) findings.push(finding("state-version-drift", "blocked", `Observed version "${observation.version}" differs from commit version "${state.currentVersion}".`, { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      const earlierMutations = plan.actions.filter((candidate) => candidate.sequence < action.sequence && candidate.resourceId === action.resourceId && mutationKinds.has(candidate.kind));
      if (earlierMutations.length && (!action.revalidatedAt || Date.parse(action.revalidatedAt) < Math.max(...earlierMutations.map((item) => Date.parse(item.commitAt))))) findings.push(finding("internally-invalidated-observation", "blocked", "An earlier action in this plan mutates the observed resource before this action commits.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId, relatedIds: earlierMutations.map((item) => item.id) }));
    }
    if (mutation && action.kind !== "create" && !state) findings.push(finding("commit-state-missing", "blocked", "No commit-time state exists for this mutation.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.kind === "create" && state?.exists) findings.push(finding("resource-already-exists", "blocked", "Create action targets a resource that already exists.", { actionId: action.id, resourceId: action.resourceId }));
    if (state && Date.parse(state.capturedAt) > Date.parse(action.commitAt)) findings.push(finding("commit-state-from-future", "blocked", "Commit state was captured after the action commit time.", { actionId: action.id, resourceId: action.resourceId }));
    if (mutation && policy.requireConditionalForMutations && action.consistency === "none") findings.push(finding("conditional-mutation-missing", "blocked", "Mutation lacks If-Match, transaction, or lease protection.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.consistency === "if-match") {
      if (!action.expectedVersion) findings.push(finding("expected-version-missing", "blocked", "If-Match action requires an expected version.", { actionId: action.id, resourceId: action.resourceId }));
      if (observation && action.expectedVersion && action.expectedVersion !== observation.version) findings.push(finding("expected-version-observation-mismatch", "blocked", "Expected version differs from the bound observation.", { actionId: action.id, observationId: observation.id, resourceId: action.resourceId }));
      if (state && action.expectedVersion && action.expectedVersion !== state.currentVersion) findings.push(finding("if-match-would-fail", "blocked", "Expected version does not match commit-time state.", { actionId: action.id, resourceId: action.resourceId }));
    }
    if (action.consistency === "lease" && !action.leaseScope) findings.push(finding("lease-scope-missing", "blocked", "Lease-protected action requires a declared scope.", { actionId: action.id, resourceId: action.resourceId }));
    if (action.irreversible && policy.requireRevalidationForIrreversible) {
      if (!action.revalidatedAt) findings.push(finding("irreversible-revalidation-missing", "blocked", "Irreversible action requires commit-time revalidation.", { actionId: action.id, resourceId: action.resourceId }));
      else {
        const revalidationAge = Date.parse(action.commitAt) - Date.parse(action.revalidatedAt);
        if (revalidationAge < 0 || revalidationAge > policy.maximumRevalidationAgeMs) findings.push(finding("irreversible-revalidation-stale", "blocked", "Irreversible action revalidation is outside the permitted commit window.", { actionId: action.id, resourceId: action.resourceId }));
      }
    }
    const actionDepth = depth(action.id);
    if (actionDepth !== null && actionDepth > policy.maximumDependencyDepth) findings.push(finding("dependency-depth-exceeded", "blocked", `Dependency depth ${actionDepth} exceeds ${policy.maximumDependencyDepth}.`, { actionId: action.id, resourceId: action.resourceId }));
    const gap = observation ? Date.parse(action.commitAt) - Date.parse(observation.observedAt) : null;
    decisions.push({ actionId: action.id, status: findings.some((item) => item.severity === "blocked") ? "reject" : findings.length ? "review" : "commit", checkUseGapMs: gap, dependencyDepth: actionDepth, findings });
  }

  const writesByResource = new Map<string, typeof plan.actions>();
  for (const action of plan.actions.filter((item) => mutationKinds.has(item.kind) && item.expectedVersion)) {
    writesByResource.set(action.resourceId, [...(writesByResource.get(action.resourceId) ?? []), action]);
  }
  for (const [resourceId, writes] of writesByResource) {
    if (writes.length > 1 && new Set(writes.map((item) => item.expectedVersion)).size === 1) globalFindings.push(finding("competing-plan-writes", "blocked", "Multiple actions attempt to mutate the same resource version.", { resourceId, relatedIds: writes.map((item) => item.id) }));
  }
  const planFindings = globalFindings.filter((item) => !item.actionId);
  const allFindings = [...planFindings, ...decisions.flatMap((item) => item.findings)];
  const blocked = allFindings.filter((item) => item.severity === "blocked").length;
  const warnings = allFindings.filter((item) => item.severity === "warning").length;
  const mutationActions = plan.actions.filter((item) => mutationKinds.has(item.kind));
  const observedDecisions = decisions.filter((item) => item.checkUseGapMs !== null);
  const fresh = observedDecisions.filter((item) => item.checkUseGapMs !== null && item.checkUseGapMs >= 0 && item.checkUseGapMs <= policy.maximumObservationAgeMs).length;
  const drifted = new Set(decisions.flatMap((item) => item.findings.filter((entry) => entry.code === "state-version-drift").map((entry) => entry.resourceId ?? ""))).size;
  const base = {
    planId: plan.planId,
    status: blocked ? "blocked" as const : warnings ? "review" as const : "clean" as const,
    score: Math.max(0, 100 - blocked * 8 - warnings * 3),
    compiledAt: (input.compiledAt ?? new Date()).toISOString(),
    summary: { actions: decisions.length, commit: decisions.filter((item) => item.status === "commit").length, review: decisions.filter((item) => item.status === "review").length, reject: decisions.filter((item) => item.status === "reject").length },
    metrics: {
      conditionalCoverage: mutationActions.length ? mutationActions.filter((item) => item.consistency !== "none").length / mutationActions.length : 1,
      freshObservationCoverage: observedDecisions.length ? fresh / observedDecisions.length : 1,
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
      states: [...plan.commitStates].sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
      actions: [...plan.actions].sort((a, b) => a.sequence - b.sequence),
      dependencyEdges: plan.actions.flatMap((item) => item.dependsOnActionIds.map((parent) => ({ from: parent, to: item.id }))),
      evidenceEdges: plan.actions.flatMap((item) => item.observationId ? [{ from: item.observationId, to: item.id }] : []),
    },
  };
  return { ...base, compilationHash: await hashValue(base) };
}
