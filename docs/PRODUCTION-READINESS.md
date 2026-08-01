# Production-readiness status

Version 0.3 is a production candidate, not a certification. It includes deterministic compilation, bounded validation, typed errors, signed receipts, enforceable HTTP and PostgreSQL concurrency adapters, adversarial and property-based tests, coverage thresholds, a performance budget, dependency auditing, CodeQL, SBOM generation, and provenance attestations.

## Repository gates

- `pnpm check`: lint, strict typecheck, coverage, build, end-to-end signing/tamper tests, and benchmark.
- `pnpm security:deps`: blocks moderate-or-higher known dependency vulnerabilities.
- Pull requests require CI and CodeQL checks.
- Dependencies and GitHub Actions are monitored by Dependabot.
- Release workflows produce a CycloneDX SBOM, SHA-256 checksum, and Sigstore-backed GitHub attestation.

## Required before a real production launch

- Independent security review of compiler invariants, canonicalization, and signature protocol.
- Integration and concurrency testing against the exact HTTP/database infrastructure.
- Managed production key custody, rotation, revocation, and recovery exercises.
- Capacity testing with representative plan shapes and traffic.
- Incident response, monitoring, data retention, privacy, and disaster-recovery procedures owned by the deploying organization.
- A staged rollout beginning with reversible actions.

MomentSeal cannot establish that an observation source is truthful, that an authorization decision is correct, or that a backend actually enforces the requested precondition. Those remain trust boundaries of the host system.
