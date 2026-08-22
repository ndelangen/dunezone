# ADR-0001: Contracts over expressions. Inference-first types, interface-level tests

**Status:** Accepted (2026-08-06)

## Context

During the merge of PR #232 (issue #199), a source-text assertion in
`collaborativeAccessCallers.architecture.test.ts`, a grep for the
literal annotation `groupSummaries: AssignedGroupSummary[]`, forced a
fully derived client page type back into a hand-written one. The test dictated the API's
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

   **Narrow exception, a rule about the tree rather than about a
   module.** A source scan is allowed only where the guarantee is a
   property of the *file tree* that no type or lint rule can express,
   and every such suite must name this ADR and say why. Three exist, and
   the list is meant to stay short:
   - `src/app/ui/layout/PageLayout.architecture.test.ts`: every terminal
     visual route mounts `PageLayout`. "Every file in this directory
     does X" is not something a type can say.
   - `src/game/rendererIsolation.test.ts`: no renderer source mentions
     `@mantine`, `@radix-ui`, or the app's component paths. This one
     asserts import spellings deliberately, because the guarantee is the
     *absence* of a dependency, and absence has no type to hang off. The
     lint boundary in `.oxlintrc.json` covers `src/app/ui`; it does not
     cover `src/game`.
   - `src/app/ui/layout/containerQueries.test.ts`: no layout stylesheet uses a
     `@media` query, since a Layout lays out by the room it is given. The
     guarantee is again the absence of a spelling across a directory, and
     `PageLayout` is the one exemption the suite encodes.

   A scan that could have been a validator, a type, or a lint rule is still a
   defect. Adding a fourth entry here should feel expensive.
3. **Tests must tolerate additive change.** Prefer asserting the specific
   behavior under test over whole-object equality of page models.
4. **Testability never dictates API shape.** When a test blocks a better
   interface expression, the test is the defect.

## Consequences

- The literal-annotation assertion was removed in PR #232, and issue #233 (now
  closed) retired the remaining source-text assertions in favor of validator and
  type-level guarantees, deleting rather than translating where the compiler
  already enforced the intent. What survives is the three tree-level scans above.
- Convex boundary suites (e.g. `convex/profiles.detail.test.ts`) are the
  approved testing shape: they cross the public query seam.
- Future architecture reviews should not propose source-text contracts or
  hand-annotated restatements of derivable types.
