# Policy reference

A policy targets exactly one `planId`.

| Field | Description |
| --- | --- |
| `maximumObservationAgeMs` | Maximum evidence age at commit |
| `maximumCheckUseGapMs` | Maximum interval between observation and action |
| `maximumRevalidationAgeMs` | Maximum age of irreversible-action revalidation |
| `minimumAuthority` | Minimum observation authority, 0–100 |
| `requireConditionalForMutations` | Reject mutations using `consistency: none` |
| `requireRevalidationForIrreversible` | Require recent `revalidatedAt` |
| `maximumDependencyDepth` | Maximum longest path in the action graph |

## Suggested profiles

These are starting points, not universal security levels.

| Profile | Observation / gap | Revalidation | Authority | Depth |
| --- | ---: | ---: | ---: | ---: |
| Advisory read-only | 15 min | 5 min | 60 | 8 |
| Standard automation | 5 min | 60 sec | 80 | 4 |
| Financial / destructive | 30 sec | 5 sec | 95 | 2 |

Use the shortest window the source system and runtime can reliably support. Fresh timestamps do not compensate for a missing atomic guard.

## Decision semantics

- `clean`: no compiler finding blocks the plan;
- `review`: reserved for policy extensions that emit warnings;
- `blocked`: at least one invariant is violated.

The score is a compact operator signal, not a probability. Enforcement should use `status` and finding codes, never a score threshold alone.
