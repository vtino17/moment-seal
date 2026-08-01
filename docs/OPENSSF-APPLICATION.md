# OpenSSF Best Practices application worksheet

This worksheet prepares a **Passing** badge application. It is not a badge, approval, audit, or certification. The maintainer must authenticate to [OpenSSF BadgeApp](https://www.bestpractices.dev/en/projects/new), verify every live answer, and submit the application. The authoritative requirements are the live [Passing criteria](https://www.bestpractices.dev/en/criteria/0).

## Proposed project record

- Project name: `MomentSeal`
- Repository and project URL: `https://github.com/vtino17/moment-seal`
- Description: `A snapshot-to-commit consistency compiler that rejects AI-agent plans whose evidence or concurrency guards cannot remain valid until mutation time.`
- License: MIT
- Implementation language: TypeScript
- Target badge: Passing

## Evidence map

| Criteria area | Proposed answer | Repository evidence | Owner verification before submission |
| --- | --- | --- | --- |
| Description and interaction | Met | [README](../README.md), [contribution process](../CONTRIBUTING.md), GitHub issues and pull requests | Confirm public issues are enabled. |
| FLOSS license | Met | [MIT license](../LICENSE) in the repository root | Confirm all shipped first-party code uses MIT. |
| Basic and interface documentation | Met | [README](../README.md), [plan](PLAN.md), [policy](POLICY.md), [integration](INTEGRATION.md), [adapters](ADAPTERS.md) | Check documentation against the release candidate. |
| HTTPS and searchable discussion | Met | GitHub repository, issues, and pull requests use HTTPS and stable URLs | Confirm no non-HTTPS download location is advertised. |
| English documentation | Met | User-facing repository content is maintained in English | Continue accepting reports and code comments in English. |
| Public change control | Met | Public Git history and pull-request workflow; [governance](../GOVERNANCE.md) | Confirm the application points to the public repository. |
| Unique versions and release notes | Prepared | SemVer package versions and [changelog](../CHANGELOG.md) | After approval, confirm the Git tag and GitHub Release identify the exact reviewed commit. |
| Bug reporting and archive | Met | [contribution process](../CONTRIBUTING.md) and public GitHub issues | Review the actual response history; do not claim response-rate criteria from policy alone. |
| Private vulnerability reporting | Prepared | [security policy](../SECURITY.md) directs reporters to GitHub private vulnerability reporting | Confirm private vulnerability reporting remains enabled and answer response-history criteria from actual records. |
| Build system | Met | `pnpm install --frozen-lockfile`, `pnpm build`, pinned lockfile, CI | Re-run from a clean checkout. |
| Automated tests | Met | Unit, property, schema, end-to-end, integration, coverage, and performance gates | Link the green release-commit workflow runs. |
| Warning and static-analysis handling | Met | Strict TypeScript, ESLint, CodeQL, dependency audit, and zero-warning CI policy | Triage current CodeQL and dependency findings before submission. |
| Secure design knowledge | Met | [threat model](THREAT-MODEL.md), [hardening review](HARDENING.md), [SSDF map](SSDF-MAPPING.md) | Confirm claims match the fixed application commit. |
| Published cryptography and key lengths | Met | Ed25519 via Node.js/OpenSSL and Vault Transit; [key management](KEY-MANAGEMENT.md) | Do not claim custom cryptography or FIPS validation. |
| Secure delivery | Prepared | HTTPS GitHub delivery, deterministic archive, checksums, SBOM, and Sigstore-backed attestations | Link artifacts from the final GitHub Release after release approval. |
| Known vulnerability remediation | Owner attestation required | [security policy](../SECURITY.md), dependency audit, CodeQL, security release checklist | Check private reports, advisories, and public issues; answer using real dates and dispositions. |

## Submission sequence

1. Freeze the application to the independently approved release commit.
2. Confirm all CI, CodeQL, dependency, secret-scanning, and Scorecard results for that commit.
3. Publish the reviewed release and replace relative evidence with permanent GitHub URLs at the tag.
4. Sign in to BadgeApp with the maintainer account, create the project, and answer the live Passing form.
5. Record the BadgeApp project URL in the README only after BadgeApp creates it; display only the badge level actually granted.

The application is intentionally held until the release and evidence URLs exist. Authentication and factual owner attestations cannot be delegated to repository automation.
