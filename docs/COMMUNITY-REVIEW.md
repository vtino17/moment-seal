# Independent community security review

MomentSeal uses an open community review path while funding for a commercial audit is unavailable. This process can provide independent human review, but it is not a certification and must not be described as one.

## Reviewer eligibility

A release approver must be a human who did not author the security-sensitive changes, is not controlled by the maintainer, discloses relevant conflicts, and can explain the review performed. Automated tools and AI reviews are useful evidence but do not satisfy the independent approval requirement.

Useful experience includes TypeScript/Node.js security, canonical serialization, Ed25519, Vault or KMS key custody, PostgreSQL concurrency, GitHub Actions supply chains, or adversarial AI-agent evaluation. Multiple focused reviewers may divide the scope.

## Review procedure

1. Select the fixed PR commit shown in [the audit package](AUDIT-PACKAGE.md); do not review a moving branch.
2. Reproduce all commands in the audit package from a clean checkout.
3. Challenge at least one security claim with a new negative, boundary, fault-injection, or concurrency test.
4. Record findings in GitHub. Potential vulnerabilities must use private vulnerability reporting, not a public issue.
5. Require a regression test for every confirmed defect and independently inspect the remediation.
6. Submit an approving PR review only when the reviewer believes the fixed commit satisfies the documented release scope and all findings have a written disposition.

## Sign-off template

The final review should state reviewer identity, independence and conflicts, exact commit SHA, dates, areas reviewed, commands reproduced, new tests attempted, findings and dispositions, residual risks, and whether the reviewer approves merging this production-candidate release. Approval does not guarantee security.

An ordinary one-line approval satisfies GitHub's mechanical branch rule but does not justify an “independently audited” claim. That wording still requires every deliverable in the full audit package.
