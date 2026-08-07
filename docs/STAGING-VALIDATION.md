# Staging validation

The manual staging workflow runs the real PostgreSQL concurrency and Vault Transit signing tests against resources selected through a protected GitHub Environment. It never provisions or drops staging resources.

## PostgreSQL preparation

Create a dedicated validation database or role and this dedicated table:

```sql
CREATE TABLE momentseal_integration_versions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  status TEXT NOT NULL
);
```

Grant only connect plus `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on this table. Each run inserts a random row, races two updates, verifies exactly one winner, and removes only its own row. Do not point the workflow at a customer or application table.

## Vault preparation

Create a non-derived Ed25519 Transit key named for validation. The runtime token needs only the equivalent of:

```hcl
path "transit/keys/momentseal-staging" {
  capabilities = ["read"]
}

path "transit/sign/momentseal-staging" {
  capabilities = ["update"]
}
```

Use TLS, short-lived authentication, audit logging, a non-exportable key, and a dedicated policy. The workflow does not enable Transit or create, rotate, export, back up, or delete keys.

## GitHub Environment configuration

Create a protected GitHub Environment named `staging`, require an independent reviewer, and configure:

- secret `MOMENTSEAL_POSTGRES_URL`;
- secret `MOMENTSEAL_VAULT_TOKEN`;
- variable `MOMENTSEAL_VAULT_ADDR`, containing a canonical HTTPS origin;
- variable `MOMENTSEAL_VAULT_KEY_NAME`;
- optional variables `MOMENTSEAL_VAULT_MOUNT` and `MOMENTSEAL_VAULT_KEY_VERSION`.

The manual dispatch becomes available after this workflow is merged onto the default branch. Run **Staging validation** before creating a production tag or GitHub Release, select the protected environment, approve the deployment, and attach the run URL to [the pilot record](PILOT-VALIDATION.md). GitHub-hosted runners must have a private network path or allow-listed route to both services; do not expose administrative endpoints publicly merely to satisfy this test.
