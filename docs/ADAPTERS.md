# Enforcing consistency adapters

The `@momentseal/node` package turns sealed action guards into commit-time storage operations.

## HTTP

`guardedFetch` derives `If-Match` or `If-None-Match` from the sealed action, rejects caller-supplied conditional headers, rejects weak or malformed ETags, disables redirects, applies a bounded timeout, and converts HTTP `412` into a typed `CONCURRENCY_CONFLICT`.

Only `POST`, `PUT`, `PATCH`, and `DELETE` are accepted. Callers must provide 1 to 100 canonical HTTP(S) `allowedOrigins`; URL credentials, non-HTTP schemes, and unlisted targets fail closed. The target server must implement RFC 9110 preconditions atomically with the mutation. A successful response from a server that ignores preconditions is not safe.

## PostgreSQL-style row versions

`buildPostgresVersionedUpdate` emits a parameterized statement that updates a row only when both identity and expected version match. SQL identifiers are allow-listed and values are parameters. `executeVersionedUpdate` requires exactly one returned row and otherwise raises `CONCURRENCY_CONFLICT`.

Run the update inside the application's transaction. The version column must change on every mutation, including writes performed by other services. Database triggers or a centralized repository layer are recommended when multiple writers exist.

## Adapter acceptance tests

Before production rollout, prove all of the following against the real backend:

- two concurrent writers cannot both commit from one version;
- stale and missing resources fail closed;
- redirect and proxy layers preserve conditional semantics;
- retries rebuild evidence instead of replaying stale guards;
- authorization scope is captured from the same identity used for mutation;
- the committed version is recorded in application audit logs.
