# Improve codebase architecture reference

This reference is tuned for this repo (TanStack Router and Start + Convex + generated domain data; there is no TanStack Query, since Convex subscriptions replace the client cache).

## Repo-specific context

- App code centers around `src/app/**` with route-driven composition.
- Backend/data boundaries run through `convex/**`.
- Validation convention is documented in `docs/data-layer.md`:
  - Convex `v` validators for boundary shape checks
  - shared Zod schemas for semantic/business validation

Use this file to classify coupling, choose a deep-module strategy, and draft RFC issues.

## Dependency categories (use one primary category)

### 1. In-process

Pure computation or in-memory orchestration with no external I/O.

- Typical in this repo:
  - transformation pipelines in `src/app/**`
  - UI state derivation and view-model mapping
- Deepening move:
  - merge thin helpers into one boundary and test behavior at the boundary API

### 2. Local-substitutable

Dependency can be replaced locally in tests with realistic stand-ins.

- Typical in this repo:
  - Convex access wrappers and query/mutation orchestration around testable adapters
  - filesystem- or generation-adjacent helpers under `scripts/**`
- Deepening move:
  - keep external touchpoints behind a seam and test the deep module with deterministic stand-ins

### 3. Remote but owned (ports and adapters)

A network/process boundary that is still under team control.

- Typical in this repo:
  - client-to-Convex function boundaries
  - internal API seams between domain modules
- Deepening move:
  - define a port at the deep module boundary
  - keep transport/runtime concerns in adapters
  - test module behavior via in-memory/fake adapters

### 4. True external (mock boundary)

Third-party systems not owned by the team.

- Typical in this repo:
  - external auth/provider surfaces
  - deployment/runtime integrations
- Deepening move:
  - inject dependency via a boundary interface and mock at tests

## Testing strategy

Core rule: replace seam-heavy tests with boundary tests.

- Prefer tests that assert observable outcomes at the deepened interface.
- Delete shallow unit tests that duplicate behavior once boundary coverage exists.
- Keep tests resilient to internal refactors.

## RFC issue template

Use this body when the user asks to publish an issue.

```md
## Summary
- Candidate cluster: <modules/concepts>
- Primary dependency category: <in-process|local-substitutable|remote-owned|external>
- Why now: <friction/risk/velocity impact>

## Problem
- Where coupling exists
- Which seams create bugs or cognitive load
- Why current module boundaries are shallow

## Proposed deep module boundary
- Interface signature: <types/methods/params>
- What the boundary hides: <internal complexity>
- Dependency strategy: <injection|factory|ports-adapters|mock boundary>

## Alternatives considered
- Option A: <trade-offs>
- Option B: <trade-offs>

## Migration plan
1. Introduce the new boundary alongside existing paths
2. Migrate callers incrementally
3. Remove old seams after parity and validation

## Test strategy
- New boundary tests to add
- Existing seam-heavy tests to remove
- Any local stand-ins or adapters required

## Risks and mitigations
- <risk 1> -> <mitigation>
- <risk 2> -> <mitigation>
```
