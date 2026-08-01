# Operations guide

MomentSeal is a pre-commit safety gate. It does not replace authorization, transactions, idempotency, retries, audit logging, or application monitoring.

## Runtime sequence

1. Capture an authoritative observation and bind its scope.
2. Build the complete plan and policy.
3. Immediately before each mutation, capture the action-bound commit state.
4. Compile with an explicit trusted clock.
5. Execute only actions whose decision is `commit` and whose overall compilation is `clean`.
6. Enforce the declared concurrency guard in the storage adapter, not only in the compiler.
7. Issue and optionally sign a receipt after the guarded mutation succeeds.

Never retry a concurrency conflict using the old observation. Re-read the resource, rebuild the plan, capture new commit state, and compile again.

## Service-level signals

Track compilation latency, status counts, finding codes, concurrency conflicts, signature failures, stale evidence age, and receipt-verification failures. Alert on any valid-to-invalid receipt transition, signature failure, or sudden rise in `state-version-drift` and `scope-*` findings.

Do not log full plans, receipts, private keys, passphrases, authorization tokens, or customer payloads. Log identifiers only after applying the host application's data-classification policy.

## Availability and failure mode

Treat compiler, key-store, clock, observation source, or commit-state source failure as fail-closed for mutations. A timeout must not silently bypass the gate. Read-only operations may use a separately documented degraded-mode policy.

The checked-in performance gate compiles a 5,000-action linear plan within 5 seconds on the CI runner. This is a regression budget, not a latency guarantee. Benchmark your actual topology and hardware.

## Rollout

Start in observe-only mode with synthetic data, compare decisions with application outcomes, then enable blocking for one reversible mutation class. Add irreversible effects only after adapter integration tests, key recovery drills, and an independent security review.
