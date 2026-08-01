import { describe, expect, it } from "vitest";
import { canonicalJson, hashValue } from "./canonical.js";
import { compileMoments } from "./compile.js";
import { issueReceipt, verifyReceipt } from "./receipt.js";
import { racyPlan, racyPolicy, safePlan, safePolicy } from "./sample.js";

describe("canonical hashing and receipts", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe('{"a":{"b":1,"d":2},"z":1}');
  });

  it("rejects undefined object values", () => {
    expect(() => canonicalJson({ a: 1, b: undefined })).toThrow("undefined");
  });

  it("rejects non-finite numbers and cycles", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("non-finite");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow("cyclic");
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
    await expect(issueReceipt({ plan: racyPlan, policy: racyPolicy, compilation })).rejects.toThrow("clean");
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

  it("prevents compilation laundering across plans", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const changed = structuredClone(safePlan);
    changed.actions[0]!.expectedVersion = "v6";
    await expect(issueReceipt({ plan: changed, policy: safePolicy, compilation })).rejects.toThrow("not bound");
  });

  it("detects a forged compilation body", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation });
    const forged = { ...compilation, score: 99 };
    const result = await verifyReceipt({ receipt, plan: safePlan, policy: safePolicy, compilation: forged });
    expect(result.checks.compilationHash).toBe(false);
  });

  it("checks committed action semantics even after receipt rehashing", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation });
    const changedBody = { ...receipt, committedActionIds: [] };
    const body: Record<string, unknown> = { ...changedBody };
    delete body.receiptHash;
    const forged = { ...changedBody, receiptHash: await hashValue(body) };
    const result = await verifyReceipt({ receipt: forged, plan: safePlan, policy: safePolicy, compilation });
    expect(result.checks.receiptHash).toBe(true);
    expect(result.checks.committedActions).toBe(false);
  });

  it("rejects malformed receipt structures", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const result = await verifyReceipt({ receipt: { receiptVersion: "wrong" }, plan: safePlan, policy: safePolicy, compilation });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Receipt structure is invalid.");
  });

  it("rejects receipt issuance before compilation", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
    await expect(issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:08:00.000Z") })).rejects.toThrow("predate");
  });

  it("rejects a self-rehashed fabricated compilation", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const forged = { ...compilation, score: 7 };
    const body: Record<string, unknown> = { ...forged };
    delete body.compilationHash;
    forged.compilationHash = await hashValue(body);
    await expect(issueReceipt({ plan: safePlan, policy: safePolicy, compilation: forged })).rejects.toThrow("not bound");
  });

  it("rejects receipts with unsigned extension fields", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation });
    const extended = { ...receipt, trusted: true };
    const result = await verifyReceipt({ receipt: extended, plan: safePlan, policy: safePolicy, compilation });
    expect(result.errors).toContain("Receipt structure is invalid.");
  });
});
