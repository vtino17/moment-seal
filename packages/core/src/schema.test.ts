import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileMoments } from "./compile.js";
import { issueReceipt } from "./receipt.js";
import { racyPlan, racyPolicy, safePlan, safePolicy } from "./sample.js";

const loadSchema = async (name: string) => JSON.parse(await readFile(new URL(`../../../schemas/${name}.schema.json`, import.meta.url), "utf8")) as object;
const validators = async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
  return {
    plan: ajv.compile(await loadSchema("plan")),
    policy: ajv.compile(await loadSchema("policy")),
    receipt: ajv.compile(await loadSchema("receipt")),
  };
};

describe("JSON Schema contracts", () => {
  it("accepts every bundled plan and policy", async () => {
    const validate = await validators();
    expect(validate.plan(safePlan), JSON.stringify(validate.plan.errors)).toBe(true);
    expect(validate.plan(racyPlan), JSON.stringify(validate.plan.errors)).toBe(true);
    expect(validate.policy(safePolicy), JSON.stringify(validate.policy.errors)).toBe(true);
    expect(validate.policy(racyPolicy), JSON.stringify(validate.policy.errors)).toBe(true);
  });

  it("accepts an issued receipt", async () => {
    const validate = await validators();
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:10:00.000Z") });
    expect(validate.receipt(receipt), JSON.stringify(validate.receipt.errors)).toBe(true);
  });

  it("rejects legacy contracts and malformed digests", async () => {
    const validate = await validators();
    const legacy = { ...structuredClone(safePlan), planVersion: "1.0" };
    expect(validate.plan(legacy)).toBe(false);
    const malformed = structuredClone(safePlan);
    malformed.actions[0]!.mutationHash = "sha256:nope";
    expect(validate.plan(malformed)).toBe(false);
  });

  it("enforces policy resource ceilings", async () => {
    const validate = await validators();
    expect(validate.policy({ ...safePolicy, maximumActions: 10_001 })).toBe(false);
  });
});
