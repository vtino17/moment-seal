import { safePlan, type PlannedAction } from "@momentseal/core";
import { describe, expect, it, vi } from "vitest";
import { assertStrongEtag, captureHttpCommitState, captureHttpObservation, conditionalHeaders, guardedFetch } from "./http.js";

const updateAction = (): PlannedAction => ({ ...structuredClone(safePlan.actions[0]!), expectedVersion: '"v7"' });

describe("HTTP optimistic concurrency adapter", () => {
  it("accepts only quoted strong ETags", () => {
    expect(assertStrongEtag('"v7"')).toBe('"v7"');
    expect(() => assertStrongEtag('W/"v7"')).toThrow("strong ETag");
    expect(() => assertStrongEtag('"v7"\r\ninjected: yes')).toThrow("strong ETag");
  });

  it("derives If-Match exclusively from the sealed action", () => {
    expect(conditionalHeaders(updateAction()).get("if-match")).toBe('"v7"');
    const missingVersion = updateAction();
    delete missingVersion.expectedVersion;
    expect(() => conditionalHeaders(missingVersion)).toThrow("requires expectedVersion");
    expect(() => conditionalHeaders({ ...updateAction(), consistency: "transaction" })).toThrow("cannot enforce");
  });

  it("derives If-None-Match star for creation", () => {
    const action: PlannedAction = { ...updateAction(), kind: "create", consistency: "if-none-match" };
    delete action.expectedVersion;
    expect(conditionalHeaders(action).get("if-none-match")).toBe("*");
  });

  it("captures observations and action-bound commit states", () => {
    const headers = new Headers({ etag: '"v7"' });
    const observation = captureHttpObservation({ id: "http-v7", resourceId: "invoice/204", headers, source: "billing", authority: 95, scopeHash: "scope:invoice:204", observedAt: new Date("2026-07-29T03:00:00.000Z"), ttlMs: 60_000 });
    const state = captureHttpCommitState({ id: "http-state", actionId: "settle-invoice", resourceId: "invoice/204", headers, exists: true, scopeHash: "scope:invoice:204", capturedAt: new Date("2026-07-29T03:00:30.000Z") });
    expect(observation.version).toBe('"v7"');
    expect(observation.expiresAt).toBe("2026-07-29T03:01:00.000Z");
    expect(state.currentVersion).toBe('"v7"');
    expect(state.actionId).toBe("settle-invoice");
    expect(captureHttpCommitState({ id: "absent", actionId: "create", resourceId: "invoice/new", headers: new Headers(), exists: false, scopeHash: "scope:new", capturedAt: new Date("2026-07-29T03:00:30.000Z") }).currentVersion).toBe("absent");
    expect(() => captureHttpObservation({ id: "invalid", resourceId: "invoice/204", headers, source: "billing", authority: 95, scopeHash: "scope:invoice:204", ttlMs: 0 })).toThrow("ttlMs");
  });

  it("sends a non-redirecting guarded request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const response = await guardedFetch({ url: "https://api.example.test/invoices/204", action: updateAction(), init: { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }, fetchImpl });
    expect(response.status).toBe(204);
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get("if-match")).toBe('"v7"');
    expect(init.redirect).toBe("error");
  });

  it("turns HTTP 412 into a typed concurrency conflict", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 412 }));
    await expect(guardedFetch({ url: "https://api.example.test/invoices/204", action: updateAction(), init: { method: "PATCH" }, fetchImpl })).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
  });

  it("rejects caller-supplied conditional headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(guardedFetch({ url: "https://api.example.test", action: updateAction(), init: { method: "PATCH", headers: { "if-match": '"attacker"' } }, fetchImpl })).rejects.toMatchObject({ code: "HTTP_GUARD_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-mutating HTTP methods", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(guardedFetch({ url: "https://api.example.test", action: updateAction(), init: { method: "GET" }, fetchImpl })).rejects.toMatchObject({ code: "HTTP_GUARD_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
