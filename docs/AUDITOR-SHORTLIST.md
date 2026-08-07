# Independent auditor shortlist

This is a research shortlist, not an engagement, endorsement, quote, or completed independence check. No firm has been contacted. Selection must consider availability, price, conflicts of interest, named reviewers, methodology, and agreement to retest and publish a scoped summary.

## Candidates

| Candidate | Publicly stated fit | Questions before selection |
| --- | --- | --- |
| [Trail of Bits — Software Assurance](https://www.trailofbits.com/services/software-assurance) | Application security, cryptography, and AI/ML assessment capabilities suit the mixed compiler, signature, and agent-safety scope. | Will the named team review TypeScript canonicalization, Ed25519 domain separation, GitHub supply chain, and TOCTOU invariants? |
| [Cure53](https://cure53.de/) | Publicly offers white-box code audits plus infrastructure, platform, and cryptography audits; its public portfolio includes JavaScript/TypeScript and cryptographic libraries. | Can the engagement include source review, Vault/PostgreSQL integration, workflow review, remediation discussion, and a public summary? |
| [NCC Group — Cryptographic Services](https://www.nccgroup.com/penetration-testing-services/) | States expertise in cryptographic implementations, protocols, infrastructure, and hardware; public work includes HSM-backed and AI systems. | Can one cross-practice team cover protocol design, Node.js implementation, Vault/HSM assumptions, database concurrency, and AI-agent threat boundaries? |
| [Least Authority — Security Consulting](https://leastauthority.com/security-consulting/) | Publishes a defined audit/retest process and lists TypeScript, Node.js, source-code, cryptography, and distributed-system experience. | Is the team available for a non-blockchain compiler, and can it provide the independence statement and public report hash required here? |

## Required request-for-proposal scope

- Fixed full Git commit SHA; no moving branch.
- Compiler determinism, bounded graph processing, canonical JSON, receipt issuance, Ed25519 payload construction, trust-store lifecycle, and all fail-closed paths.
- Vault Transit and PostgreSQL adapter behavior, including failure injection and two-writer races.
- CLI file handling, schemas, dependency and GitHub Actions supply chain, reproducible artifact, SBOM, and provenance.
- Deliverables listed in [the audit package](AUDIT-PACKAGE.md), including severity definitions, reproduction, one remediation retest, and a publishable summary.
- Explicit statement that an assessment finds risks but does not guarantee security or create a certification unless a named certification scheme is separately contracted.

## Selection record

Record proposals and the final decision in a GitHub issue without publishing confidential pricing. The selected auditor must disclose prior work for the maintainer or project, and the maintainer must document why the relationship is sufficiently independent.
