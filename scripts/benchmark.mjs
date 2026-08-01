import { performance } from "node:perf_hooks";
import { compileMoments, safePolicy } from "../packages/core/dist/index.js";

const actionCount = Number.parseInt(process.env.MOMENTSEAL_BENCHMARK_ACTIONS ?? "5000", 10);
const budgetMs = Number.parseInt(process.env.MOMENTSEAL_BENCHMARK_BUDGET_MS ?? "5000", 10);
if (!Number.isSafeInteger(actionCount) || actionCount < 1 || actionCount > 25_000) throw new Error("MOMENTSEAL_BENCHMARK_ACTIONS must be an integer between 1 and 25000.");
if (!Number.isSafeInteger(budgetMs) || budgetMs < 1) throw new Error("MOMENTSEAL_BENCHMARK_BUDGET_MS must be a positive integer.");

const actions = Array.from({ length: actionCount }, (_, index) => ({
  id: `read-${index}`,
  sequence: index + 1,
  kind: "read",
  resourceId: `resource/${index}`,
  commitAt: "2026-07-29T03:03:00.000Z",
  consistency: "none",
  scopeHash: `scope:resource:${index}`,
  irreversible: false,
  mutationHash: "sha256:a519bf6b107719f37fd00e45b92119cca8bc7cfc017eaa60c482553f0875cdd0",
  dependsOnActionIds: index === 0 ? [] : [`read-${index - 1}`],
}));
const plan = { planVersion: "2.0", planId: "benchmark-plan", observations: [], commitStates: [], actions };
const policy = {
  ...safePolicy,
  planId: plan.planId,
  maximumActions: actionCount,
  maximumObservations: actionCount,
  maximumDependencyEdges: actionCount,
  maximumDependencyDepth: actionCount,
};

const started = performance.now();
const result = await compileMoments({ plan, policy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
const elapsedMs = performance.now() - started;
const report = {
  actionCount,
  dependencyEdges: actionCount - 1,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  actionsPerSecond: Math.round(actionCount / (elapsedMs / 1000)),
  budgetMs,
  withinBudget: elapsedMs <= budgetMs,
  status: result.status,
};
console.log(JSON.stringify(report, null, 2));
if (!report.withinBudget) process.exitCode = 1;
