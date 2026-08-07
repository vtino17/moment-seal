import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { compileMoments } from "./compile.js";
import { safePlan, safePolicy } from "./sample.js";
import type { AgentPlan, PlannedAction } from "./types.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("adversarial hardening", () => {
  it("analyzes a deep graph iteratively without overflowing the call stack", async () => {
    const actions: PlannedAction[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `read-${index}`,
      sequence: index,
      kind: "read",
      resourceId: `resource/${index}`,
      commitAt: "2026-07-29T03:03:00.000Z",
      consistency: "none",
      scopeHash: `scope:${index}`,
      irreversible: false,
      mutationHash: digest,
      dependsOnActionIds: index ? [`read-${index - 1}`] : [],
    }));
    const plan: AgentPlan = { planVersion: "2.0", planId: "deep-plan", observations: [], commitStates: [], actions };
    const policy = { ...safePolicy, planId: "deep-plan", maximumActions: 1_000, maximumDependencyEdges: 1_000, maximumDependencyDepth: 1_000 };
    const result = await compileMoments({ plan, policy });
    expect(result.status).toBe("clean");
    expect(result.metrics.maximumDependencyDepth).toBe(999);
  });

  it("fails closed when a graph exceeds its policy budget", async () => {
    const result = await compileMoments({ plan: safePlan, policy: { ...safePolicy, maximumActions: 0, maximumObservations: 0, maximumDependencyEdges: 0 } });
    expect(result.status).toBe("blocked");
    expect(result.findings).toHaveLength(3);
  });

  it("rejects class instances from canonical hashing", () => {
    expect(() => canonicalJson(new Date())).toThrow("plain objects");
  });

  it("rejects sparse arrays from canonical hashing", () => {
    expect(() => canonicalJson(new Array(2))).toThrow("sparse arrays");
  });

  it("rejects canonical structures deeper than the supported boundary", () => {
    let value: unknown = "leaf";
    for (let index = 0; index < 258; index += 1) value = { child: value };
    expect(() => canonicalJson(value)).toThrow("maximum depth");
  });
});
