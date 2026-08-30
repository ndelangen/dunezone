# Convex migrations runbook

Required process for all breaking Convex schema and data migrations in this repo.

## When this runbook is required

Use this process when a change can invalidate existing production documents, including:

- adding a required field to an existing table;
- changing a field type or shape;
- renaming or removing a persisted field; or
- moving data between tables.

## Required rollout: widen -> migrate -> verify -> narrow

1. **Widen**
   Deploy schema and code that accept both legacy and new shapes.

2. **Compatibility window**
   New writes emit the new shape. Reads tolerate both shapes. Do not narrow here.

3. **Migrate**
   Run bounded, idempotent backfill or retirement work in production.

4. **Verify**
   Prove that no unmigrated rows remain and that the new invariants hold.

5. **Narrow**
   Remove legacy schema branches, compatibility reads, and temporary migration entrypoints in a
   later release.

## Production policy

- Migration code is committed and deployed with app code.
- Production deploy automatically runs required widen migrations.
- Deployment entrypoints are internal functions invoked by the Convex CLI with its deploy key.
- The browser dashboard returns migration data after proving the viewer is an active administrator.
- Browser-triggered snapshot sync requires an administrator; deployment uses its internal twin.
- A narrowing deploy is blocked until verification reports zero remaining legacy state.

## Guard manifest contract

Source of truth: [`convex/migration-guards.json`](../convex/migration-guards.json)

```json
{
  "entries": [
    { "id": "groups_slug_v1", "phase": "widen", "requires": [] },
    { "id": "groups_slug_narrow", "phase": "narrow", "requires": ["groups_slug_v1"] }
  ]
}
```

Rules:

- `id`: unique migration or narrow guard identifier
- `phase`:
  - `widen`: auto-started in deploy
  - `narrow`: schema-narrow checkpoint added with the later release that performs the narrowing
- `requires`: widen migration ids that must be `success + isDone=true` before narrow is allowed

## Automated production flow

1. Before changing the deployed schema, the deploy workflow runs
   `bun run migrations:narrow-check` against the currently deployed migration entrypoints.
2. Deploy widen- or narrow-compatible Convex code: `bun run convex:deploy`.
3. Deploy workflow runs `bun run migrations:deploy`.
4. That command starts every listed widen migration, polls all of them to readiness, and syncs status snapshots.
5. Deploy fails if any narrow prerequisite or required migration is incomplete, failed, or times out.

## Strict branch and integration startup

Use `bun run app:dev --local` to validate a branch against its own production-shaped database. The
command creates a worktree-owned Convex stack, pushes the checked-out schema and functions, imports
and scrubs a production snapshot, then runs the required migration guards before starting the app.
It then keeps a supervised local Convex watcher running so later function and schema edits stay
inside the same worktree-owned stack without changing `.env.local`. Restart the command after
changing a migration module or the guard manifest. The restart rebuilds the disposable database and
reruns `dev-strict`.

- `bun run convex:dev` runs `bun run migrations:dev-strict` before starting the configured Convex
  deployment's watcher. It is reserved for deliberate integration work because a feature branch can
  replace the shared cloud dev functions and schema.
- `dev-strict`:
  - reads `convex/migration-guards.json`
  - starts required migrations for the local deployment
  - polls `migrations:assertReadyForNarrow`
  - syncs `migration_runs`
  - exits non-zero on timeout or failure

### Failure modes and diagnostics

- timeout before required work completed;
- auth or deployment mismatch; or
- manifest mismatch between code and requested ids.

On failure, the command prints the required ids, latest statuses, and the exact retry command.

## PR and release checklist

- [ ] Widen phase implemented and deployed first
- [ ] Compatibility reads and writes cover the migration window
- [ ] Backfill or retirement work is bounded and idempotent
- [ ] Verification exists and proves the target invariants
- [ ] Narrow phase is separate and waits for verified completion
- [ ] Temporary fallback and migration code has a later cleanup plan

## Commands

```bash
# Deploy widen or narrow-compatible Convex code
bun run convex:deploy

# Start or resume required manifest migrations and wait for readiness
bun run scripts/migration-guards.ts deploy 2700000 5000 --prod

# Check narrow prerequisites only
bun run scripts/migration-guards.ts narrow-check --prod

# Strict startup preflight for the selected deployment
bun run scripts/migration-guards.ts dev-strict 300000 2000

# Alias of migrations:dev-strict, for manual local catch-up.
# (convex:dev runs `migrations:dev-strict && convex dev` — it does not call this alias.)
bun run migrations:run-local-required

# Static guard: fails a PR that narrows a slug field. Runs in PR CI.
bun run migrations:static-check
```

## Templates and references

- Convex template scaffold: [`convex/migrationsTemplate.ts`](../convex/migrationsTemplate.ts)
- Team migration skill:
  [`.agents/skills/convex-migration-helper/SKILL.md`](../.agents/skills/convex-migration-helper/SKILL.md)
