# Production pilot validation record

This record separates reproducible repository integration evidence from deployment-specific production evidence. A green CI service test is necessary but does not prove a production database, KMS/HSM, network path, policy, or operating procedure.

## Repository integration gates

| Gate | Environment | Automated assertion | Status source |
| --- | --- | --- | --- |
| PostgreSQL two-writer race | Ephemeral PostgreSQL 17 CI service | Two writers use one expected version; exactly one commits and the other returns `CONCURRENCY_CONFLICT`. | `PostgreSQL and Vault integration` GitHub check |
| External Ed25519 signing | Ephemeral Vault 2.0.3 Transit service in development mode | Vault creates a non-exportable Ed25519 key, signs the exact receipt payload, and the exported public key verifies the envelope. | `PostgreSQL and Vault integration` GitHub check |
| Unit failure paths | Mocked network and malformed metadata/signatures | Unsafe HTTP, path traversal, wrong key type/version, non-canonical signature, service status, and malformed configuration fail closed. | `Validate, test, and build` GitHub check |

The protected manual procedure for exact staging services is documented in [staging validation](STAGING-VALIDATION.md).

The CI images are pinned by immutable digest. Tokens and databases are disposable job-local fixtures. Vault development mode uses loopback HTTP and is explicitly enabled only by `allowInsecureDevelopment`; normal configuration requires HTTPS.

## Deployment evidence still required

- [ ] Exact production PostgreSQL-compatible engine, driver, proxy, connection pool, isolation level, schema, trigger behavior, and retry policy tested under concurrency.
- [ ] Exact managed KMS/HSM or production Vault cluster tested over TLS with least-privilege authentication, audit logging, rate limits, timeouts, and outage injection.
- [ ] Key creation, rotation, revocation, backup or recovery, compromise response, and trust-store distribution exercised by named operators.
- [ ] HTTP mutation targets tested through their real load balancer, cache, proxy, and authorization layer.
- [ ] Capacity and latency measured with representative plan shapes and traffic.
- [ ] Monitoring, alerting, rollback, incident response, data retention, privacy, and disaster recovery approved by deployment owners.

For each completed item, attach date, environment identifier, immutable software/configuration versions, operator and reviewer identities, sanitized logs, expected result, actual result, and finding disposition. Never commit credentials, customer data, private keys, or production trace content.
