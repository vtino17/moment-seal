# Runtime integration

MomentSeal belongs after planning and immediately before side effects.

```text
agent plans
  → adapter records observations and versions
  → runtime captures commit-time states
  → MomentSeal compiles
  → runtime executes only clean actions with their declared guard
  → optional receipt is stored or signed
```

## Adapter responsibilities

1. Map backend identity to stable `resourceId` values.
2. Capture trustworthy versions such as ETags, commit SHAs, database row versions, or object generations.
3. Normalize timestamps to UTC.
4. Generate `scopeHash` from the effective authorization and resource scope.
5. Capture commit state at the transaction boundary.
6. Implement the declared guard atomically.

Never synthesize a version from mutable display content when the backend exposes a native concurrency token.

## CI gate

```bash
pnpm moment compile plan.json --policy policy.json --json > compilation.json
```

Exit `2` blocks the job. Preserve `compilation.json` as an audit artifact.

## HTTP APIs

Map a strong ETag to `observation.version`, capture the current ETag as commit state, then execute with:

```http
If-Match: "<expectedVersion>"
```

Treat HTTP `412 Precondition Failed` as a normal consistency rejection. Re-plan from a new observation; do not silently downgrade to an unconditional write.

## Databases

Capture a row version and use it in an atomic update:

```sql
UPDATE invoices
SET status = 'settled', version = version + 1
WHERE id = :id AND version = :expected_version;
```

Require exactly one affected row. Alternatively, validate and mutate inside a transaction with an appropriate isolation level.

## Multi-action plans

After each successful mutation, either:

- update later observations and commit states from the mutation response;
- explicitly revalidate later actions; or
- recompile the remaining plan.

MomentSeal flags reuse of evidence that an earlier same-resource action has invalidated.

## Receipt storage

Receipts are content-addressed integrity records. Store them beside trace data, sign them with Sigstore/KMS when identity is required, and retain the source plan and policy for later verification.
