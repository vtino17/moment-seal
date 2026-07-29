# Contributing

MomentSeal welcomes focused bug fixes, backend adapters, and new consistency invariants.

1. Open an issue describing the unsafe plan and the expected finding.
2. Keep compiler behavior deterministic and side-effect free.
3. Add a test that fails without the proposed invariant.
4. Run `pnpm check`.
5. Document new fields or finding codes.

Changes to receipt hashing, status semantics, or JSON contracts require an explicit versioning discussion. Avoid findings that attempt to judge business intent; MomentSeal focuses on temporal and concurrency evidence.
