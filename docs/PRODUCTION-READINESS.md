# Production-readiness status

Version 0.3 is certification-ready evidence, not a certification. It includes deterministic compilation, bounded validation, typed errors, KMS/HSM-capable signed receipts, lifecycle-aware trust stores, enforceable HTTP and PostgreSQL concurrency adapters, adversarial and property-based tests, coverage thresholds, a performance budget, dependency auditing, CodeQL, OpenSSF Scorecard, reproducible release archives, SBOM generation, and provenance attestations.

## Repository gates

- `pnpm check`: lint, strict typecheck, coverage, build, end-to-end signing/tamper tests, and benchmark.
- `pnpm security:deps`: blocks moderate-or-higher known dependency vulnerabilities.
- Pull requests require CI and CodeQL checks.
- Dependencies and GitHub Actions are monitored by Dependabot.
- Release workflows produce a CycloneDX SBOM, SHA-256 checksum, and Sigstore-backed GitHub attestation.
- Release archives are byte-for-byte reproducible under a fixed source commit timestamp.
- NIST SSDF evidence and independent-review scope are checked into the repository.
- Ephemeral PostgreSQL and Vault Transit CI services exercise real concurrency and external-signing paths; see [pilot validation](PILOT-VALIDATION.md).

## Required before a real production launch

- Independent security review of compiler invariants, canonicalization, and signature protocol.
- Integration and concurrency testing against the exact HTTP/database infrastructure.
- Managed production key custody, rotation, revocation, and recovery exercises.
- Capacity testing with representative plan shapes and traffic.
- Incident response, monitoring, data retention, privacy, and disaster-recovery procedures owned by the deploying organization.
- A staged rollout beginning with reversible actions.

Auditor candidates and selection questions are recorded in [the independent auditor shortlist](AUDITOR-SHORTLIST.md). OpenSSF Passing application evidence is prepared in [the application worksheet](OPENSSF-APPLICATION.md), but submission remains an authenticated maintainer attestation.

Until a commercial auditor is funded, the project requests an [independent community security review](COMMUNITY-REVIEW.md). Community approval can authorize a merge under project governance, but it is not a certification and does not justify an “independently audited” claim without the complete audit deliverables.

## Certification decision

The repository may describe a fixed release as “independently audited” only after the deliverables in [AUDIT-PACKAGE.md](AUDIT-PACKAGE.md) are complete and published. It may use “certified” only when a named external scheme and issuing organization grant that status for a defined scope and validity period. OpenSSF Best Practices is a separate project self-certification that the maintainer can apply for after verifying its live criteria.

MomentSeal cannot establish that an observation source is truthful, that an authorization decision is correct, or that a backend actually enforces the requested precondition. Those remain trust boundaries of the host system.
