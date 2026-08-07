import type { PlannedAction, ResourceObservation, CommitState } from "@momentseal/core";
import { MomentNodeError } from "./errors.js";

const headerInjection = /[\r\n]/;

export function assertStrongEtag(value: string): string {
  if (headerInjection.test(value) || value.startsWith("W/") || value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) throw new MomentNodeError("HTTP_ETAG_INVALID", "HTTP optimistic concurrency requires a quoted strong ETag.");
  return value;
}

export function conditionalHeaders(action: PlannedAction): Headers {
  const headers = new Headers();
  if (action.consistency === "if-match") {
    if (!action.expectedVersion) throw new MomentNodeError("HTTP_GUARD_INVALID", "If-Match action requires expectedVersion.");
    headers.set("if-match", assertStrongEtag(action.expectedVersion));
    return headers;
  }
  if (action.consistency === "if-none-match" && action.kind === "create") {
    headers.set("if-none-match", "*");
    return headers;
  }
  throw new MomentNodeError("HTTP_GUARD_INVALID", `HTTP adapter cannot enforce consistency mode ${action.consistency} for ${action.kind}.`);
}

export function captureHttpObservation(input: {
  id: string;
  resourceId: string;
  headers: Headers;
  source: string;
  authority: number;
  scopeHash: string;
  observedAt?: Date;
  ttlMs: number;
}): ResourceObservation {
  const observedAt = input.observedAt ?? new Date();
  if (!Number.isFinite(observedAt.getTime()) || !Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0) throw new MomentNodeError("HTTP_GUARD_INVALID", "Observation time and ttlMs must be valid.");
  const version = assertStrongEtag(input.headers.get("etag") ?? "");
  return {
    id: input.id,
    resourceId: input.resourceId,
    version,
    observedAt: observedAt.toISOString(),
    expiresAt: new Date(observedAt.getTime() + input.ttlMs).toISOString(),
    source: input.source,
    authority: input.authority,
    scopeHash: input.scopeHash,
  };
}

export function captureHttpCommitState(input: {
  id: string;
  actionId: string;
  resourceId: string;
  headers: Headers;
  exists: boolean;
  scopeHash: string;
  capturedAt?: Date;
}): CommitState {
  const capturedAt = input.capturedAt ?? new Date();
  if (!Number.isFinite(capturedAt.getTime())) throw new MomentNodeError("HTTP_GUARD_INVALID", "Commit-state timestamp is invalid.");
  const version = input.exists ? assertStrongEtag(input.headers.get("etag") ?? "") : "absent";
  return { id: input.id, actionId: input.actionId, resourceId: input.resourceId, currentVersion: version, capturedAt: capturedAt.toISOString(), exists: input.exists, scopeHash: input.scopeHash };
}

export async function guardedFetch(input: {
  url: string | URL;
  action: PlannedAction;
  init: RequestInit;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowedOrigins: readonly string[];
}): Promise<Response> {
  const target = new URL(input.url);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new MomentNodeError("HTTP_GUARD_INVALID", "Guarded HTTP target must use HTTP(S) without URL credentials.");
  if (input.allowedOrigins.length < 1 || input.allowedOrigins.length > 100 || input.allowedOrigins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || Boolean(parsed.username || parsed.password);
    } catch {
      return true;
    }
  })) throw new MomentNodeError("HTTP_GUARD_INVALID", "HTTP allowedOrigins must contain 1 to 100 canonical HTTP(S) origins.");
  if (!input.allowedOrigins.includes(target.origin)) throw new MomentNodeError("HTTP_GUARD_INVALID", `Guarded HTTP target origin is not allowed: ${target.origin}`);
  const method = (input.init.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new MomentNodeError("HTTP_GUARD_INVALID", `Guarded mutation cannot use HTTP ${method}.`);
  const timeoutMs = input.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new MomentNodeError("HTTP_GUARD_INVALID", "HTTP timeout must be an integer from 1 to 120000 milliseconds.");
  const guard = conditionalHeaders(input.action);
  const headers = new Headers(input.init.headers);
  for (const name of ["if-match", "if-none-match"]) if (headers.has(name)) throw new MomentNodeError("HTTP_GUARD_INVALID", `Caller cannot predefine ${name}; it is derived from the sealed action.`);
  guard.forEach((value, key) => headers.set(key, value));
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = input.init.signal ? AbortSignal.any([input.init.signal, timeoutSignal]) : timeoutSignal;
  const response = await (input.fetchImpl ?? globalThis.fetch)(target, { ...input.init, headers, redirect: "error", signal });
  if (response.status === 412) throw new MomentNodeError("CONCURRENCY_CONFLICT", "HTTP precondition failed; resource state changed before commit.");
  return response;
}
