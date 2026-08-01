import { MomentNodeError } from "./errors.js";
import { keyIdFromPublicKey, type ReceiptSigner } from "./signature.js";

const namePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_RESPONSE_BYTES = 256 * 1024;

export interface VaultTransitOptions {
  address: string | URL;
  token: string;
  keyName: string;
  mount?: string;
  keyVersion?: number;
  namespace?: string;
  timeoutMs?: number;
  allowInsecureDevelopment?: boolean;
  fetchImpl?: typeof fetch;
}

export interface LoadedVaultTransitSigner {
  signer: ReceiptSigner;
  publicKey: string;
  keyVersion: number;
}

interface VaultConfiguration {
  baseUrl: URL;
  token: string;
  keyName: string;
  mount: string;
  keyVersion?: number;
  namespace?: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}

const failConfig = (message: string): never => {
  throw new MomentNodeError("KEY_INVALID", message);
};

const configuration = (options: VaultTransitOptions): VaultConfiguration => {
  let baseUrl: URL;
  try {
    baseUrl = new URL(options.address);
  } catch (error) {
    throw new MomentNodeError("KEY_INVALID", "Vault address must be an absolute URL.", { cause: error });
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || (baseUrl.pathname !== "/" && baseUrl.pathname !== "")) failConfig("Vault address must be an origin without credentials, path, query, or fragment.");
  if (baseUrl.protocol !== "https:") {
    const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname);
    if (baseUrl.protocol !== "http:" || options.allowInsecureDevelopment !== true || !loopback) failConfig("Vault requires HTTPS; insecure development mode is limited to loopback addresses.");
  }
  const mount = options.mount ?? "transit";
  if (!namePattern.test(mount) || !namePattern.test(options.keyName)) failConfig("Vault mount and key names must be safe single path segments.");
  if (!options.token || options.token.length > 16_384 || /[\r\n]/.test(options.token)) failConfig("Vault token is missing or malformed.");
  if (options.namespace !== undefined && (!options.namespace || options.namespace.length > 256 || /[\r\n]/.test(options.namespace))) failConfig("Vault namespace is malformed.");
  if (options.keyVersion !== undefined && (!Number.isSafeInteger(options.keyVersion) || options.keyVersion < 1)) failConfig("Vault key version must be a positive integer.");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) failConfig("Vault timeout must be an integer from 1 to 120000 milliseconds.");
  baseUrl.pathname = "/";
  return {
    baseUrl,
    token: options.token,
    keyName: options.keyName,
    mount,
    ...(options.keyVersion === undefined ? {} : { keyVersion: options.keyVersion }),
    ...(options.namespace === undefined ? {} : { namespace: options.namespace }),
    timeoutMs,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  };
};

const request = async (config: VaultConfiguration, path: string, init: RequestInit = {}): Promise<unknown> => {
  const headers = new Headers(init.headers);
  headers.set("x-vault-token", config.token);
  headers.set("accept", "application/json");
  if (config.namespace !== undefined) headers.set("x-vault-namespace", config.namespace);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await config.fetchImpl(new URL(path, config.baseUrl), {
      ...init,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new MomentNodeError("SIGNER_FAILED", "Vault Transit request failed.", { cause: error });
  }
  if (!response.ok) throw new MomentNodeError("SIGNER_FAILED", `Vault Transit request failed with status ${response.status}.`);
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new MomentNodeError("SIGNER_FAILED", "Vault Transit response exceeded the size limit.");
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new MomentNodeError("SIGNER_FAILED", "Vault Transit returned invalid JSON.", { cause: error });
  }
};

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export async function loadVaultTransitSigner(options: VaultTransitOptions): Promise<LoadedVaultTransitSigner> {
  const config = configuration(options);
  const keyResponse = record(await request(config, `/v1/${encodeURIComponent(config.mount)}/keys/${encodeURIComponent(config.keyName)}`));
  const data = record(keyResponse?.data);
  const latestVersion = data?.latest_version;
  const keyVersion = config.keyVersion ?? latestVersion;
  const keys = record(data?.keys);
  const key = record(typeof keyVersion === "number" ? keys?.[String(keyVersion)] : undefined);
  const publicKey = key?.public_key;
  if (data?.type !== "ed25519" || data.supports_signing !== true || !Number.isSafeInteger(keyVersion) || (keyVersion as number) < 1 || typeof publicKey !== "string") throw new MomentNodeError("KEY_INVALID", "Vault key metadata is not a usable Ed25519 signing key.");
  const resolvedVersion = keyVersion as number;
  const keyId = keyIdFromPublicKey(publicKey);
  const signer: ReceiptSigner = {
    algorithm: "Ed25519",
    keyId,
    sign: async (payload) => {
      const response = record(await request(config, `/v1/${encodeURIComponent(config.mount)}/sign/${encodeURIComponent(config.keyName)}`, {
        method: "POST",
        body: JSON.stringify({ input: Buffer.from(payload).toString("base64"), key_version: resolvedVersion }),
      }));
      const signature = record(response?.data)?.signature;
      const match = typeof signature === "string" ? /^vault:v([1-9][0-9]*):([A-Za-z0-9+/]+={0,2})$/.exec(signature) : null;
      if (!match || Number(match[1]) !== resolvedVersion) throw new MomentNodeError("SIGNER_FAILED", "Vault Transit returned an invalid signature envelope.");
      const bytes = Buffer.from(match[2]!, "base64");
      if (bytes.byteLength !== 64 || bytes.toString("base64") !== match[2]) throw new MomentNodeError("SIGNER_FAILED", "Vault Transit returned a non-canonical Ed25519 signature.");
      return bytes;
    },
  };
  return { signer, publicKey, keyVersion: resolvedVersion };
}
