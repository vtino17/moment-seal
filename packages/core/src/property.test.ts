import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { compileMoments } from "./compile.js";
import { safePlan, safePolicy } from "./sample.js";
import type { AgentPlan, PlannedAction } from "./types.js";

const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseObjectKeys(child)]));
};

const cyclicReadPlan = (length: number): AgentPlan => {
  const actions: PlannedAction[] = Array.from({ length }, (_, index) => ({
    id: `action-${index}`,
    sequence: index + 1,
    kind: "read",
    resourceId: `resource/${index}`,
    commitAt: "2026-07-29T03:03:00.000Z",
    consistency: "none",
    scopeHash: `scope:resource:${index}`,
    irreversible: false,
    mutationHash: "sha256:a519bf6b107719f37fd00e45b92119cca8bc7cfc017eaa60c482553f0875cdd0",
    dependsOnActionIds: [index === 0 ? `action-${length - 1}` : `action-${index - 1}`],
  }));
  return { planVersion: "2.0", planId: "property-cycle", observations: [], commitStates: [], actions };
};

describe("property-based invariants", () => {
  it("canonical JSON is invariant to object insertion order", () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      expect(canonicalJson(reverseObjectKeys(value))).toBe(canonicalJson(value));
    }), { numRuns: 250 });
  });

  it("compilation is deterministic for the same envelope and timestamp", async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 1, max: 600_000 }),
      async (authority, maximumAge) => {
        const plan = structuredClone(safePlan);
        for (const observation of plan.observations) observation.authority = authority;
        const policy = { ...safePolicy, minimumAuthority: authority, maximumObservationAgeMs: maximumAge };
        const compiledAt = new Date("2026-07-29T03:09:00.000Z");
        const first = await compileMoments({ plan, policy, compiledAt });
        const second = await compileMoments({ plan: structuredClone(plan), policy: structuredClone(policy), compiledAt });
        expect(second).toEqual(first);
      },
    ), { numRuns: 75 });
  }, 15_000);

  it("detects every member of generated dependency cycles", async () => {
    await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 64 }), async (length) => {
      const plan = cyclicReadPlan(length);
      const result = await compileMoments({
        plan,
        policy: {
          ...safePolicy,
          planId: plan.planId,
          maximumActions: 64,
          maximumObservations: 64,
          maximumDependencyEdges: 64,
          maximumDependencyDepth: 64,
        },
        compiledAt: new Date("2026-07-29T03:09:00.000Z"),
      });
      expect(result.status).toBe("blocked");
      expect(result.decisions.flatMap((decision) => decision.findings).filter((finding) => finding.code === "action-dependency-cycle")).toHaveLength(length);
    }), { numRuns: 50 });
  });
});
