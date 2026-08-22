# ADR-0003: Deleted Groups are not found; stale references project to null at the read layer

**Status:** Accepted (2026-08-09)

## Context

Group deletion used to hard-delete the row and run a bounded cleanup
cascade that nulled ruleset associations, deleted memberships, and never
touched factions. That cascade destroyed membership data and left
dangling faction references in production. The soft-deletion lifecycle
([#188](https://github.com/ndelangen/dunezone/issues/188)) replaces this, and
the contract below was settled in
[#189](https://github.com/ndelangen/dunezone/issues/189).

## Decision

- **Deleted ⇒ not found, everywhere, no carve-outs.** A deleted Group is
  indistinguishable from one that never existed: queries throw or
  exclude it, and every mutation targeting it behaves as not found,
  whether that is a rename, a delete-again, any membership action, or
  assigning an asset to it. There is no tombstone page for any role and
  no product-level restore; recovery is a manual administrative act
  (flip `is_deleted` in the dashboard).
- **Deletion preserves, never cascades.** The Group row, its memberships, and
  the `group_id` on associated assets all survive untouched. `group_id` is the
  sole authority on association: restoration never reclaims a reassigned
  asset, and an untouched asset snaps back when its Group is restored.
- **Name and slug stay reserved while deleted**, matching the faction
  convention. This keeps the slug→row mapping unique (the faction duplicate
  slug repair migration is the scar from breaking that) and makes restoration
  collision-free, at the cost of a create-time error that can reveal a name is
  held by a Group the requester cannot see.
- **Stale references are projected, not repaired.** Historical hard deletions
  left dangling `group_id` pointers (factions were never cleaned; ruleset and
  membership cleanup was capped at 100 rows). The migration audits and logs
  these but does not rewrite them. Instead, the Convex read layer owns one
  projection rule: any group reference that does not resolve to a live
  Group, whether soft-deleted or missing entirely, leaves Convex as
  `null`, so the UI always receives an asset that presents as ungrouped
  and never sees a dangling id.

## Considered options

- Owner-facing restore and/or tombstone pages, rejected for now; without
  a restore action a tombstone has nothing to do, and one-way deletion
  keeps the authorization rule to a single clause.
- Releasing the name and slug of deleted Groups is the purest "never
  existed", but it breaks slug uniqueness, invites restore collisions,
  and contradicts the established faction convention.
- Migration repair (nulling dangling pointers, deleting orphan
  memberships), rejected in favor of read-layer projection so the
  database keeps its history and one rule covers both soft-deleted and
  historically vanished Groups.
