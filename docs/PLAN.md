# Plan format

MomentSeal accepts JSON matching `schemas/plan.schema.json`. Contract version 2.0 requires canonical UTC timestamps with millisecond precision, for example `2026-07-29T03:02:45.000Z`. Every resource version is an opaque, non-empty string.

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

A commit state records the resource version and effective authority scope captured immediately before one intended action. It has its own `id`, names its `actionId`, and is selected by the action's `commitStateId`. This one-to-one model prevents a later same-resource action from reusing the snapshot of an earlier mutation.

For create actions, include a state with `exists: false`. For updates, deletes, and external effects, `exists` must be true. Capture state inside or as close as possible to the transaction boundary; the policy limits its age at action commit.

## Actions

Actions are totally ordered by `sequence` and may also declare dependency edges.

The `consistency` field describes the enforcement mechanism:

- `if-match`: a conditional mutation bound to `expectedVersion`;
- `if-none-match`: an absence-conditional create, equivalent to `If-None-Match: *`;
- `transaction`: validation and mutation occur in one atomic transaction;
- `lease`: a valid lease protects the declared `leaseScope`;
- `none`: no concurrency boundary.

`mutationHash` identifies the intended payload or operation and must be formatted as `sha256:<64 lowercase hex characters>`. MomentSeal preserves it in the hashed plan but does not interpret payload content.

`scopeHash` binds the action to the same effective authority/resource scope recorded by its observation and commit state. Lease and revalidation scope values must match it when scope binding is required.

Set `irreversible` when compensation cannot reliably restore the prior state—for example sending money, publishing credentials, deleting an unversioned object, or contacting an external party.

Irreversible revalidation is a tuple: `revalidatedAt`, `revalidatedVersion`, and `revalidatedScopeHash`. Supplying only part of the tuple is structurally invalid.

## Temporal rules

For action `a` bound to observation `o` and commit state `s`, the compiler evaluates:

```text
0 <= a.commitAt - o.observedAt <= policy.maximumCheckUseGapMs
a.commitAt <= o.expiresAt
o.version == s.currentVersion
s.capturedAt <= a.commitAt
a.commitAt - s.capturedAt <= policy.maximumCommitStateAgeMs
o.scopeHash == s.scopeHash == a.scopeHash
```

It then checks that the selected consistency mechanism can enforce the same version at the actual write boundary. A compiler pass is useful evidence, but the runtime must still make its conditional request or transaction atomically.
