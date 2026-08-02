import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPostgresVersionedUpdate, executeVersionedUpdate, type Queryable } from "./database.js";

const connectionString = process.env.MOMENTSEAL_POSTGRES_URL;
const enabled = typeof connectionString === "string" && connectionString.length > 0;
const provision = process.env.MOMENTSEAL_INTEGRATION_PROVISION === "true";
const clients = enabled ? [new Client({ connectionString }), new Client({ connectionString }), new Client({ connectionString })] : [];
const rowId = `momentseal-validation-${randomUUID()}`;
let connected = false;

describe.runIf(enabled)("PostgreSQL optimistic concurrency integration", () => {
  beforeAll(async () => {
    await Promise.all(clients.map((client) => client.connect()));
    connected = true;
    if (provision) {
      await clients[0]!.query("DROP TABLE IF EXISTS momentseal_integration_versions");
      await clients[0]!.query("CREATE TABLE momentseal_integration_versions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, status TEXT NOT NULL)");
    }
    await clients[0]!.query("INSERT INTO momentseal_integration_versions (id, version, status) VALUES ($1, $2, $3)", [rowId, 1, "pending"]);
  });

  afterAll(async () => {
    if (connected) {
      await clients[0]!.query("DELETE FROM momentseal_integration_versions WHERE id = $1", [rowId]);
      if (provision) await clients[0]!.query("DROP TABLE IF EXISTS momentseal_integration_versions");
    }
    await Promise.all(clients.map((client) => client.end()));
  });

  it("allows exactly one of two competing versioned writes", async () => {
    const build = (status: string) => buildPostgresVersionedUpdate({
      table: "momentseal_integration_versions",
      idColumn: "id",
      versionColumn: "version",
      id: rowId,
      expectedVersion: 1,
      nextVersion: 2,
      set: { status },
    });
    const results = await Promise.allSettled([
      executeVersionedUpdate(clients[1] as unknown as Queryable, build("approved")),
      executeVersionedUpdate(clients[2] as unknown as Queryable, build("rejected")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "CONCURRENCY_CONFLICT" } });
    const persisted = await clients[0]!.query<{ version: number; status: string }>("SELECT version, status FROM momentseal_integration_versions WHERE id = $1", [rowId]);
    expect(persisted.rows[0]?.version).toBe(2);
    expect(["approved", "rejected"]).toContain(persisted.rows[0]?.status);
  });
});
