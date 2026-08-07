import { describe, expect, it, vi } from "vitest";
import { buildPostgresVersionedUpdate, executeVersionedUpdate, type Queryable } from "./database.js";

describe("PostgreSQL row-version adapter", () => {
  it("builds a deterministic parameterized update", () => {
    const query = buildPostgresVersionedUpdate({ table: "invoices", idColumn: "id", versionColumn: "version", id: 204, expectedVersion: 7, nextVersion: 8, set: { status: "settled", amount: 500 } });
    expect(query.text).toBe('UPDATE "invoices" SET "amount" = $1, "status" = $2, "version" = $3 WHERE "id" = $4 AND "version" = $5 RETURNING "version"');
    expect(query.values).toEqual([500, "settled", 8, 204, 7]);
  });

  it("rejects identifier injection", () => {
    expect(() => buildPostgresVersionedUpdate({ table: "invoices; DROP TABLE users", idColumn: "id", versionColumn: "version", id: 1, expectedVersion: 1, nextVersion: 2, set: { status: "ok" } })).toThrow("Unsafe SQL identifier");
  });

  it("rejects direct identity and version replacement", () => {
    expect(() => buildPostgresVersionedUpdate({ table: "invoices", idColumn: "id", versionColumn: "version", id: 1, expectedVersion: 1, nextVersion: 2, set: { version: 99 } })).toThrow("cannot replace");
    expect(() => buildPostgresVersionedUpdate({ table: "invoices", idColumn: "id", versionColumn: "version", id: 1, expectedVersion: 1, nextVersion: 2, set: {} })).toThrow("at least one");
    expect(() => buildPostgresVersionedUpdate({ table: "invoices", idColumn: "id", versionColumn: "version", id: 1, expectedVersion: 1, nextVersion: 1, set: { status: "done" } })).toThrow("must differ");
    expect(() => buildPostgresVersionedUpdate({ table: "invoices", idColumn: "id", versionColumn: "version", id: 1, expectedVersion: null, nextVersion: 2, set: { status: "done" } })).toThrow("non-null");
  });

  it("returns the exactly one updated row", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ version: 8 }] });
    const client = { query } as unknown as Queryable;
    await expect(executeVersionedUpdate(client, { text: "UPDATE ...", values: [] })).resolves.toEqual({ version: 8 });
  });

  it("treats zero affected rows as a concurrency conflict", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as unknown as Queryable;
    await expect(executeVersionedUpdate(client, { text: "UPDATE ...", values: [] })).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
    const multiple = { query: vi.fn().mockResolvedValue({ rowCount: 2, rows: [{}, {}] }) } as unknown as Queryable;
    await expect(executeVersionedUpdate(multiple, { text: "UPDATE ...", values: [] })).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
  });
});
