import { describe, expect, it } from "vitest";
import { canonicalJson, hashValue } from "./canonical.js";
import { compileMoments } from "./compile.js";
import { issueReceipt, verifyReceipt } from "./receipt.js";
import { racyPlan, racyPolicy, safePlan, safePolicy } from "./sample.js";

describe("canonical hashing and receipts", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe('{"a":{"b":1,"d":2},"z":1}');
  });

  it("ignores undefined object values", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("hashes equivalent objects identically", async () => {
    expect(await hashValue({ b: 2, a: 1 })).toBe(await hashValue({ a: 1, b: 2 }));
  });

  it("issues and verifies a clean receipt", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:10:00.000Z") });
    const result = await verifyReceipt({ receipt, plan: safePlan, policy: safePolicy, compilation });
    expect(result.valid).toBe(true);
    expect(receipt.committedActionIds).toEqual(["settle-invoice", "merge-config"]);
  });

  it("rejects receipts for blocked compilations", async () => {
    const compilation = await compileMoments({ plan: racyPlan, policy: racyPolicy });
    await expect(issueReceipt({ plan: racyPlan, policy: racyPolicy, compilation })).rejects.toThrow("Blocked");
  });

  it("detects a tampered receipt", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation });
    const tampered = { ...receipt, committedActionIds: [] };
    const result = await verifyReceipt({ receipt: tampered, plan: safePlan, policy: safePolicy, compilation });
    expect(result.valid).toBe(false);
    expect(result.checks.receiptHash).toBe(false);
  });

  it("detects a changed plan", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation });
    const changed = structuredClone(safePlan);
    changed.actions[0]!.mutationHash = "tampered";
    const result = await verifyReceipt({ receipt, plan: changed, policy: safePolicy, compilation });
    expect(result.checks.planHash).toBe(false);
  });
});
