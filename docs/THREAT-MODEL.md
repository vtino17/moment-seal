# Threat model

## Protected failure modes

MomentSeal is designed to reveal:

- external resource changes between planning and commit;
- internal changes caused by an earlier action in the same plan;
- stale or weak evidence used for consequential actions;
- missing optimistic-concurrency, transaction, or lease boundaries;
- graph structures that obscure execution order;
- later modification of a plan, policy, compilation, or receipt.

## Trust assumptions

The compiler assumes:

- timestamps and versions supplied by adapters are authentic;
- `resourceId` refers to one stable backend object;
- commit state is captured close to the real write boundary;
- the runtime enforces the declared consistency mechanism;
- SHA-256 and the execution environment are trustworthy.

## Out of scope

MomentSeal does not:

- authenticate users, tools, or evidence sources;
- grant authorization or prove that an action is semantically correct;
- make multiple backends atomic;
- prevent a malicious runtime from ignoring a rejection;
- replace database isolation, leases, conditional requests, or compensation;
- sign receipts or establish producer identity;
- protect against denial of service, prompt injection, or unsafe payload content.

## Residual race

A race remains if the runtime captures commit state, compiles, and later performs an unconditional mutation. The guard must cross the final write boundary atomically. This is why the compiler rejects `consistency: none` when conditional mutations are required.

TOCTOU is catalogued as [CWE-367](https://cwe.mitre.org/data/definitions/367/). The design follows the same practical principle as HTTP `If-Match`: bind the mutation to the exact representation that informed the decision.
