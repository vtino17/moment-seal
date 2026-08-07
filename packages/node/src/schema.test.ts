import { compileMoments, issueReceipt, safePlan, safePolicy } from "@momentseal/core";
import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateSigningKeyPair, signReceipt } from "./signature.js";

const loadSchema = async (name: string) => JSON.parse(await readFile(new URL(`../../../schemas/${name}.schema.json`, import.meta.url), "utf8")) as object;

describe("signed-receipt JSON Schema", () => {
  it("accepts generated envelopes and rejects extensions", async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
    ajv.addSchema(await loadSchema("receipt"));
    const validate = ajv.compile(await loadSchema("signed-receipt"));
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:10:00.000Z") });
    const keys = generateSigningKeyPair("test-passphrase");
    const envelope = await signReceipt({ receipt, plan: safePlan, policy: safePolicy, privateKey: keys.privateKey, passphrase: "test-passphrase", signedAt: new Date("2026-07-29T03:11:00.000Z") });
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...envelope, trusted: true })).toBe(false);
  });

  it("validates bounded receipt trust stores", async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
    const validate = ajv.compile(await loadSchema("trust-store"));
    const keys = generateSigningKeyPair("test-passphrase");
    const document = { trustStoreVersion: "1.0", keys: [{ publicKey: keys.publicKey, keyId: keys.keyId, validFrom: "2026-07-01T00:00:00.000Z" }] };
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...document, keys: [] })).toBe(false);
  });
});
