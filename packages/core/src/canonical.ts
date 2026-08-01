import { MomentSealError } from "./errors.js";

const MAX_CANONICAL_DEPTH = 256;
const fail = (message: string): never => { throw new MomentSealError("CANONICALIZATION_FAILED", message); };

const normalize = (value: unknown, ancestors: Set<object>, depth: number): unknown => {
  if (depth > MAX_CANONICAL_DEPTH) fail(`Canonical JSON exceeds maximum depth ${MAX_CANONICAL_DEPTH}.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Canonical JSON cannot contain non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") return fail(`Canonical JSON cannot contain ${typeof value} values.`);
  if (ancestors.has(value)) fail("Canonical JSON cannot contain cyclic references.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) fail("Canonical JSON cannot contain sparse arrays.");
      return value.map((item) => normalize(item, ancestors, depth + 1));
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) fail("Canonical JSON accepts only plain objects and arrays.");
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => {
      if (child === undefined) fail(`Canonical JSON field "${key}" is undefined.`);
      return [key, normalize(child, ancestors, depth + 1)];
    }));
  } finally {
    ancestors.delete(value);
  }
};

export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value, new Set(), 0));

export const hashValue = async (value: unknown): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
