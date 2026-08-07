# Independent audit package

## Audit target

Freeze the review target to a full Git commit SHA and record the Node.js, pnpm, operating-system, and OpenSSL versions. Do not audit a moving branch or a locally modified worktree.

## Security claims to challenge

1. No non-clean compilation can receive a valid receipt.
2. Plan, policy, compilation, action set, and timestamps cannot be substituted without invalidating verification.
3. Signed receipts are domain separated and cannot be validated with an untrusted, expired, ambiguous, or revoked key.
4. An external signer receives the exact canonical payload and malformed signature results fail closed.
5. HTTP and row-version adapters carry the sealed precondition across the mutation boundary atomically.
6. Adversarial graph inputs remain within documented time and memory budgets.
7. Release source, SBOM, checksum, and attestation resolve to the same reviewed commit.

## Reproduction commands

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm security:deps
pnpm check
git status --short
```

The final command must produce no output. Inspect coverage results, mutation boundaries, cryptographic payload construction, schema/runtime parity, workflow permissions, dependency provenance, and every suppressed or caught exception.

## Deliverables expected from an auditor

- auditor identity, independence statement, scope, commit SHA, dates, and methodology;
- findings with severity, exploit preconditions, affected trust boundary, and reproduction;
- explicit disposition of every claim above and every row in the SSDF mapping;
- retest evidence for remediated findings;
- signed final report hash and a public summary suitable for a GitHub release.

The project must not use the word “certified” until the report defines the certification scheme, scope, validity period, and issuing organization.
