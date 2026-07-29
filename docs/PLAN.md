# Plan format

MomentSeal accepts JSON matching `schemas/plan.schema.json`. Every timestamp is an RFC 3339 string and every resource version is an opaque string.

## Observations

An observation is evidence captured during planning:

| Field | Meaning |
| --- | --- |
| `id` | Unique evidence identifier |
| `resourceId` | Stable identity of the observed object |
| `version` | ETag, row version, commit SHA, generation, or equivalent |
| `observedAt` / `expiresAt` | Freshness interval |
| `source` | System that produced the evidence |
| `authority` | Application-defined confidence from 0 to 100 |
| `scopeHash` | Digest or stable label for the authority/resource scope |

Authority is a policy signal, not authorization. The runtime remains responsible for authenticating the source and verifying the observation before feeding it to MomentSeal.

## Commit states

A commit state records the resource version captured immediately before the intended action. It is deliberately separate from the observation so the compiler can make drift explicit.

For create actions, include a state with `exists: false` when the backend supports an absence check. For mutations, capture state inside or as close as possible to the transaction boundary.

## Actions

Actions are totally ordered by `sequence` and may also declare dependency edges.

The `consistency` field describes the enforcement mechanism:

- `if-match`: a conditional mutation bound to `expectedVersion`;
- `transaction`: validation and mutation occur in one atomic transaction;
- `lease`: a valid lease protects the declared `leaseScope`;
- `none`: no concurrency boundary.

`mutationHash` should identify the intended payload or operation. MomentSeal preserves it in the hashed plan but does not interpret payload content.

Set `irreversible` when compensation cannot reliably restore the prior state—for example sending money, publishing credentials, deleting an unversioned object, or contacting an external party.

## Temporal rules

For action `a` bound to observation `o` and commit state `s`, the compiler evaluates:

```text
0 <= a.commitAt - o.observedAt <= policy.maximumCheckUseGapMs
a.commitAt <= o.expiresAt
o.version == s.currentVersion
s.capturedAt <= a.commitAt
```

It then checks that the selected consistency mechanism can enforce the same version at the actual write boundary. A compiler pass is useful evidence, but the runtime must still make its conditional request or transaction atomically.
