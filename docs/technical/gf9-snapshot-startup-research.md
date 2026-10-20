# Existing anonymised snapshot startup for GF9

The current launcher fails on the table-number conflict with both the previous weekly snapshot and a fresh post-GF9 snapshot. A controlled import-before-code experiment passes archive import, code deployment, the existing second import, Rulebook draft seeding and the rebuild contract. This is evidence for changing clean bootstrap ordering. No application or provisioning source was changed.

This report resolves [Verify the existing anonymised snapshot startup for GF9](https://github.com/ndelangen/dunezone/issues/2368). Persistence and the isolated publication environment remain decisions in [Choose the isolated publishing runtime for local GF9 review](https://github.com/ndelangen/dunezone/issues/2367).

## Scope and runtime

Research ran on 20 October 2026 from freshly fetched main `77c26fcfa1a5ff61ae36b087fb55150f4da99497`, in branch `research/gf9-snapshot-startup`. `bun run worktree:setup` confirmed the base. Node was 24.21.0, Bun 1.4.2, Convex CLI 1.46.0 and Docker client/server 29.8.1. Dependencies came from `bun install --frozen-lockfile`.

The backend image was the checked-in digest `sha256:d3338c4a78b622aa4d8b8ed6cdb114d8f7610efc91cdf61769c39314b79bb881`. The Compose comment identifies backend release `a3538c6`, resolved to upstream commit `a3538c6d212948f20726868e41d155d2534cd130`. The backend `/version` endpoint returned `unknown`, so it supplies no independent release identity. The dashboard image digest was `sha256:6320593f529ab6210d4da473c7f84e491e5d6adbd86c26fb5cc3001c6c32ae42`. See [the pinned Compose configuration](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/docker-compose.convex-local.yml).

The first launcher invocation stopped before Docker because this machine had no `.env.e2e.local` in the worktree or main checkout. The reproduction then supplied `LOCAL_DEV_ENV_FILE` pointing to a private temporary copy of `.env.e2e.local.example`, with fresh synthetic test passwords. No real credential file changed. The standard [local credential fallback and startup contract](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/docs/README.md#disposable-local-app-development) remains the required entry point.

## Trusted snapshot identities and GF9 coverage

Both archives came through the existing `resolveLocalSnapshot` function and its GitHub workflow provenance checks. Both passed the existing anonymiser manifest/count checks and leak scan before any Docker launch. No raw production export was downloaded, and no production or shared-development write was made. See [the trusted resolver](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/local-snapshot.ts) and [archive verification](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/snapshot-anonymise.ts#L59).

| Archive | Workflow run | Artifact | SHA-256 | Bytes |
| --- | --- | --- | --- | --- |
| Previous weekly | [Successful scheduled run](https://github.com/ndelangen/dunezone/actions/runs/39239974637) | `12181450350` | `5e13aee10f9992420320b29a5e559eb38314434b4e0c9d10c5f809841f0731e7` | 393059 |
| Fresh post-GF9 | [Successful manual run](https://github.com/ndelangen/dunezone/actions/runs/39391393256) | `12249482375` | `2c08d723ff5f67a987570699eea710c19765131805a26df61fb875d8da68a3e6` | 553684 |

The previous archive was created on 19 October at 10:47:55 UTC from `9eae59b3571ad2cb6b7b0e9ae8523afd1e0140b2`. It has three Rulesets, three Groups, four Rulebooks, 46 factions and 146 assets. It has no GF9 Ruleset, Group, Rulebook or faction names and cannot supply the delivered GF9 baseline.

The fresh archive was created on 20 October at 08:10:09 UTC from `77c26fcfa1a5ff61ae36b087fb55150f4da99497`. Relationship checks, rather than names alone, confirm one GF9 Ruleset and Group, four Rulebooks attached to that Ruleset, twelve linked factions, twelve factions assigned to the GF9 Group and 235 assets assigned to it. The full archive contains eight Rulebooks, 58 factions and 342 assets. This establishes the required GF9 coverage in the selected existing snapshot system.

The fresh archive manifest has these row counts. Placeholder owner IDs are deliberately omitted here.

```json
{
  "factions": 58,
  "faq_items": 2,
  "groups": 4,
  "profiles": 1,
  "ruleset_factions": 30,
  "rulesets": 4,
  "users": 1,
  "asset_relations": 331,
  "assets": 342,
  "ruleset_asset_slots": 23,
  "rulebook_editions": 14,
  "rulebooks": 8,
  "rulebook_edition_artifacts": 28,
  "rulebook_edition_contents": 14,
  "cardback_presets": 6,
  "card_front_presets": 3,
  "board_readiness": 2,
  "faction_cards": 58
}
```

## Reproduced failure and cause

Two unmodified invocations of the existing launcher used the validated archives via `--snapshot-file`. Both configured local auth, deployed the checked-out functions/schema and then failed in `convex import --replace-all -y` with exactly:

```text
conflict between `authAccounts` and `board_readiness` with table number 10051
```

The launcher failed before draft seeding, the rebuild contract, migration guards, Vite readiness, local account creation or ownership remapping. These downstream steps were not run by either failing launch. Both supervisors removed their own containers and volumes.

A separate disposable instance using the same `backendUp`, `configureLocalAuth` and `pushCode` helpers captured the target's complete table map before import. `authAccounts` starts at 10008 and `board_readiness` at 10014. Schema deployment does **not** directly assign `authAccounts` to 10051. The source archive instead assigns `factions` to 10008 and `board_readiness` to 10051.

The pinned upstream importer explains the later collision:

1. Explicit source `_tables` mappings reserve `factions=10008` and `board_readiness=10051` in the import plan.
2. In replace-all mode, schema tables missing from the archive still need empty replacement tables. `authAccounts` is such a table. Its existing 10008 is already claimed by imported `factions`, so the importer leaves its requested number unspecified.
3. Preparation creates hidden tables in name order. A fresh allocation for displaced `authAccounts` can take the next available target number, 10051, before imported `board_readiness` is prepared.
4. The prepared-table validation detects two imported table names at 10051 and refuses before committing imported rows.

This cause is supported by the actual source/target maps, the exact observed error and the importer at the pinned backend revision. The fresh allocation internals were not instrumented. The importer itself documents this precise class: fresh allocations left unspecified can conflict with an explicitly assigned imported table number. See [assignment and preparation](https://github.com/convex/convex-backend/blob/a3538c6d212948f20726868e41d155d2534cd130/crates/application/src/snapshot_import/mod.rs#L798), [replacement of schema tables omitted from the archive](https://github.com/convex/convex-backend/blob/a3538c6d212948f20726868e41d155d2534cd130/crates/application/src/snapshot_import/mod.rs#L1253), [the prepared-number collision check](https://github.com/convex/convex-backend/blob/a3538c6d212948f20726868e41d155d2534cd130/crates/application/src/snapshot_import/mod.rs#L913) and [hidden-table creation](https://github.com/convex/convex-backend/blob/a3538c6d212948f20726868e41d155d2534cd130/crates/application/src/snapshot_import/mod.rs#L1659).

## Controlled ordering experiment

A fourth owned disposable instance tested the fresh archive with this sequence, using temporary research code outside the repository:

1. Verify the trusted archive before Docker starts.
2. Start a clean Docker backend without deploying application schema.
3. Import the archive with the same explicit local `convex import --replace-all -y` command.
4. Configure local auth and deploy the checked-out functions/schema with the existing helpers.
5. Call existing `loadSnapshotData` unchanged. This deliberately imports a second time, then runs its existing draft seed and rebuild contract.
6. Run the existing migration guards.

The early import succeeded. Code deployment over the imported content succeeded. The existing second import added 929 documents, seeded eight Rulebook drafts and passed `provisioningChecks:assertRebuildContract` with `{"ok":true}`. This proves the table mapping established before schema avoids the conflict and that the existing seeding/check contract accepts the fresh archive afterward. The eventual bootstrap should import once. This experiment kept the existing combined loader unchanged so it could verify its current seed and contract behavior.

The existing `dev-strict` migration guard completed successfully for all 72 required migrations. A local-only export afterward held eight Rulebook drafts, eight Rulebooks, 58 factions, 342 assets and 72 migration-run records. All 18 source table numbers were preserved, including `board_readiness=10051`; `authAccounts` received 10006. All auth account/session tables were empty and `users`/`profiles` still held only the anonymous placeholder. Reviewer sign-in, ownership remapping and browser editing were not run in this controlled experiment. The instance was then removed with the existing `composeDown` helper.

## Smallest recommended correction

For a **new, empty local environment** using the existing trusted snapshot system, split archive import from post-import functions:

- Keep the existing trusted download selection, archive manifest/count validation, leak scan and local-only target guards.
- Import the archive before the first application schema deployment.
- Configure auth and deploy code after import.
- Then run existing Rulebook draft seeding and the existing rebuild contract, followed by the migration guards, reviewer sign-in and ownership remapping.
- Delete a launcher-downloaded archive using the same existing success/failure cleanup contract. Explicit `--snapshot-file` files remain caller-owned.

`loadSnapshotData` currently combines archive import with calls to deployed functions. Moving that whole function before deployment will fail because the seeding and contract functions do not exist yet. Separate its verified import step from its post-deploy seed/check step. See [the current combined data loader](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/provision.ts#L351) and [current launcher ordering](https://github.com/ndelangen/dunezone/blob/77c26fcfa1a5ff61ae36b087fb55150f4da99497/scripts/app-dev.ts#L292).

This is a clean-bootstrap correction, not a general replacement strategy for a nonempty shared deployment. Do not change cloud-dev rebuild ordering, rewrite source document IDs, patch archive table numbers, add dropped real auth tables, bypass anonymisation or upgrade the backend without separate evidence. Persistent resume must not run `backendUp`, which currently calls `compose down -v`, or reimport the baseline. Those persistence changes belong to the runtime decision.

## Repeatable verification and limits

Use the existing trusted resolver to select the newest successful main `Anonymised snapshot` workflow artifact. Record its run, artifact, code SHA, archive SHA-256, manifest counts and GF9 relationship counts. Do not substitute fixtures after a snapshot failure.

From a fresh checkout at the recorded source commit:

```bash
bun run worktree:setup
bun install --frozen-lockfile
LOCAL_DEV_ENV_FILE=/absolute/private/local.env bun run app:dev --local --data=snapshot --snapshot-file /absolute/private/snapshot.zip
```

The current source reproduces the conflict. A future implementation must repeat actual disposable startup using the corrected bootstrap sequence. Its acceptance must prove all of these:

- Trust checks still reject a raw export, unknown workflow/fork, failed run, expired artifact and dirty leak scan before target writes.
- The current fresh GF9 snapshot imports on two independent new local instances without table-number conflicts or altered production IDs.
- Post-deploy draft seeding covers every live Rulebook and the rebuild contract passes before real local reviewers exist.
- Migration guards complete, both synthetic local accounts can sign in, and local reviewer ownership/membership lets the intended GF9 editing actions work.
- Resume reopens the same persisted database and stored media without reimporting, reseeding or deleting them. An explicit Reset alone rebuilds the baseline.
- Publication, ingest and public artifact delivery are separately proven against isolated services. Snapshot import success supplies no such proof.

Research produced no application patch, PR or production change. It does not claim a working persistent authoring environment.

## Table-map evidence

The table names and numeric allocations below contain no user/account values. The source map is from the fresh trusted archive. The target map is from a separate clean schema-first deployment at the same code and image identity.

| Table | Fresh source number | Schema-first target number |
| --- | --- | --- |
| account_connections | absent | 10001 |
| account_deletion_items | absent | 10002 |
| account_deletion_operations | absent | 10003 |
| account_merge_operations | absent | 10004 |
| admin_settings | absent | 10005 |
| asset_relations | 10029 | 10006 |
| assets | 10030 | 10007 |
| authAccounts | absent | 10008 |
| authRateLimits | absent | 10009 |
| authRefreshTokens | absent | 10010 |
| authSessions | absent | 10011 |
| authVerificationCodes | absent | 10012 |
| authVerifiers | absent | 10013 |
| board_readiness | 10051 | 10014 |
| card_front_presets | 10050 | 10015 |
| cardback_presets | 10043 | 10016 |
| catalogue_entries | absent | 10017 |
| content_import_receipts | absent | 10018 |
| counters | absent | 10019 |
| faction_cards | 10053 | 10020 |
| factions | 10008 | 10021 |
| faq_answers | absent | 10022 |
| faq_items | 10010 | 10023 |
| former_slugs | absent | 10024 |
| group_members | absent | 10025 |
| groups | 10012 | 10026 |
| homepage_tickets | absent | 10027 |
| leader_skill_stock_sets | absent | 10028 |
| migration_runs | absent | 10029 |
| play_account_deletions | absent | 10030 |
| play_auth_registrations | absent | 10031 |
| play_game_accounts | absent | 10032 |
| play_game_slug_cursors | absent | 10033 |
| play_game_slug_reservations | absent | 10034 |
| play_games | absent | 10035 |
| play_session_cutoffs | absent | 10036 |
| play_tickets | absent | 10037 |
| profiles | 10013 | 10038 |
| publication_assets | absent | 10039 |
| publication_jobs | absent | 10040 |
| rulebook_drafts | absent | 10041 |
| rulebook_edition_artifacts | 10036 | 10042 |
| rulebook_edition_contents | 10037 | 10043 |
| rulebook_editions | 10034 | 10044 |
| rulebooks | 10035 | 10045 |
| ruleset_asset_slots | 10031 | 10046 |
| ruleset_factions | 10014 | 10047 |
| rulesets | 10015 | 10048 |
| user_image_ingest_tokens | absent | 10049 |
| users | 10016 | 10050 |

Sanitized local evidence is under `/Users/me/Projects/Dune/gf9-delivery/wayfinder/snapshot-startup-evidence`. Full local exports, synthetic passwords, admin keys, JWT files and downloaded archives are temporary research inputs and are not committed.
