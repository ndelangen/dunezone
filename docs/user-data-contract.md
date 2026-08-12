# User Data Contract

## Purpose

Define which user-related fields belong to Convex Auth tables vs app-level profile tables.

## Source of Truth by Table

- `users` (from `authTables`)
  - Auth-owned identity record.
  - Provider-sourced identity defaults (`name`, `image`, `email`, phone fields).
  - Primary key is Convex `Id<"users">` (stored as string in app-facing records).
- `authAccounts` (from `authTables`)
  - Provider linkage metadata (`provider`, `providerAccountId`, secrets/verification fields).
  - Internal to authentication and account-linking.
- `profiles` (app-owned)
  - Public/app-facing user profile model.
  - Editable fields and URL semantics:
    - `username`
    - `avatar_url`
    - `slug`
    - `created_at`, `updated_at`
  - One profile per auth user (`profiles.user_id` maps to `Id<"users">`).

## Identifier Conventions

- Convex `_id` is the canonical internal identifier for domain entities (`profiles`, `groups`,
  `factions`, `rulesets`, `faq_items`, `faq_answers`).
- URL-facing lookups should use slug fields (for example `profiles.slug`, `factions.slug`) rather
  than exposing internal `_id` semantics in presentation logic.
- Relation fields should use Convex references (`v.id(...)`) rather than custom app-level ids:
  - `group_members.group_id -> Id<"groups">`
  - `ruleset_factions.ruleset_id -> Id<"rulesets">`
  - `ruleset_factions.faction_id -> Id<"factions">`
  - `faq_items.ruleset_id -> Id<"rulesets">`
  - `faq_answers.faq_item_id -> Id<"faq_items">`

## Why `profiles` Exists

- We need app-owned read/write semantics independent from auth internals.
- We need a stable, unique public slug with deterministic regeneration rules.
- We need explicit public-facing profile queries (`by_slug`) and update policies.
- We avoid coupling product behavior to provider data shape changes.

## Mutation Rules

- Authentication/authorization is enforced with `getAuthUserId()` and `requireAuthUserId()`.
- **On sign-in**, Convex Auth runs `afterUserCreatedOrUpdated`, which ensures a `profiles` row via `ensureProfileForUser` from the `users` document (no reliance on `ctx.auth` identity in that internal mutation).
- **`createProfileIfMissing`** (used by `bootstrapCurrent` and `updateCurrent`) merges JWT/session identity with the `users` row, then delegates to `ensureProfileForUser` for insert or backfill of missing `username` / `avatar_url`.
- **`profiles_from_users_v1`** ([`convex/migrations.ts`](../convex/migrations.ts)) walks `users` and creates any missing `profiles` rows using the same rules; it is part of the guarded migration set in [`convex/migration-guards.json`](../convex/migration-guards.json) and runs with deploy / dev-strict (see [`docs/convex-migrations.md`](./convex-migrations.md)).
- If an existing profile is missing `username` or `avatar_url`, bootstrap backfills those two fields
  only, from the identity / auth user (image for the avatar).
- `slug` is allocated **once, on insert** — `slugify` plus a uniqueness walk on `profiles.by_slug`
  (`allocateUniqueProfileSlug`). Bootstrap never re-slugs an existing row; only an explicit
  `updateCurrent` username change recomputes it. The insert-time fallback username is `nameless`.
- `updateCurrent` lets users edit `username` and `avatar_url`; username changes recompute slug, and both display name and avatar URL are required.

## Query Rules

- UI and app domain hooks should read profile data from `profiles`, not directly from `users`.
- Auth tables are treated as internal auth state except where bootstrap/backfill requires them.

## Do / Do Not

- Do add new public profile fields to `profiles`.
- Do keep slug constraints and generation logic in `profiles` mutations.
- Do not use `authAccounts` for user-facing profile reads.
- Do not expose or mutate auth-internal provider linkage as profile data.
