<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project Quick Context

- Start with [`docs/README.md`](docs/README.md) for architecture and workflow links.
- Stack: TanStack Router/Query, Convex, Vite, and Storybook.
- Non-obvious workflow: `npm run generate` refreshes generated game data outputs.
- `bun run app:dev` uses the configured online Convex deployment. Add `--local` for the
  disposable Docker-backed environment with local test auth and a read-only copy of active
  production factions; see `docs/README.md`.

## Worktree Freshness

- Before making any edits in a Codex-managed worktree, run `bun run worktree:setup`.
- This command must fetch the remote before deciding whether the checkout is current. Never treat
  an existing remote-tracking ref as proof that the selected base branch is up to date.
- If the command reports a dirty, attached, or divergent stale checkout, stop and resolve that
  state instead of building changes on the stale base.
- The checked-in `Fresh default branch` Codex local environment runs this preflight automatically
  when a new worktree is created, then installs the frozen dependency graph.

## Validation Convention

Follow the canonical validation guidance in [`docs/data-layer.md`](docs/data-layer.md):

- Convex `v` validators for boundary shape/type checks.
- Shared Zod schemas parsed in Convex handlers (`safeParse`) for authoritative semantic/business rules.
- Client-side parsing only for UX feedback.

Type-safety and testing strategy follows
[ADR-0002 (the confidence stack)](docs/adr/0002-confidence-stack.md): every shape has one
authority and everything else derives from it; seam-level suites cover only what types cannot
express; a few happy-path e2e specs are the confidence anchor. Before adding a test, check
whether a type guarantee or an existing e2e path already covers it. Tests never assert on source
text or dictate API shape ([ADR-0001](docs/adr/0001-contracts-over-expressions.md)).

Before opening or updating any PR that changes application code, publisher code, or release
assets, run `bun run publisher:release:verify`. The publisher Worker contains the application
release, while its Renderer identity intentionally excludes application-only shell and chunk
files. A generated manifest diff must be resolved before push, not discovered by PR CI.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
