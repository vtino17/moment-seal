import { MomentNodeError } from "./errors.js";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;

const identifier = (value: string): string => {
  if (!identifierPattern.test(value)) throw new MomentNodeError("DATABASE_QUERY_INVALID", `Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
};

export interface VersionedUpdateQuery {
  text: string;
  values: unknown[];
}

export interface Queryable {
  query<Row extends Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<{ rowCount: number | null; rows: Row[] }>;
}

export function buildPostgresVersionedUpdate(input: {
  table: string;
  idColumn: string;
  versionColumn: string;
  id: unknown;
  expectedVersion: unknown;
  nextVersion: unknown;
  set: Record<string, unknown>;
}): VersionedUpdateQuery {
  if (input.expectedVersion === undefined || input.expectedVersion === null || input.nextVersion === undefined || input.nextVersion === null) throw new MomentNodeError("DATABASE_QUERY_INVALID", "Expected and next row versions must be non-null values.");
  if (Object.is(input.expectedVersion, input.nextVersion)) throw new MomentNodeError("DATABASE_QUERY_INVALID", "Next row version must differ from the expected version.");
  const entries = Object.entries(input.set).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) throw new MomentNodeError("DATABASE_QUERY_INVALID", "Versioned update requires at least one changed field.");
  if (entries.some(([column]) => column === input.idColumn || column === input.versionColumn)) throw new MomentNodeError("DATABASE_QUERY_INVALID", "Set fields cannot replace identity or version columns directly.");
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([column], index) => `${identifier(column)} = $${index + 1}`);
  values.push(input.nextVersion, input.id, input.expectedVersion);
  const nextIndex = entries.length + 1;
  const idIndex = entries.length + 2;
  const expectedIndex = entries.length + 3;
  return {
    text: `UPDATE ${identifier(input.table)} SET ${assignments.join(", ")}, ${identifier(input.versionColumn)} = $${nextIndex} WHERE ${identifier(input.idColumn)} = $${idIndex} AND ${identifier(input.versionColumn)} = $${expectedIndex} RETURNING ${identifier(input.versionColumn)}`,
    values,
  };
}

export async function executeVersionedUpdate<Row extends Record<string, unknown>>(client: Queryable, query: VersionedUpdateQuery): Promise<Row> {
  const result = await client.query<Row>(query.text, query.values);
  if (result.rowCount !== 1 || result.rows.length !== 1) throw new MomentNodeError("CONCURRENCY_CONFLICT", "Versioned database update affected no current row; resource state changed before commit.");
  return result.rows[0]!;
}
