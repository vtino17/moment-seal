import { hashValue } from "./canonical.js";
import type { AgentPlan, MomentCompilation, MomentPolicy, MomentReceipt, ReceiptVerification } from "./types.js";

export async function issueReceipt(input: {
  plan: AgentPlan;
  policy: MomentPolicy;
  compilation: MomentCompilation;
  issuedAt?: Date;
}): Promise<MomentReceipt> {
  if (input.compilation.status === "blocked") throw new Error("Blocked compilations cannot receive a receipt.");
  const body = {
    receiptVersion: "1.0" as const,
    planId: input.plan.planId,
    planHash: await hashValue(input.plan),
    policyHash: await hashValue(input.policy),
    compilationHash: input.compilation.compilationHash,
    compiledAt: input.compilation.compiledAt,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    committedActionIds: input.compilation.decisions.filter((item) => item.status === "commit").map((item) => item.actionId),
  };
  return { ...body, receiptHash: await hashValue(body) };
}

export async function verifyReceipt(input: {
  receipt: MomentReceipt;
  plan: AgentPlan;
  policy: MomentPolicy;
  compilation: MomentCompilation;
}): Promise<ReceiptVerification> {
  const { receipt, plan, policy, compilation } = input;
  const body = {
    receiptVersion: receipt.receiptVersion,
    planId: receipt.planId,
    planHash: receipt.planHash,
    policyHash: receipt.policyHash,
    compilationHash: receipt.compilationHash,
    compiledAt: receipt.compiledAt,
    issuedAt: receipt.issuedAt,
    committedActionIds: receipt.committedActionIds,
  };
  const checks = {
    receiptHash: receipt.receiptHash === await hashValue(body),
    planHash: receipt.planHash === await hashValue(plan),
    policyHash: receipt.policyHash === await hashValue(policy),
    compilationHash: receipt.compilationHash === compilation.compilationHash,
  };
  const errors = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => `${name} does not match.`);
  if (receipt.planId !== plan.planId || receipt.planId !== policy.planId || receipt.planId !== compilation.planId) errors.push("Plan identifiers do not match.");
  if (receipt.compiledAt !== compilation.compiledAt) errors.push("Compilation timestamp does not match.");
  return { valid: errors.length === 0, checks, errors };
}
