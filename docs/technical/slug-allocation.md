# Collision suffix allocation

[Share collision suffix allocation across Play and other domains](https://github.com/ndelangen/dunezone/issues/1943)
consolidates seven live allocation paths. Existing addresses keep their spelling and ownership.
New collisions use lowercase base 36 in every participating domain.

The shared selector tries the plain base, four counter candidates and two independent 64-bit random
candidates encoded in base 36 and padded to 13 characters. Each full candidate passes the owning
domain's policy before its exact indexed availability check. Rejection and occupancy consume the
same budget. Selection makes at most seven availability checks. Asset holders can contain large
content records, so keeping the four-counter budget avoids reading dozens of those records.

A successful suffixed selection advances its cursor past the counter candidates consumed in that
attempt. A random success provides recovery when independently entered names have occupied the
whole counter window. Exhausted or unsafe ordinals skip counter selection and use random candidates;
the next cursor is capped at `Number.MAX_SAFE_INTEGER`. Complete failure returns no selection, and
the caller throws. A new mutation attempt draws fresh random candidates. Convex may replay random
values during its own transaction retry. Nothing interprets arbitrary name endings as counters.

`convex/lib/slugAllocation.ts` owns this selection policy without knowing tables or record kinds.
The callbacks carry exact indexed checks and an optional deterministic, server-owned final-candidate
predicate. The predicate runs inside the mutation and cannot contact a moderation provider.
Positive name/base moderation must still refuse creation in its caller. This extension does not
implement or bypass the separate public custom-name moderation ticket.

Two storage adapters use the selector. Play retains its existing next-ordinal cursors and permanent
reservations. Other domains use the existing `counters` table, whose value is the last consumed
ordinal. The Asset counter key and value meaning remain compatible with earlier decimal allocation.
New domain keys include the base and any namespace. No schema change or backfill is required.

| Domain | Namespace and indexed check | Address retention and reserved paths |
| --- | --- | --- |
| Play | Global, reservation and game `by_slug` | Permanent reservation survives hard deletion; `create`, `demo`, `hosted` and accepted game-ID tokens are reserved |
| Assets | Per type, `by_type_and_slug` | Deleted rows retain addresses; `create` is reserved |
| Groups | Global, `by_slug` | Deleted rows retain addresses; `create` is reserved; exact duplicate names remain refused |
| Rulesets | Global, `by_slug` | Deleted rows retain addresses; `create` is reserved; exact live duplicate names remain refused |
| Rulebooks | Per Ruleset, `by_ruleset_and_slug` | Deleted rows retain addresses; `create` is reserved; exact live name keys remain refused |
| Profiles | Global, `by_slug`, bootstrap and edit callers | Existing profiles retain their addresses on sign-in; there is no reserved creation route |

Normalization and authorization stay in each domain. Play keeps its dedicated apostrophe,
Gom Jabbar and Unicode rules. Profile bootstrap keeps NFKD folding and the `player` fallback while
preserving the provider's display name. Profile editing still requires its existing ASCII name
validation. Other domains keep their existing `slugify` rules.

An ordinary save or spelling change that produces the same base preserves the row's current address,
including a legacy decimal or hexadecimal suffix far beyond the current counter window. Assets do
this before checking whether the unsuffixed address has become free. A genuine rename in these
non-Play domains still allocates an address for the new base. No redirect or historical reservation
policy is added to those domains. Every allocation, cursor write, record write and schedule shares
one transaction. Play quota consumption also rolls back on failed creation.

FAQ addresses are decimal ordinal identifiers within a Ruleset, rather than name-collision suffixes,
so their allocator stays separate. Factions refuse duplicate names. Historical migration allocators
stay unchanged: the Group and Ruleset backfills only fill missing fields that the current schema
already requires, and the faction reservation repair records existing identities.

Focused seam suites cover each participating domain, old addresses, deleted holders, reserved routes,
namespace scope and genuine renames. Selector tests cover rejected suffix words, failed windows with
fresh-random recovery, bounded checks and safe-integer exhaustion. The Play creation suite checks
rollback of quota, rows, schedules, reservations and cursors. The disposable backend proof exercises
both cursor adapters through independent concurrent HTTP mutations.

The isolated 7 October 2026 proof passed two batches of eight same-name Play creations, four batches
of four same-name Asset creations, eight dense-window Play creations, policy rejection recovery,
legacy game-ID protection and six old-shape public creations. An earlier batch of eight concurrent
same-name Asset creates exhausted Convex's OCC retries on `counters`. The Asset call graph identifies
its per-name allocation counter as the shared write; publication does not use that table. The failed
run is retained alongside the passing proof. This is a bounded correctness check, not a capacity claim.
