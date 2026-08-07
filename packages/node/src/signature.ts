import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign,
  verify,
} from "node:crypto";
import {
  canonicalJson,
  compileMoments,
  hashValue,
  verifyReceipt,
  type AgentPlan,
  type MomentPolicy,
  type MomentReceipt,
  type ReceiptVerification,
} from "@momentseal/core";
import { MomentNodeError } from "./errors.js";

const DOMAIN = Buffer.from("MomentSeal\0signed-receipt\0v1\0", "utf8");
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface SignedReceiptEnvelope {
  envelopeVersion: "1.0";
  receipt: MomentReceipt;
  signature: {
    algorithm: "Ed25519";
    keyId: string;
    signedAt: string;
    value: string;
  };
}

export interface SignedReceiptVerification {
  valid: boolean;
  checks: {
    envelope: boolean;
    signature: boolean;
    keyId: boolean;
    timeline: boolean;
    receipt: boolean;
  };
  receiptVerification: ReceiptVerification | null;
  errors: string[];
}

export interface ReceiptSigner {
  algorithm: "Ed25519";
  keyId: string;
  sign(payload: Uint8Array): Promise<Uint8Array>;
}

export interface TrustedReceiptKey {
  publicKey: string | Buffer | KeyObject;
  keyId?: string;
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
}

const validTimestamp = (value: string): boolean => {
  if (!timestampPattern.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const receiptBody = (receipt: MomentReceipt): Omit<MomentReceipt, "receiptHash"> => {
  const copy = { ...receipt };
  delete (copy as Partial<MomentReceipt>).receiptHash;
  return copy;
};

const envelopeBody = (envelope: SignedReceiptEnvelope) => ({
  envelopeVersion: envelope.envelopeVersion,
  receipt: envelope.receipt,
  signature: {
    algorithm: envelope.signature.algorithm,
    keyId: envelope.signature.keyId,
    signedAt: envelope.signature.signedAt,
  },
});

const signingPayload = (envelope: SignedReceiptEnvelope): Buffer => Buffer.concat([
  DOMAIN,
  Buffer.from(canonicalJson(envelopeBody(envelope)), "utf8"),
]);

export function receiptSigningPayload(input: { receipt: MomentReceipt; keyId: string; signedAt: string }): Uint8Array {
  return signingPayload({
    envelopeVersion: "1.0",
    receipt: input.receipt,
    signature: { algorithm: "Ed25519", keyId: input.keyId, signedAt: input.signedAt, value: "" },
  });
}

const privateKeyObject = (key: string | Buffer | KeyObject, passphrase?: string | Buffer): KeyObject => {
  try {
    const object = key instanceof KeyObject
      ? key
      : createPrivateKey(passphrase === undefined ? { key, format: "pem" } : { key, format: "pem", passphrase });
    if (object.type !== "private" || object.asymmetricKeyType !== "ed25519") throw new Error("Expected an Ed25519 private key.");
    return object;
  } catch (error) {
    throw new MomentNodeError("KEY_INVALID", "Cannot load Ed25519 private key.", { cause: error });
  }
};

const publicKeyObject = (key: string | Buffer | KeyObject): KeyObject => {
  try {
    const object = key instanceof KeyObject ? key : createPublicKey(key);
    const publicKey = object.type === "private" ? createPublicKey(object) : object;
    if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Expected an Ed25519 public key.");
    return publicKey;
  } catch (error) {
    throw new MomentNodeError("KEY_INVALID", "Cannot load Ed25519 public key.", { cause: error });
  }
};

export function generateSigningKeyPair(passphrase?: string | Buffer): { privateKey: string; publicKey: string; keyId: string } {
  const { privateKey, publicKey } = passphrase === undefined
    ? generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })
    : generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase },
    });
  if (typeof privateKey !== "string" || typeof publicKey !== "string") throw new MomentNodeError("KEY_INVALID", "Key generator did not return PEM-encoded keys.");
  return { privateKey, publicKey, keyId: keyIdFromPublicKey(publicKey) };
}

export function keyIdFromPublicKey(key: string | Buffer | KeyObject): string {
  const der = publicKeyObject(key).export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("base64url")}`;
}

export async function signReceipt(input: {
  receipt: MomentReceipt;
  plan: AgentPlan;
  policy: MomentPolicy;
  privateKey: string | Buffer | KeyObject;
  passphrase?: string | Buffer;
  signedAt?: Date;
}): Promise<SignedReceiptEnvelope> {
  await assertReceiptForSigning(input.receipt, input.plan, input.policy);
  const key = privateKeyObject(input.privateKey, input.passphrase);
  return createSignedReceiptEnvelope({
    receipt: input.receipt,
    signer: {
      algorithm: "Ed25519",
      keyId: keyIdFromPublicKey(createPublicKey(key)),
      sign: async (payload) => sign(null, payload, key),
    },
    ...(input.signedAt ? { signedAt: input.signedAt } : {}),
  });
}

export async function signReceiptWithSigner(input: {
  receipt: MomentReceipt;
  plan: AgentPlan;
  policy: MomentPolicy;
  signer: ReceiptSigner;
  signedAt?: Date;
}): Promise<SignedReceiptEnvelope> {
  await assertReceiptForSigning(input.receipt, input.plan, input.policy);
  return createSignedReceiptEnvelope(input);
}

const assertReceiptForSigning = async (receipt: MomentReceipt, plan: AgentPlan, policy: MomentPolicy): Promise<void> => {
  if (receipt.receiptHash !== await hashValue(receiptBody(receipt))) throw new MomentNodeError("RECEIPT_SIGNATURE_INVALID", "Receipt hash is invalid; refusing to sign.");
  try {
    const compilation = await compileMoments({ plan, policy, compiledAt: new Date(receipt.compiledAt) });
    const verification = await verifyReceipt({ receipt, plan, policy, compilation });
    if (!verification.valid) throw new Error(verification.errors.join(" "));
  } catch (error) {
    throw new MomentNodeError("RECEIPT_SIGNATURE_INVALID", "Receipt is not independently valid for the supplied plan and policy; refusing to sign.", { cause: error });
  }
};

const createSignedReceiptEnvelope = async (input: {
  receipt: MomentReceipt;
  signer: ReceiptSigner;
  signedAt?: Date;
}): Promise<SignedReceiptEnvelope> => {
  if (input.signer.algorithm !== "Ed25519" || !/^sha256:[A-Za-z0-9_-]{43}$/.test(input.signer.keyId)) throw new MomentNodeError("KEY_INVALID", "External signer must declare Ed25519 and a SHA-256 SPKI key id.");
  const signedAt = input.signedAt ?? new Date();
  if (!Number.isFinite(signedAt.getTime()) || signedAt.getTime() < Date.parse(input.receipt.issuedAt)) throw new MomentNodeError("SIGNED_ENVELOPE_INVALID", "Signature time must be valid and cannot predate receipt issuance.");
  const envelope: SignedReceiptEnvelope = {
    envelopeVersion: "1.0",
    receipt: input.receipt,
    signature: {
      algorithm: "Ed25519",
      keyId: input.signer.keyId,
      signedAt: signedAt.toISOString(),
      value: "",
    },
  };
  let signature: Uint8Array;
  try {
    signature = await input.signer.sign(receiptSigningPayload({ receipt: envelope.receipt, keyId: envelope.signature.keyId, signedAt: envelope.signature.signedAt }));
  } catch (error) {
    throw new MomentNodeError("SIGNER_FAILED", "External receipt signer failed.", { cause: error });
  }
  if (!(signature instanceof Uint8Array) || signature.byteLength !== 64) throw new MomentNodeError("SIGNER_FAILED", "Ed25519 signer must return exactly 64 signature bytes.");
  envelope.signature.value = Buffer.from(signature).toString("base64url");
  return envelope;
};

const isEnvelope = (value: unknown): value is SignedReceiptEnvelope => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).sort().join("|") !== ["envelopeVersion", "receipt", "signature"].sort().join("|")) return false;
  if (envelope.envelopeVersion !== "1.0" || envelope.receipt === null || typeof envelope.receipt !== "object" || envelope.signature === null || typeof envelope.signature !== "object" || Array.isArray(envelope.signature)) return false;
  const signature = envelope.signature as Record<string, unknown>;
  return Object.keys(signature).sort().join("|") === ["algorithm", "keyId", "signedAt", "value"].sort().join("|")
    && signature.algorithm === "Ed25519"
    && ["keyId", "signedAt", "value"].every((field) => typeof signature[field] === "string");
};

export async function verifySignedReceipt(input: {
  envelope: unknown;
  publicKey: string | Buffer | KeyObject;
  plan: AgentPlan;
  policy: MomentPolicy;
}): Promise<SignedReceiptVerification> {
  if (!isEnvelope(input.envelope)) return { valid: false, checks: { envelope: false, signature: false, keyId: false, timeline: false, receipt: false }, receiptVerification: null, errors: ["Signed envelope structure is invalid."] };
  const envelope = input.envelope;
  let key: KeyObject;
  try {
    key = publicKeyObject(input.publicKey);
  } catch (error) {
    return { valid: false, checks: { envelope: true, signature: false, keyId: false, timeline: false, receipt: false }, receiptVerification: null, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const keyId = keyIdFromPublicKey(key);
  const keyIdValid = envelope.signature.keyId === keyId;
  const timeline = validTimestamp(envelope.signature.signedAt) && Date.parse(envelope.signature.signedAt) >= Date.parse(envelope.receipt.issuedAt);
  let signatureValid = false;
  try {
    const signature = Buffer.from(envelope.signature.value, "base64url");
    signatureValid = signature.byteLength === 64
      && signature.toString("base64url") === envelope.signature.value
      && verify(null, signingPayload(envelope), key, signature);
  } catch {
    signatureValid = false;
  }
  let receiptVerification: ReceiptVerification | null = null;
  try {
    const compilation = await compileMoments({ plan: input.plan, policy: input.policy, compiledAt: new Date(envelope.receipt.compiledAt) });
    receiptVerification = await verifyReceipt({ receipt: envelope.receipt, plan: input.plan, policy: input.policy, compilation });
  } catch {
    receiptVerification = null;
  }
  const checks = { envelope: true, signature: signatureValid, keyId: keyIdValid, timeline, receipt: receiptVerification?.valid === true };
  const errors = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => `${name} verification failed.`);
  return { valid: errors.length === 0, checks, receiptVerification, errors };
}

const trustedAtSigningTime = (key: TrustedReceiptKey, signedAt: string): boolean => {
  const signed = Date.parse(signedAt);
  const parseBoundary = (value: string | undefined): number | null => {
    if (value === undefined) return null;
    return validTimestamp(value) ? Date.parse(value) : Number.NaN;
  };
  const validFrom = parseBoundary(key.validFrom);
  const validUntil = parseBoundary(key.validUntil);
  const revokedAt = parseBoundary(key.revokedAt);
  return Number.isFinite(signed)
    && (validFrom === null || (Number.isFinite(validFrom) && signed >= validFrom))
    && (validUntil === null || (Number.isFinite(validUntil) && signed < validUntil))
    && (revokedAt === null || (Number.isFinite(revokedAt) && signed < revokedAt));
};

export async function verifySignedReceiptWithTrustStore(input: {
  envelope: unknown;
  trustedKeys: readonly TrustedReceiptKey[];
  plan: AgentPlan;
  policy: MomentPolicy;
}): Promise<SignedReceiptVerification> {
  if (!isEnvelope(input.envelope)) return verifySignedReceipt({ envelope: input.envelope, publicKey: "invalid", plan: input.plan, policy: input.policy });
  const candidates: Array<{ key: TrustedReceiptKey; derivedKeyId: string }> = [];
  for (const key of input.trustedKeys) {
    try {
      const derivedKeyId = keyIdFromPublicKey(key.publicKey);
      if (key.keyId !== undefined && key.keyId !== derivedKeyId) continue;
      if (derivedKeyId === input.envelope.signature.keyId) candidates.push({ key, derivedKeyId });
    } catch {
      continue;
    }
  }
  if (candidates.length !== 1) return {
    valid: false,
    checks: { envelope: true, signature: false, keyId: false, timeline: false, receipt: false },
    receiptVerification: null,
    errors: [candidates.length ? "Trusted key id is ambiguous." : "No trusted key matches the signed receipt."],
  };
  const candidate = candidates[0]!;
  const result = await verifySignedReceipt({ envelope: input.envelope, publicKey: candidate.key.publicKey, plan: input.plan, policy: input.policy });
  if (trustedAtSigningTime(candidate.key, input.envelope.signature.signedAt)) return result;
  return {
    ...result,
    valid: false,
    checks: { ...result.checks, keyId: false },
    errors: [...result.errors, "Trusted key was outside its signing validity window or revoked."],
  };
}
