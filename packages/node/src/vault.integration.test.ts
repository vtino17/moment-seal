import { compileMoments, issueReceipt, safePlan, safePolicy } from "@momentseal/core";
import { beforeAll, describe, expect, it } from "vitest";
import { signReceiptWithSigner, verifySignedReceipt } from "./signature.js";
import { loadVaultTransitSigner } from "./vault.js";

const address = process.env.MOMENTSEAL_VAULT_ADDR;
const token = process.env.MOMENTSEAL_VAULT_TOKEN;
const enabled = Boolean(address && token);
const provision = process.env.MOMENTSEAL_INTEGRATION_PROVISION === "true";
const keyName = process.env.MOMENTSEAL_VAULT_KEY_NAME ?? "momentseal-integration";
const mount = process.env.MOMENTSEAL_VAULT_MOUNT ?? "transit";
const configuredKeyVersion = process.env.MOMENTSEAL_VAULT_KEY_VERSION;
const keyVersion = configuredKeyVersion === undefined ? undefined : Number(configuredKeyVersion);

const vaultRequest = async (path: string, body: Record<string, unknown>): Promise<void> => {
  const response = await fetch(new URL(path, address!), {
    method: "POST",
    headers: { "content-type": "application/json", "x-vault-token": token! },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Vault integration setup failed with status ${response.status}.`);
};

describe.runIf(enabled)("Vault Transit integration", () => {
  beforeAll(async () => {
    if (!provision) return;
    await vaultRequest(`/v1/sys/mounts/${mount}`, { type: "transit" });
    await vaultRequest(`/v1/${mount}/keys/${keyName}`, { type: "ed25519", exportable: false, allow_plaintext_backup: false });
  });

  it("signs and verifies a receipt while the private key remains in Vault", async () => {
    const loaded = await loadVaultTransitSigner({
      address: address!,
      token: token!,
      keyName,
      mount,
      ...(keyVersion === undefined ? {} : { keyVersion }),
      allowInsecureDevelopment: process.env.MOMENTSEAL_VAULT_ALLOW_INSECURE_DEVELOPMENT === "true",
    });
    const compilation = await compileMoments({ plan: safePlan, policy: safePolicy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
    const receipt = await issueReceipt({ plan: safePlan, policy: safePolicy, compilation, issuedAt: new Date("2026-07-29T03:10:00.000Z") });
    const envelope = await signReceiptWithSigner({ receipt, plan: safePlan, policy: safePolicy, signer: loaded.signer, signedAt: new Date("2026-07-29T03:11:00.000Z") });
    await expect(verifySignedReceipt({ envelope, publicKey: loaded.publicKey, plan: safePlan, policy: safePolicy })).resolves.toMatchObject({ valid: true });
    expect(loaded.keyVersion).toBeGreaterThanOrEqual(1);
  });
});
