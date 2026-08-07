import { createPrivateKey, createPublicKey, sign as cryptoSign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { generateSigningKeyPair } from "./signature.js";
import { loadVaultTransitSigner } from "./vault.js";

const keyMetadata = (publicKey: string) => ({
  data: {
    latest_version: 7,
    type: "ed25519",
    supports_signing: true,
    keys: { "7": { public_key: publicKey } },
  },
});

const vaultEd25519PublicKey = (publicKey: string): string => createPublicKey(publicKey)
  .export({ type: "spki", format: "der" })
  .subarray(-32)
  .toString("base64");

describe("Vault Transit Ed25519 signer", () => {
  it("loads public metadata and returns raw signature bytes", async () => {
    const keys = generateSigningKeyPair("vault-test-passphrase");
    const privateKey = createPrivateKey({ key: keys.privateKey, format: "pem", passphrase: "vault-test-passphrase" });
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method !== "POST") return Response.json(keyMetadata(vaultEd25519PublicKey(keys.publicKey)));
      const body = JSON.parse(String(init.body)) as { input: string; key_version: number };
      const signature = cryptoSign(null, Buffer.from(body.input, "base64"), privateKey);
      return Response.json({ data: { signature: `vault:v${body.key_version}:${signature.toString("base64")}` } });
    });
    const loaded = await loadVaultTransitSigner({
      address: "https://vault.example.test",
      token: "test-token",
      namespace: "engineering",
      keyName: "momentseal",
      keyVersion: 7,
      fetchImpl,
    });
    const payload = new TextEncoder().encode("canonical payload");
    const signature = await loaded.signer.sign(payload);
    expect(signature).toHaveLength(64);
    expect(loaded.signer.keyId).toBe(keys.keyId);
    expect(loaded.publicKey).toBe(keys.publicKey);
    expect(loaded.keyVersion).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const headers = new Headers(fetchImpl.mock.calls[0]![1]?.headers);
    expect(headers.get("x-vault-token")).toBe("test-token");
    expect(headers.get("x-vault-namespace")).toBe("engineering");
  });

  it("selects the latest key version by default", async () => {
    const keys = generateSigningKeyPair();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(keyMetadata(keys.publicKey)));
    const loaded = await loadVaultTransitSigner({ address: "https://vault.example.test", token: "token", keyName: "momentseal", fetchImpl });
    expect(loaded.keyVersion).toBe(7);
  });

  it("rejects malformed raw Ed25519 public keys", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(keyMetadata(Buffer.alloc(31).toString("base64"))));
    await expect(loadVaultTransitSigner({ address: "https://vault.example.test", token: "token", keyName: "momentseal", fetchImpl })).rejects.toMatchObject({ code: "KEY_INVALID" });
  });

  it("rejects unsafe transport and path configuration before a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(loadVaultTransitSigner({ address: "http://vault.example.test", token: "token", keyName: "momentseal", fetchImpl })).rejects.toMatchObject({ code: "KEY_INVALID" });
    await expect(loadVaultTransitSigner({ address: "https://vault.example.test/api", token: "token", keyName: "momentseal", fetchImpl })).rejects.toMatchObject({ code: "KEY_INVALID" });
    await expect(loadVaultTransitSigner({ address: "http://127.0.0.1:8200", token: "token", keyName: "../escape", allowInsecureDevelopment: true, fetchImpl })).rejects.toMatchObject({ code: "KEY_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows explicit loopback-only HTTP development mode", async () => {
    const keys = generateSigningKeyPair();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(keyMetadata(keys.publicKey)));
    await expect(loadVaultTransitSigner({ address: "http://127.0.0.1:8200", token: "token", keyName: "momentseal", allowInsecureDevelopment: true, fetchImpl })).resolves.toMatchObject({ keyVersion: 7 });
  });

  it("fails closed on status, metadata, version, and signature format errors", async () => {
    const keys = generateSigningKeyPair();
    await expect(loadVaultTransitSigner({ address: "https://vault.example.test", token: "token", keyName: "momentseal", fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 403 })) })).rejects.toMatchObject({ code: "SIGNER_FAILED" });
    await expect(loadVaultTransitSigner({ address: "https://vault.example.test", token: "token", keyName: "momentseal", fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { type: "rsa-2048" } })) })).rejects.toMatchObject({ code: "KEY_INVALID" });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(keyMetadata(keys.publicKey)))
      .mockResolvedValueOnce(Response.json({ data: { signature: `vault:v8:${Buffer.alloc(64).toString("base64")}` } }));
    const loaded = await loadVaultTransitSigner({ address: "https://vault.example.test", token: "token", keyName: "momentseal", fetchImpl });
    await expect(loaded.signer.sign(new Uint8Array([1]))).rejects.toMatchObject({ code: "SIGNER_FAILED" });
  });
});
