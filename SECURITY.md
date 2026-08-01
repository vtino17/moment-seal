# Security policy

Please report vulnerabilities through GitHub private vulnerability reporting rather than a public issue.

Include the affected commit, a minimal plan/policy reproduction, expected impact, and whether the problem can incorrectly produce a clean compilation or valid receipt.

The project is pre-1.0. Security fixes target the latest `main` branch. Do not include real credentials, customer data, private keys, passphrases, or production trace content in reports.

Version 0.3 is a production candidate and has not received an independent security audit. Before deployment, review [production readiness](docs/PRODUCTION-READINESS.md), use managed signing-key custody, and test concurrency enforcement against the real backend.
