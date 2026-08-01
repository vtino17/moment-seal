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
}): Promise<Response> {
  const method = (input.init.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new MomentNodeError("HTTP_GUARD_INVALID", `Guarded mutation cannot use HTTP ${method}.`);
  const guard = conditionalHeaders(input.action);
  const headers = new Headers(input.init.headers);
  for (const name of ["if-match", "if-none-match"]) if (headers.has(name)) throw new MomentNodeError("HTTP_GUARD_INVALID", `Caller cannot predefine ${name}; it is derived from the sealed action.`);
  guard.forEach((value, key) => headers.set(key, value));
  const response = await (input.fetchImpl ?? globalThis.fetch)(input.url, { ...input.init, headers, redirect: "error" });
  if (response.status === 412) throw new MomentNodeError("CONCURRENCY_CONFLICT", "HTTP precondition failed; resource state changed before commit.");
  return response;
}
