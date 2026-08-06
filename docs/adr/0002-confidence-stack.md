# ADR-0002: The confidence stack — types first, seam suites second, few happy-path e2e on top

**Status:** Accepted (2026-08-06)

## Context

The project was founded on the idea that shared schema validators (originally
Zod) would drive type safety on both sides — Convex and the app — and that a
happy-flow e2e test would provide the real confidence signal. Feature work
drifted from that: transport shapes grew a parallel hand-written Convex
validator layer, client types restated server contracts by hand, and test code
accumulated mid-stack. At the time of this ADR the distribution is ~4,000 lines
of Convex integration suites and ~2,300 lines of client seam/component tests
against **287 lines of e2e** — the layer trusted most is the thinnest.

## Decision

Confidence comes from three layers, in priority order:

1. **Type safety is the foundation.** Every shape has exactly one authority,
   and everything else derives from it:
   - Where a semantic Zod schema exists (e.g. canonical faction data), Zod is
     the authority; Convex validators should derive from it (e.g. via
     `zodToConvex` from `convex-helpers`) rather than restate it or escape to
     `v.any()`.
   - Plain document shapes derive from `convex/schema.ts`
     (`schema.tables.<t>.validator`).
   - Client types derive from the server contract (`FunctionReturnType`,
     `ReturnType<typeof normalize>`), never hand-restated (ADR-0001).
   - Closing a type hole is always preferred over adding a test for the same
     failure class.
2. **Seam-level suites cover what types cannot express.** The Convex
   boundary-suite pattern (in-memory Convex, public query/mutation seam) is the
   approved unit-test shape. Suites are sized to behavioral rules — visibility,
   ordering, capabilities, lifecycle transitions — not permutation matrices,
   and never reach into internals (ADR-0001).
3. **A few happy-path e2e specs are the confidence anchor.** Each major user
   flow gets one end-to-end spec exercising the real stack. Error cases and
   permutations stay in layer 2.

Sequencing rule: when retiring mid-stack tests, reinforce the top first — an
e2e spec or type guarantee must exist before the tests it supersedes are
deleted, and deletions are listed with what now carries their confidence.

**Exemption:** the publisher/ops regression suites (font, capture contract,
deployment contract, live drift) stay as-is — they guard rendered output and
infrastructure state that no type system or e2e spec can express.

## Consequences

- New tests need a reason a type guarantee or an existing e2e path cannot
  cover; "more coverage" is not a reason.
- #236 is aimed at Zod-derived validators, not just validator deduplication.
- #241 adds group-membership and FAQ happy-path e2e specs, then retires the
  client seam tests made redundant by derived types (#234).
- Architecture reviews should flag test accumulation against this stack the
  same way they flag shallow modules.
