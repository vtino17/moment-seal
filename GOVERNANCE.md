# Governance

MomentSeal currently has one maintainer, `vtino17`. Changes are proposed through GitHub pull requests and must preserve deterministic, fail-closed behavior.

Compiler invariants, schemas, receipt formats, signing payloads, trust policy, and release workflows are security-sensitive. They require passing automated gates and independent human review before a production release. The author of a security-sensitive change must not be its only production-release approver.

Decisions are recorded in issues or pull requests. Security reports use GitHub private vulnerability reporting. Maintainer changes, compromised accounts, or unavailable maintainers require suspending releases until repository ownership, branch protection, signing authority, and public-key trust have been re-established.

This governance file describes the project process; deploying organizations remain responsible for their own authorization, data, incident, and compliance ownership.
