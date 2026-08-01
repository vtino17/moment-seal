# NIST SSDF evidence mapping

This is a project self-assessment against NIST SP 800-218 SSDF 1.1. It is evidence for an independent reviewer, not a NIST certification or attestation.

| Practice | Project evidence | Status |
| --- | --- | --- |
| PO.1 security requirements | Plan/policy schemas, threat model, invariant tests, production-readiness criteria | Implemented for the product; deployment requirements remain external |
| PO.2 roles and responsibilities | CODEOWNERS, governance, security reporting, release checklist | Partial until an independent reviewer is appointed |
| PO.3 supporting toolchains | Pinned CI actions, strict typecheck, tests, CodeQL, dependency audit, Scorecard | Implemented |
| PO.4 secure development environments | Least-privilege workflow permissions, protected main branch, no persisted checkout credentials | Partial; maintainer endpoint and account controls are external |
| PS.1 protect code | Pull-request workflow, branch protection, CODEOWNERS | Implemented; approval separation is an external gate |
| PS.2 verify release integrity | Deterministic archive, SHA-256 checksum, CycloneDX SBOM, GitHub/Sigstore attestation | Implemented in release automation; first evidence exists only after a release |
| PS.3 archive releases | Git history, GitHub releases, SBOM and attestation artifacts | Partial; retention and escrow policy belong to the operator |
| PW.1 secure design | Threat boundaries, fail-closed compiler model, domain-separated signing protocol | Implemented |
| PW.2 design review | Hardening review and audit scope | Partial until independent review is completed |
| PW.4 reuse existing security capabilities | Node cryptography, HTTP preconditions, parameterized SQL, GitHub attestations | Implemented |
| PW.5 create source securely | Strict TypeScript, canonical validation, bounded graphs, typed errors | Implemented |
| PW.6 secure compilation | Locked toolchain, clean builds, dependency audit, no unchecked generated code | Implemented |
| PW.7 code review and analysis | ESLint, TypeScript, CodeQL, required checks | Implemented; human approval remains external |
| PW.8 executable testing | Unit, schema, adversarial, property, E2E, tamper, performance, reproducibility tests | Implemented |
| PW.9 secure defaults | Fail-closed status, encrypted CLI keys by default, no overwrite, bounded input, HTTP timeout | Implemented |
| PW.10 backdoor inspection | Source-only repository and Scorecard binary-artifact checks | Automated evidence only; independent inspection remains external |
| PW.11 third-party components | Lockfile, Dependabot, audit gate, SBOM | Implemented |
| RV.1 identify vulnerabilities | Private reporting, CodeQL, Dependabot, Scorecard, scheduled CI | Implemented |
| RV.2 assess and remediate | Supported-version and response process in SECURITY.md | Implemented at project scale |
| RV.3 root-cause analysis | Security release checklist requires cause, regression test, and affected-boundary review | Implemented as process; exercised evidence awaits an incident |

An auditor should validate every `Implemented` row against a fixed commit and downgrade any row whose evidence cannot be reproduced.
