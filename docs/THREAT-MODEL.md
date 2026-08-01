# Threat model

## Protected failure modes

MomentSeal is designed to reveal:

- external resource changes between planning and commit;
- internal changes caused by an earlier action in the same plan;
- stale or weak evidence used for consequential actions;
- missing optimistic-concurrency, transaction, or lease boundaries;
- graph structures that obscure execution order;
- later modification of a plan, policy, compilation, or receipt.
- substitution of a clean compilation from a different plan or policy;
- authorization-scope drift between planning and commit;
- parser and graph resource exhaustion within documented limits.

## Trust assumptions

The compiler assumes:

- timestamps and versions supplied by adapters are authentic;
- `resourceId` refers to one stable backend object;
- commit state is captured close to the real write boundary;
- scope hashes are derived from canonical, authenticated authorization context;
- the runtime enforces the declared consistency mechanism;
- SHA-256 and the execution environment are trustworthy.

## Out of scope

MomentSeal does not:

- authenticate users, tools, or evidence sources;
- grant authorization or prove that an action is semantically correct;
- make multiple backends atomic;
- prevent a malicious runtime from ignoring a rejection;
- replace database isolation, leases, conditional requests, or compensation;
- protect against denial of service, prompt injection, or unsafe payload content.
- guarantee that a trusted signing key was controlled by the intended human or service;
- make a compromised key trustworthy, or replace KMS/HSM access control and audit logging.

Signed receipts establish possession of a configured Ed25519 key at signing time. Trust-store policy binds key identity, validity, rotation, and revocation, but producer identity remains only as reliable as the operator's key provisioning and custody.

## Residual race

A race remains if the runtime captures commit state, compiles, and later performs an unconditional mutation. The guard must cross the final write boundary atomically. This is why the compiler rejects `consistency: none` when conditional mutations are required.

The CLI limits each JSON input to 1 MiB. Runtime validation caps each top-level collection at 10,000 entries and each action at 256 direct dependencies, while policy budgets should be set substantially lower. These bounds reduce accidental or adversarial resource exhaustion but do not replace process-level CPU and memory limits for untrusted multi-tenant execution.

TOCTOU is catalogued as [CWE-367](https://cwe.mitre.org/data/definitions/367/). The design follows the same practical principle as HTTP `If-Match`: bind the mutation to the exact representation that informed the decision.
