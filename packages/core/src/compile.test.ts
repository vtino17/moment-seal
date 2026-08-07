import { describe, expect, it } from "vitest";
import { compileMoments } from "./compile.js";
import { racyPlan, racyPolicy, safePlan, safePolicy } from "./sample.js";
import type { AgentPlan } from "./types.js";

const copy = <T>(value: T): T => structuredClone(value);
const codes = async (plan: AgentPlan = racyPlan) => {
  const result = await compileMoments({ plan, policy: plan.planId === racyPlan.planId ? racyPolicy : safePolicy, compiledAt: new Date("2026-07-29T04:00:00.000Z") });
  return new Set([...result.findings, ...result.decisions.flatMap((item) => item.findings)].map((item) => item.code));
};

describe("compileMoments", () => {
  it("accepts a guarded, fresh plan", async () => {
    const result = await compileMoments({ plan: safePlan, policy: safePolicy });
    expect(result.status).toBe("clean");
    expect(result.score).toBe(100);
    expect(result.summary).toEqual({ actions: 2, commit: 2, review: 0, reject: 0 });
    expect(result.metrics.conditionalCoverage).toBe(1);
    expect(result.metrics.freshObservationCoverage).toBe(1);
    expect(result.metrics.freshCommitStateCoverage).toBe(1);
    expect(result.metrics.scopeBindingCoverage).toBe(1);
    expect(result.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.policyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("blocks the racy sample", async () => {
    const result = await compileMoments({ plan: racyPlan, policy: racyPolicy });
    expect(result.status).toBe("blocked");
    expect(result.summary.reject).toBeGreaterThanOrEqual(3);
    expect(result.score).toBeLessThan(50);
  });

  it.each([
    "observation-authority-low",
    "check-use-gap-exceeded",
    "observation-expired",
    "state-version-drift",
    "conditional-mutation-missing",
    "irreversible-revalidation-missing",
    "internally-invalidated-observation",
    "lease-scope-missing",
    "irreversible-revalidation-stale",
    "action-dependency-cycle",
    "dependency-order-invalid",
    "competing-plan-writes",
  ])("detects %s", async (code) => expect(await codes()).toContain(code));

  it("detects an unknown observation reference", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.observationId = "missing";
    expect(await codes(plan)).toContain("observation-missing");
  });

  it("requires observations for non-create mutations", async () => {
    const plan = copy(safePlan);
    delete plan.actions[0]!.observationId;
    expect(await codes(plan)).toContain("mutation-observation-missing");
  });

  it("detects observation/resource mismatches", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.observationId = "repo-v41";
    expect(await codes(plan)).toContain("observation-resource-mismatch");
  });

  it("detects commits before observation", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.commitAt = "2026-07-29T02:59:00.000Z";
    expect(await codes(plan)).toContain("commit-before-observation");
  });

  it("requires commit state for a mutation", async () => {
    const plan = copy(safePlan);
    plan.commitStates = plan.commitStates.filter((item) => item.resourceId !== "invoice/204");
    expect(await codes(plan)).toContain("commit-state-missing");
  });

  it("blocks create over an existing resource", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.kind = "create";
    expect(await codes(plan)).toContain("resource-already-exists");
  });

  it("detects commit state captured from the future", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.capturedAt = "2026-07-29T03:05:00.000Z";
    expect(await codes(plan)).toContain("commit-state-from-future");
  });

  it("requires expected version for If-Match", async () => {
    const plan = copy(safePlan);
    delete plan.actions[0]!.expectedVersion;
    expect(await codes(plan)).toContain("expected-version-missing");
  });

  it("binds expected version to the observation", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.expectedVersion = "v6";
    expect(await codes(plan)).toContain("expected-version-observation-mismatch");
  });

  it("predicts a failed If-Match condition", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.currentVersion = "v8";
    expect(await codes(plan)).toContain("if-match-would-fail");
  });

  it("detects orphan dependencies", async () => {
    const plan = copy(safePlan);
    plan.actions[1]!.dependsOnActionIds = ["phantom"];
    expect(await codes(plan)).toContain("orphan-action-dependency");
  });

  it("enforces maximum dependency depth", async () => {
    const plan = copy(safePlan);
    plan.actions.push({
      id: "publish-config", sequence: 3, kind: "read", resourceId: "repo/acme/config", commitAt: "2026-07-29T03:04:30.000Z", consistency: "none", scopeHash: "scope:repo:acme:config", irreversible: false, mutationHash: "sha256:a5d47a4311d759db69e576d9eedd6a02fcfd9cd214129fa8492ee1e9c7343def", dependsOnActionIds: ["merge-config"],
    });
    const policy = { ...safePolicy, maximumDependencyDepth: 1 };
    const result = await compileMoments({ plan, policy });
    expect(result.decisions[2]!.findings.map((item) => item.code)).toContain("dependency-depth-exceeded");
  });

  it("does not require evidence for a create targeting an absent resource", async () => {
    const plan = copy(safePlan);
    plan.actions = [{
      id: "create-record", sequence: 1, kind: "create", resourceId: "record/new", commitStateId: "create-record-state", scopeHash: "scope:record:new", commitAt: "2026-07-29T03:03:00.000Z", consistency: "if-none-match", irreversible: false, mutationHash: "sha256:911de43c0e2667e8d678415214395fe781e4c846f2e827b9e7fc53dc1061f6e1", dependsOnActionIds: [],
    }];
    plan.commitStates = [{ id: "create-record-state", actionId: "create-record", resourceId: "record/new", currentVersion: "none", capturedAt: "2026-07-29T03:02:45.000Z", exists: false, scopeHash: "scope:record:new" }];
    const result = await compileMoments({ plan, policy: safePolicy });
    expect(result.status).toBe("clean");
    expect(result.metrics.freshObservationCoverage).toBe(1);
  });

  it("creates stable hashes with a fixed compile time", async () => {
    const compiledAt = new Date("2026-07-29T03:09:00.000Z");
    const first = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt });
    const second = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt });
    expect(first.compilationHash).toBe(second.compilationHash);
  });

  it("rejects mismatched plan and policy identifiers", async () => {
    await expect(compileMoments({ plan: safePlan, policy: racyPolicy })).rejects.toThrow("different plan ids");
  });

  it("rejects stale commit-time snapshots", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.capturedAt = "2026-07-29T03:01:00.000Z";
    expect(await codes(plan)).toContain("commit-state-age-exceeded");
  });

  it("rejects an observation authority-scope mismatch", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.scopeHash = "scope:invoice:other";
    expect(await codes(plan)).toContain("scope-observation-mismatch");
  });

  it("rejects a commit-state authority-scope mismatch", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.scopeHash = "scope:invoice:other";
    expect(await codes(plan)).toContain("scope-commit-state-mismatch");
  });

  it("rejects mutations when the resource vanished", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.exists = false;
    expect(await codes(plan)).toContain("resource-missing-at-commit");
  });

  it("binds each commit state to one action", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.actionId = "merge-config";
    plan.commitStates[1]!.actionId = "settle-invoice";
    expect(await codes(plan)).toContain("commit-state-action-mismatch");
  });

  it("rejects a commit state for another resource", async () => {
    const plan = copy(safePlan);
    plan.commitStates[0]!.resourceId = "invoice/other";
    expect(await codes(plan)).toContain("commit-state-resource-mismatch");
  });

  it("rejects If-Match as a creation guard", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.kind = "create";
    expect(await codes(plan)).toContain("create-guard-invalid");
  });

  it("enforces action, observation, and edge budgets", async () => {
    const policy = { ...safePolicy, maximumActions: 1, maximumObservations: 1, maximumDependencyEdges: 0 };
    const result = await compileMoments({ plan: safePlan, policy });
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining(["action-limit-exceeded", "observation-limit-exceeded", "dependency-edge-limit-exceeded"]));
  });

  it("rejects an invalid compilation timestamp", async () => {
    await expect(compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("invalid") })).rejects.toThrow("timestamp");
  });

  it("rejects commit states targeting nonexistent actions", async () => {
    const plan = copy(safePlan);
    plan.commitStates.push({ ...copy(plan.commitStates[0]!), id: "orphan-state", actionId: "phantom-action" });
    expect(await codes(plan)).toContain("orphan-commit-state");
  });

  it("rejects commit states not selected by their action", async () => {
    const plan = copy(safePlan);
    plan.actions[0]!.commitStateId = "missing-state";
    const resultCodes = await codes(plan);
    expect(resultCodes).toContain("unbound-commit-state");
    expect(resultCodes).toContain("commit-state-missing");
  });
});
