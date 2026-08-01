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
  privateKey: string | Buffer | KeyObject;
  passphrase?: string | Buffer;
  signedAt?: Date;
}): Promise<SignedReceiptEnvelope> {
  if (input.receipt.receiptHash !== await hashValue(receiptBody(input.receipt))) throw new MomentNodeError("RECEIPT_SIGNATURE_INVALID", "Receipt hash is invalid; refusing to sign.");
  const key = privateKeyObject(input.privateKey, input.passphrase);
  const signedAt = input.signedAt ?? new Date();
  if (!Number.isFinite(signedAt.getTime()) || signedAt.getTime() < Date.parse(input.receipt.issuedAt)) throw new MomentNodeError("SIGNED_ENVELOPE_INVALID", "Signature time must be valid and cannot predate receipt issuance.");
  const envelope: SignedReceiptEnvelope = {
    envelopeVersion: "1.0",
    receipt: input.receipt,
    signature: {
      algorithm: "Ed25519",
      keyId: keyIdFromPublicKey(createPublicKey(key)),
      signedAt: signedAt.toISOString(),
      value: "",
    },
  };
  envelope.signature.value = sign(null, signingPayload(envelope), key).toString("base64url");
  return envelope;
}

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
    signatureValid = verify(null, signingPayload(envelope), key, Buffer.from(envelope.signature.value, "base64url"));
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
