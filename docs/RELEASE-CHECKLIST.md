# Security release checklist

## Before tagging

- [ ] The release commit is on protected `main` and has independent approval.
- [ ] Package versions and changelog match the proposed semantic version.
- [ ] `pnpm install --frozen-lockfile`, `pnpm security:deps`, and `pnpm check` pass from a fresh checkout.
- [ ] CodeQL, dependency, secret-scanning, and Scorecard findings are triaged with no unexplained high-risk result.
- [ ] Threat model, schemas, CLI help, and operational documentation match behavior.
- [ ] KMS/HSM integration, key rotation, revocation, backup, and recovery have been exercised in the target environment.
- [ ] Real-backend concurrency and failure-injection tests pass.
- [ ] Open independent-audit findings have an accepted written disposition.

## Release evidence

- [ ] Tag and GitHub Release point to the reviewed commit.
- [ ] The deterministic archive checksum reproduces from the tagged source.
- [ ] CycloneDX SBOM is attached and covers shipped packages.
- [ ] GitHub/Sigstore provenance and SBOM attestations verify.
- [ ] Release notes list security-impacting changes and residual risk.

## After release

- [ ] Verification instructions are tested from a separate machine/account.
- [ ] Monitoring, rollback, incident contacts, and public-key trust store are active.
- [ ] For a security fix, publish root cause, affected versions, regression test, and trust-boundary review after coordinated disclosure.
