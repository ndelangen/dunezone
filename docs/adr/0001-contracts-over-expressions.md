# ADR-0001: Contracts over expressions — inference-first types, interface-level tests

**Status:** Accepted (2026-08-06)

## Context

During the merge of PR #232 (issue #199), a source-text assertion in
`collaborativeAccessCallers.architecture.test.ts` — a grep for the literal
annotation `groupSummaries: AssignedGroupSummary[]` — forced a fully derived
client page type back into a hand-written one. The test dictated the API's
expression. Separately, full-object `toEqual` assertions on page models failed
on additive, correct changes, and issue #203 records pure-helper tests standing
in for interface tests. The test suite's churn (the architecture test changed
6 times in 60 commits) tracked development velocity, not defects.

## Decision

1. **Types derive from their owner.** Client transport and page types are
   derived (`FunctionReturnType`, `ReturnType<typeof normalize>`, `Infer`)
   from the server contract, not hand-restated. A hand-written annotation is
   acceptable only where derivation is impossible, never to satisfy a test.
2. **Tests assert contracts through public interfaces.** A test may exercise a
   module only through the same seam its callers use. Tests must not assert on
   source text, file bytes, import spellings, local identifier names, or JSX
   formatting. Structural guarantees ("field X never reaches the client")
   belong in `returns` validators and the type system, not in greps.
3. **Tests must tolerate additive change.** Prefer asserting the specific
   behavior under test over whole-object equality of page models.
4. **Testability never dictates API shape.** When a test blocks a better
   interface expression, the test is the defect.

## Consequences

- The literal-annotation assertion was removed in PR #232; issue #233 retires
  the remaining source-text assertions in favor of validator and type-level
  guarantees, deleting rather than translating where the compiler already
  enforces the intent.
- Convex boundary suites (e.g. `convex/profiles.detail.test.ts`) are the
  approved testing shape: they cross the public query seam.
- Future architecture reviews should not propose source-text contracts or
  hand-annotated restatements of derivable types.
