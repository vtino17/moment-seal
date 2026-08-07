# Changelog

## 0.3.0 - 2026-08-02

### Production hardening

- Add domain-separated Ed25519 signed-receipt envelopes, encrypted PKCS#8 key generation, stable SPKI key identifiers, and trusted-key verification.
- Reject non-canonical Base64URL signature encodings, including encodings with non-zero padding bits that decode to unchanged bytes.
- Add asynchronous KMS/HSM signer support plus bounded trust-store rotation, validity, and revocation policy.
- Require independent plan and policy verification inside every signing API before local or external key use.
- Add a Node runtime package with fail-closed HTTP ETag and PostgreSQL row-version enforcement adapters.
- Restrict guarded HTTP origins, schemes, credentials, and timeouts; require database versions to advance.
- Add typed core and runtime errors plus CLI key generation, signing, and signed-receipt verification.
- Fix CLI action explanation and timeline commit-state identity lookups.
- Replace a quadratic prior-mutation scan with resource-indexed analysis.

### Assurance and operations

- Add property-based canonicalization, determinism, and cycle tests.
- Add a 5,000-action CI performance budget and signed-receipt end-to-end tamper tests.
- Add production operations, adapter, key-management, and readiness documentation.
- Add CycloneDX SBOM generation, release checksums, and GitHub/Sigstore provenance attestations.
- Add byte-for-byte reproducible release archives, OpenSSF Scorecard automation, NIST SSDF evidence mapping, and an independent-audit package.

## 0.2.0 - 2026-08-01

### Security and correctness

- Bind each commit-state snapshot to exactly one action.
- Bind authority scope across observation, commit state, action, lease, and revalidation.
- Bind compilation envelopes to exact plan and policy hashes.
- Reject receipt issuance for non-clean, mismatched, or internally modified compilations.
- Verify receipt action semantics and timeline order.
- Add commit-state freshness, resource-existence, create-guard, and graph-budget invariants.
- Replace recursive dependency analysis with an iterative bounded algorithm.
- Make canonical hashing and CLI file handling fail closed.

### Tooling

- Add coverage thresholds, dependency audits, Dependabot, CODEOWNERS, and expanded adversarial tests.
- Add `If-None-Match` create semantics and two new Studio metrics.

## 0.1.0 - 2026-07-29

- Initial snapshot-to-commit compiler, CLI, receipt, examples, schemas, and Studio.
