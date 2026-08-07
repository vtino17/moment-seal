const required = [
  "MOMENTSEAL_POSTGRES_URL",
  "MOMENTSEAL_VAULT_ADDR",
  "MOMENTSEAL_VAULT_TOKEN",
  "MOMENTSEAL_VAULT_KEY_NAME",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing staging configuration: ${missing.join(", ")}`);
if (process.env.MOMENTSEAL_INTEGRATION_PROVISION === "true") throw new Error("Staging validation must not provision or drop database and Vault resources.");

const postgres = new URL(process.env.MOMENTSEAL_POSTGRES_URL);
if (!["postgres:", "postgresql:"].includes(postgres.protocol) || !postgres.hostname) throw new Error("MOMENTSEAL_POSTGRES_URL must be a PostgreSQL connection URL.");

const vault = new URL(process.env.MOMENTSEAL_VAULT_ADDR);
if (vault.protocol !== "https:" || vault.username || vault.password || vault.pathname !== "/" || vault.search || vault.hash) throw new Error("Staging Vault must use a canonical HTTPS origin without URL credentials.");
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(process.env.MOMENTSEAL_VAULT_KEY_NAME)) throw new Error("MOMENTSEAL_VAULT_KEY_NAME is malformed.");

console.log(`Staging configuration accepted for PostgreSQL host ${postgres.hostname} and Vault origin ${vault.origin}.`);
