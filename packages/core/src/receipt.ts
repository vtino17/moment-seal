import { hashValue } from "./canonical.js";
import { compileMoments } from "./compile.js";
import type { AgentPlan, MomentCompilation, MomentPolicy, MomentReceipt, ReceiptVerification } from "./types.js";

const compilationBody = (compilation: MomentCompilation): Omit<MomentCompilation, "compilationHash"> => {
  const copy = { ...compilation };
  delete (copy as Partial<MomentCompilation>).compilationHash;
  return copy;
};

const receiptBody = (receipt: MomentReceipt): Omit<MomentReceipt, "receiptHash"> => ({
  receiptVersion: receipt.receiptVersion,
  planId: receipt.planId,
  planHash: receipt.planHash,
  policyHash: receipt.policyHash,
  compilationHash: receipt.compilationHash,
  compiledAt: receipt.compiledAt,
  issuedAt: receipt.issuedAt,
  committedActionIds: receipt.committedActionIds,
});

const validTimestamp = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};
const isReceipt = (value: unknown): value is MomentReceipt => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const expectedKeys = ["committedActionIds", "compilationHash", "compiledAt", "issuedAt", "planHash", "planId", "policyHash", "receiptHash", "receiptVersion"];
  return Object.keys(item).sort().join("\u0000") === expectedKeys.sort().join("\u0000")
    && item.receiptVersion === "2.0"
    && ["planId", "planHash", "policyHash", "compilationHash", "compiledAt", "issuedAt", "receiptHash"].every((field) => typeof item[field] === "string")
    && Array.isArray(item.committedActionIds)
    && item.committedActionIds.every((id) => typeof id === "string");
};

export async function issueReceipt(input: {
  plan: AgentPlan;
  policy: MomentPolicy;
  compilation: MomentCompilation;
  issuedAt?: Date;
}): Promise<MomentReceipt> {
  const { plan, policy, compilation } = input;
  if (compilation.status !== "clean") throw new Error("Only clean compilations can receive a receipt.");
  const trustedCompilation = await compileMoments({ plan, policy, compiledAt: new Date(compilation.compiledAt) });
  const [planHash, policyHash, compilationHash] = await Promise.all([
    hashValue(plan),
    hashValue(policy),
    hashValue(compilationBody(compilation)),
  ]);
  if (compilation.planId !== plan.planId || policy.planId !== plan.planId) throw new Error("Compilation, plan, and policy identifiers do not match.");
  if (compilation.planHash !== planHash || compilation.policyHash !== policyHash || compilation.compilationHash !== compilationHash || compilation.compilationHash !== trustedCompilation.compilationHash) throw new Error("Compilation is not bound to the supplied plan and policy.");
  const issuedAt = input.issuedAt ?? new Date();
  if (!Number.isFinite(issuedAt.getTime()) || issuedAt.getTime() < Date.parse(compilation.compiledAt)) throw new Error("Receipt issuance time must be valid and cannot predate compilation.");
  const body = {
    receiptVersion: "2.0" as const,
    planId: plan.planId,
    planHash,
    policyHash,
    compilationHash,
    compiledAt: compilation.compiledAt,
    issuedAt: issuedAt.toISOString(),
    committedActionIds: compilation.decisions.filter((item) => item.status === "commit").map((item) => item.actionId),
  };
  return { ...body, receiptHash: await hashValue(body) };
}

export async function verifyReceipt(input: {
  receipt: unknown;
  plan: AgentPlan;
  policy: MomentPolicy;
  compilation: MomentCompilation;
}): Promise<ReceiptVerification> {
  if (!isReceipt(input.receipt)) {
    return { valid: false, checks: { receiptHash: false, planHash: false, policyHash: false, compilationHash: false, committedActions: false, timeline: false }, errors: ["Receipt structure is invalid."] };
  }
  const { receipt, plan, policy, compilation } = input;
  let trustedCompilation: MomentCompilation;
  try {
    trustedCompilation = await compileMoments({ plan, policy, compiledAt: new Date(receipt.compiledAt) });
  } catch (error) {
    return { valid: false, checks: { receiptHash: false, planHash: false, policyHash: false, compilationHash: false, committedActions: false, timeline: false }, errors: [`Cannot reproduce compilation: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const expectedActions = trustedCompilation.decisions.filter((item) => item.status === "commit").map((item) => item.actionId);
  const timelineValid = receipt.receiptVersion === "2.0"
    && validTimestamp(receipt.compiledAt)
    && validTimestamp(receipt.issuedAt)
    && receipt.compiledAt === trustedCompilation.compiledAt
    && Date.parse(receipt.issuedAt) >= Date.parse(receipt.compiledAt)
    && receipt.planId === plan.planId
    && receipt.planId === policy.planId
    && receipt.planId === trustedCompilation.planId;
  const [expectedReceiptHash, expectedPlanHash, expectedPolicyHash, expectedCompilationHash, providedCompilationHash] = await Promise.all([
    hashValue(receiptBody(receipt)),
    hashValue(plan),
    hashValue(policy),
    Promise.resolve(trustedCompilation.compilationHash),
    hashValue(compilationBody(compilation)),
  ]);
  const checks = {
    receiptHash: receipt.receiptHash === expectedReceiptHash,
    planHash: receipt.planHash === expectedPlanHash && compilation.planHash === expectedPlanHash && trustedCompilation.planHash === expectedPlanHash,
    policyHash: receipt.policyHash === expectedPolicyHash && compilation.policyHash === expectedPolicyHash && trustedCompilation.policyHash === expectedPolicyHash,
    compilationHash: receipt.compilationHash === expectedCompilationHash && compilation.compilationHash === expectedCompilationHash && providedCompilationHash === expectedCompilationHash,
    committedActions: JSON.stringify(receipt.committedActionIds) === JSON.stringify(expectedActions),
    timeline: timelineValid,
  };
  const errors = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => `${name} does not match.`);
  return { valid: errors.length === 0 && trustedCompilation.status === "clean", checks, errors: trustedCompilation.status === "clean" ? errors : [...errors, "Compilation is not clean."] };
}
