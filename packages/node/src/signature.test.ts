import { compileMoments, hashValue, issueReceipt, safePlan, safePolicy } from "@momentseal/core";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSigningKeyPair, keyIdFromPublicKey, signReceipt, signReceiptWithSigner, verifySignedReceipt, verifySignedReceiptWithTrustStore } from "./signature.js";

const fixture = async () => {
  const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
  const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:10:00.000Z") });
  const keys = generateSigningKeyPair("test-passphrase");
  const envelope = await signReceipt({ receipt, plan: safePlan, policy: safePolicy, privateKey: keys.privateKey, passphrase: "test-passphrase", signedAt: new Date("2026-07-29T03:11:00.000Z") });
  return { compilation, receipt, keys, envelope };
};

describe("Ed25519 receipt envelopes", () => {
  it("signs and verifies a receipt against a trusted public key", async () => {
    const { keys, envelope } = await fixture();
    const result = await verifySignedReceipt({ envelope, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.valid).toBe(true);
    expect(result.checks).toEqual({ envelope: true, signature: true, keyId: true, timeline: true, receipt: true });
    expect(envelope.signature.algorithm).toBe("Ed25519");
  });

  it("derives a stable key id from SPKI public key bytes", async () => {
    const { keys, envelope } = await fixture();
    expect(keys.keyId).toBe(keyIdFromPublicKey(keys.publicKey));
    expect(envelope.signature.keyId).toBe(keys.keyId);
    expect(keys.keyId).toMatch(/^sha256:[A-Za-z0-9_-]{43}$/);
  });

  it("rejects an untrusted public key", async () => {
    const { envelope } = await fixture();
    const other = generateSigningKeyPair("other-passphrase");
    const result = await verifySignedReceipt({ envelope, publicKey: other.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.valid).toBe(false);
    expect(result.checks.keyId).toBe(false);
    expect(result.checks.signature).toBe(false);
  });

  it("supports explicitly unencrypted development keys", async () => {
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:10:00.000Z") });
    const keys = generateSigningKeyPair();
    const envelope = await signReceipt({ receipt, plan: safePlan, policy: safePolicy, privateKey: keys.privateKey, signedAt: new Date("2026-07-29T03:11:00.000Z") });
    await expect(verifySignedReceipt({ envelope, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy })).resolves.toMatchObject({ valid: true });
  });

  it("supports asynchronous KMS and HSM signer adapters", async () => {
    const { receipt } = await fixture();
    const keys = generateSigningKeyPair("kms-passphrase");
    const privateKey = createPrivateKey({ key: keys.privateKey, format: "pem", passphrase: "kms-passphrase" });
    const envelope = await signReceiptWithSigner({
      receipt,
      plan: safePlan,
      policy: safePolicy,
      signer: { algorithm: "Ed25519", keyId: keys.keyId, sign: async (payload) => cryptoSign(null, payload, privateKey) },
      signedAt: new Date("2026-07-29T03:11:00.000Z"),
    });
    await expect(verifySignedReceipt({ envelope, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy })).resolves.toMatchObject({ valid: true });
  });

  it("fails closed when an external signer errors or returns a malformed signature", async () => {
    const { receipt, keys } = await fixture();
    await expect(signReceiptWithSigner({ receipt, plan: safePlan, policy: safePolicy, signer: { algorithm: "Ed25519", keyId: keys.keyId, sign: async () => { throw new Error("KMS unavailable"); } } })).rejects.toMatchObject({ code: "SIGNER_FAILED" });
    await expect(signReceiptWithSigner({ receipt, plan: safePlan, policy: safePolicy, signer: { algorithm: "Ed25519", keyId: keys.keyId, sign: async () => new Uint8Array(63) } })).rejects.toMatchObject({ code: "SIGNER_FAILED" });
    await expect(signReceiptWithSigner({ receipt, plan: safePlan, policy: safePolicy, signer: { algorithm: "Ed25519", keyId: "caller-controlled", sign: async () => new Uint8Array(64) } })).rejects.toMatchObject({ code: "KEY_INVALID" });
  });

  it("fails closed for malformed or inaccessible keys", async () => {
    const { receipt, envelope } = await fixture();
    await expect(signReceipt({ receipt, plan: safePlan, policy: safePolicy, privateKey: "not-a-key" })).rejects.toMatchObject({ code: "KEY_INVALID" });
    await expect(signReceipt({ receipt, plan: safePlan, policy: safePolicy, privateKey: generateSigningKeyPair("right-passphrase").privateKey, passphrase: "wrong-passphrase" })).rejects.toMatchObject({ code: "KEY_INVALID" });
    const result = await verifySignedReceipt({ envelope, publicKey: "not-a-key", plan: safePlan, policy: safePolicy });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Cannot load Ed25519 public key");
  });

  it("detects receipt mutation after signing", async () => {
    const { keys, envelope } = await fixture();
    const tampered = structuredClone(envelope);
    tampered.receipt.committedActionIds = [];
    const result = await verifySignedReceipt({ envelope: tampered, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.valid).toBe(false);
    expect(result.checks.signature).toBe(false);
    expect(result.checks.receipt).toBe(false);
  });

  it("rejects non-canonical Base64URL even when it decodes to the same signature bytes", async () => {
    const { keys, envelope } = await fixture();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const tampered = structuredClone(envelope);
    const last = tampered.signature.value.at(-1)!;
    const nonCanonical = alphabet[alphabet.indexOf(last) + 1]!;
    tampered.signature.value = `${tampered.signature.value.slice(0, -1)}${nonCanonical}`;
    expect(Buffer.from(tampered.signature.value, "base64url")).toEqual(Buffer.from(envelope.signature.value, "base64url"));
    const result = await verifySignedReceipt({ envelope: tampered, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.valid).toBe(false);
    expect(result.checks.signature).toBe(false);
  });

  it("detects a rehashed receipt because the signature covers it", async () => {
    const { keys, envelope } = await fixture();
    const tampered = structuredClone(envelope);
    tampered.receipt.committedActionIds = [];
    const body: Record<string, unknown> = { ...tampered.receipt };
    delete body.receiptHash;
    tampered.receipt.receiptHash = await hashValue(body);
    const result = await verifySignedReceipt({ envelope: tampered, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.checks.signature).toBe(false);
    expect(result.checks.receipt).toBe(false);
  });

  it("refuses to sign an invalid receipt hash", async () => {
    const { keys, receipt } = await fixture();
    await expect(signReceipt({ receipt: { ...receipt, receiptHash: "0".repeat(64) }, plan: safePlan, policy: safePolicy, privateKey: keys.privateKey, passphrase: "test-passphrase" })).rejects.toMatchObject({ code: "RECEIPT_SIGNATURE_INVALID" });
    const semanticallyInvalid = { ...receipt, committedActionIds: [] as string[] };
    const body: Record<string, unknown> = { ...semanticallyInvalid };
    delete body.receiptHash;
    semanticallyInvalid.receiptHash = await hashValue(body);
    await expect(signReceipt({ receipt: semanticallyInvalid, plan: safePlan, policy: safePolicy, privateKey: keys.privateKey, passphrase: "test-passphrase" })).rejects.toMatchObject({ code: "RECEIPT_SIGNATURE_INVALID" });
  });

  it("refuses signature timestamps before receipt issuance", async () => {
    const { keys, receipt } = await fixture();
    await expect(signReceipt({ receipt, plan: safePlan, policy: safePolicy, privateKey: keys.privateKey, passphrase: "test-passphrase", signedAt: new Date("2026-07-29T03:09:30.000Z") })).rejects.toMatchObject({ code: "SIGNED_ENVELOPE_INVALID" });
  });

  it("rejects envelope extension fields", async () => {
    const { keys, envelope } = await fixture();
    const result = await verifySignedReceipt({ envelope: { ...envelope, trusted: true }, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.checks.envelope).toBe(false);
  });

  it("rejects malformed envelope structure and signature time", async () => {
    const { keys, envelope } = await fixture();
    await expect(verifySignedReceipt({ envelope: null, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy })).resolves.toMatchObject({ valid: false, checks: { envelope: false } });
    const malformed = structuredClone(envelope);
    malformed.signature.signedAt = "not-a-timestamp";
    const result = await verifySignedReceipt({ envelope: malformed, publicKey: keys.publicKey, plan: safePlan, policy: safePolicy });
    expect(result.valid).toBe(false);
    expect(result.checks.timeline).toBe(false);
    expect(result.checks.signature).toBe(false);
  });

  it("verifies rotated keys through a bounded trust store", async () => {
    const { keys, envelope } = await fixture();
    const rotated = generateSigningKeyPair("rotated-passphrase");
    const result = await verifySignedReceiptWithTrustStore({
      envelope,
      trustedKeys: [
        { publicKey: rotated.publicKey, validFrom: "2026-08-01T00:00:00.000Z" },
        { publicKey: keys.publicKey, keyId: keys.keyId, validFrom: "2026-07-01T00:00:00.000Z", validUntil: "2026-08-01T00:00:00.000Z" },
      ],
      plan: safePlan,
      policy: safePolicy,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects expired, revoked, missing, and ambiguous trust keys", async () => {
    const { keys, envelope } = await fixture();
    const verify = (trustedKeys: Parameters<typeof verifySignedReceiptWithTrustStore>[0]["trustedKeys"]) => verifySignedReceiptWithTrustStore({ envelope, trustedKeys, plan: safePlan, policy: safePolicy });
    await expect(verify([{ publicKey: keys.publicKey, validUntil: "2026-07-29T03:11:00.000Z" }])).resolves.toMatchObject({ valid: false, checks: { keyId: false } });
    await expect(verify([{ publicKey: keys.publicKey, revokedAt: "2026-07-29T03:10:30.000Z" }])).resolves.toMatchObject({ valid: false, checks: { keyId: false } });
    await expect(verify([])).resolves.toMatchObject({ valid: false, errors: ["No trusted key matches the signed receipt."] });
    await expect(verify([{ publicKey: keys.publicKey }, { publicKey: keys.publicKey }])).resolves.toMatchObject({ valid: false, errors: ["Trusted key id is ambiguous."] });
  });
});
