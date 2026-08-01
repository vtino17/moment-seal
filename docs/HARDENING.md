# Hardening review

This document records the security and correctness review that produced contract version 2.0.

## Resolved findings

| Risk | Resolution |
| --- | --- |
| A clean compilation could be paired with different inputs by a library caller | Compilation embeds `planHash` and `policyHash`; receipt issuance recomputes and verifies the full compilation envelope |
| One commit state per resource was ambiguous across sequential mutations | Commit states are uniquely identified and bound one-to-one to actions |
| A commit snapshot could be arbitrarily old | Policy now enforces `maximumCommitStateAgeMs` |
| A mutation could target a resource that vanished | Non-create actions reject `exists: false`; creates reject `exists: true` |
| Scope evidence was collected but unused | Scope is bound across observation, state, action, lease, and irreversible revalidation |
| A recent revalidation timestamp alone could pass | Revalidation now requires timestamp, version, and scope as one tuple |
| Create actions lacked an explicit absence guard | `if-none-match` is a first-class consistency mode |
| Receipt verification trusted committed-action content | Verification recomputes the expected committed action sequence |
| Canonical hashing silently accepted lossy JSON values | Hashing rejects undefined values, non-finite numbers, sparse arrays, cycles, excessive depth, and non-plain objects |
| Recursive graph traversal could exhaust the stack | Cycle and depth analysis uses an iterative topological algorithm |
| Plan work was unbounded | Absolute collection limits and policy-specific action, observation, and edge budgets fail closed |
| CLI output could overwrite evidence | Writes are exclusive by default and require `--force` to replace a file |
| JSON files could consume unbounded memory | CLI input is capped at 1 MiB and must be a regular file |

## Verification gates

- strict TypeScript and ESLint;
- unit and adversarial tests;
- enforced line/function/statement/branch coverage thresholds;
- clean and intentionally racy CLI scenarios;
- receipt issue, verification, tamper, and overwrite checks;
- frozen-lockfile production build;
- dependency vulnerability audit;
- Dependabot coverage for npm and GitHub Actions.

The review detected AJV CVE-2025-69873 in the initially selected schema-test dependency. The dependency was upgraded to the patched 8.18.0 release, and the audit gate fails on moderate or higher severity.

## Remaining boundaries

MomentSeal still depends on the runtime to authenticate evidence, construct scope hashes correctly, and enforce the declared conditional operation atomically. Content-addressed receipts detect inconsistency but do not establish identity; sign them externally when provenance matters.
