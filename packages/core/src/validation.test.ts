import { describe, expect, it } from "vitest";
import { safePlan, safePolicy } from "./sample.js";
import { assertPlan, assertPolicy } from "./validation.js";

const copy = <T>(value: T): T => structuredClone(value);

describe("schema validation", () => {
  it("accepts the sample schema", () => {
    expect(() => assertPlan(safePlan)).not.toThrow();
    expect(() => assertPolicy(safePolicy)).not.toThrow();
  });

  it("rejects duplicate observations", () => {
    const plan = copy(safePlan);
    plan.observations.push(copy(plan.observations[0]!));
    expect(() => assertPlan(plan)).toThrow("Duplicate observation");
  });

  it("rejects duplicate commit states", () => {
    const plan = copy(safePlan);
    plan.commitStates.push(copy(plan.commitStates[0]!));
    expect(() => assertPlan(plan)).toThrow("Duplicate commit state");
  });

  it("rejects duplicate actions", () => {
    const plan = copy(safePlan);
    plan.actions.push({ ...copy(plan.actions[0]!), sequence: 9 });
    expect(() => assertPlan(plan)).toThrow("Duplicate action id");
  });

  it("rejects duplicate action sequence numbers", () => {
    const plan = copy(safePlan);
    plan.actions[1]!.sequence = 1;
    expect(() => assertPlan(plan)).toThrow("Duplicate action sequence");
  });

  it("rejects invalid authority", () => {
    const plan = copy(safePlan);
    plan.observations[0]!.authority = 101;
    expect(() => assertPlan(plan)).toThrow("authority");
  });

  it("rejects backwards expiry", () => {
    const plan = copy(safePlan);
    plan.observations[0]!.expiresAt = "2026-07-29T02:00:00.000Z";
    expect(() => assertPlan(plan)).toThrow("expire after");
  });

  it("rejects unknown action kinds", () => {
    const plan = copy(safePlan) as unknown as { actions: Array<Record<string, unknown>> };
    plan.actions[0]!.kind = "teleport";
    expect(() => assertPlan(plan)).toThrow("Unknown action kind");
  });

  it("rejects unknown consistency modes", () => {
    const plan = copy(safePlan) as unknown as { actions: Array<Record<string, unknown>> };
    plan.actions[0]!.consistency = "hope";
    expect(() => assertPlan(plan)).toThrow("Unknown consistency mode");
  });

  it("rejects policy authority over 100", () => {
    expect(() => assertPolicy({ ...safePolicy, minimumAuthority: 101 })).toThrow("must not exceed");
  });

  it("rejects non-canonical timestamps", () => {
    const plan = copy(safePlan);
    plan.actions[0]!.commitAt = "2026-07-29T03:03:00Z";
    expect(() => assertPlan(plan)).toThrow("canonical UTC");
  });

  it("rejects malformed mutation digests", () => {
    const plan = copy(safePlan);
    plan.actions[0]!.mutationHash = "sha256:not-a-digest";
    expect(() => assertPlan(plan)).toThrow("mutation hash");
  });

  it("rejects partial revalidation evidence", () => {
    const plan = copy(safePlan);
    delete plan.actions[0]!.revalidatedVersion;
    expect(() => assertPlan(plan)).toThrow("supplied together");
  });

  it("rejects duplicate commit-state action bindings", () => {
    const plan = copy(safePlan);
    plan.commitStates[1]!.actionId = plan.commitStates[0]!.actionId;
    expect(() => assertPlan(plan)).toThrow("Multiple commit states");
  });

  it("rejects excessive direct dependencies before graph analysis", () => {
    const plan = copy(safePlan);
    plan.actions[0]!.dependsOnActionIds = Array.from({ length: 257 }, (_, index) => `dependency-${index}`);
    expect(() => assertPlan(plan)).toThrow("Invalid action fields");
  });
});
