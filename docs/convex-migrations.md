# Convex Migrations Runbook

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
- Migration entrypoints should stay internal or admin-only.
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
  - `narrow`: schema-narrow checkpoint gated on completed widen work
- `requires`: widen migration ids that must be `success + isDone=true` before narrow is allowed

## Current asset-publisher migration pack

The item-only paid-plan release uses these widen migrations:

- `asset_targets_item_claims_v1`
- `asset_claim_snapshots_retire_v1`
- `asset_publisher_state_retire_v1`
- `asset_publisher_admission_counter_retire_v1`
- `asset_targets_item_claims_verify_v1`

They are run alongside the repo's other widen migrations from the same guard manifest.

### Preconditions

- The faction-sheet publisher config must be `paused` or `disabled`.
- No live item claim may exist when `asset_targets_item_claims_v1` runs.
- The later schema narrow must wait for all required widen migrations to complete successfully.

### What the migration pack does

`asset_targets_item_claims_v1` converts legacy target coordination into the new per-target
item-claim shape. It:

- converts legacy `cooldown` targets back to plain `pending`;
- initializes `consecutive_render_failures` without interpreting historical retry counts;
- preserves blocked targets by forcing them to at least the ten-failure threshold;
- clears retired retry timing, batch, claim, payload-hash, and admission-era fields; and
- fails closed if publishing is active or a live claim is still leased.

The retirement steps then remove the old tables and singleton state that no longer participate in
runtime behavior:

- `asset_claim_snapshots_retire_v1` deletes legacy claim snapshots;
- `asset_publisher_state_retire_v1` deletes the retired singleton publisher state; and
- `asset_publisher_admission_counter_retire_v1` deletes the first-publication counter.

`asset_targets_item_claims_verify_v1` is the per-target proof pass. It fails if a target still has
legacy fields, an invalid failure counter, or an impossible blocked-state combination.

## Automated production flow

1. Deploy widen-compatible Convex code: `bun run convex:deploy`
2. Deploy workflow runs `bun run migrations:deploy`
3. That command starts the required widen migrations, polls readiness, and syncs status snapshots
4. Deploy fails if any required migration is incomplete, failed, or times out
5. A later narrow release may merge only after `bun run migrations:narrow-check` passes

## Strict local dev startup

Convex dev startup is fail-closed on required migrations so long-lived local environments do not
drift from the checked-in guard manifest.

- `bun run convex:dev` runs `bun run migrations:dev-strict` before starting Convex
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
npm run convex:deploy

# Start or resume required manifest migrations and wait for readiness
bun run scripts/migration-guards.ts deploy 2700000 5000 --prod

# Check narrow prerequisites only
bun run scripts/migration-guards.ts narrow-check --prod

# Strict local/dev startup preflight
bun run scripts/migration-guards.ts dev-strict 300000 2000

# Alias used by convex:dev and for manual local catch-up
bun run migrations:run-local-required

# Raw status for selected ids
npx convex run migrations:getStatus '{"ids":["asset_targets_item_claims_v1","asset_targets_item_claims_verify_v1"]}' --prod
```

## Templates and references

- Convex template scaffold: [`convex/migrationsTemplate.ts`](../convex/migrationsTemplate.ts)
- Team migration skill:
  [`.agents/skills/convex-migration-helper/SKILL.md`](../.agents/skills/convex-migration-helper/SKILL.md)
