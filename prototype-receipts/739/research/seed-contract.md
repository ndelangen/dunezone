# Deterministic Storybook seed contract

## Decision

Use a hybrid seed contract:

1. Stories name a fixed clock, actors, and a short list of domain recipes.
2. Domain recipes derive their stored document types from the Convex schema and parse semantic payloads with the authoritative shared Zod schemas.
3. The foundation resolves story-local aliases to real Convex IDs and inserts the baseline through the trigger-aware database writer.
4. Stories use real mutations for transitions whose behavior matters, including create, update, soft-delete, membership, publication, and Aggregate-backed changes.
5. Small concern-specific worlds may compose recipes. There is no application-wide baseline world.
6. An explicit unsafe lane may create structurally valid but semantically invalid rows for query-boundary and legacy-state stories.

This contract keeps the public authoring membrane small without pretending that the database schema contains domain intent. A generic schema-derived data generator should not be part of the Storybook API.

## Evidence

The repository has two validation authorities. Convex validators enforce transport and document structure, while shared Zod schemas enforce semantic rules. The server-side Zod parse is authoritative ([data-layer guidance](../../../docs/data-layer.md#validation-standard)). The confidence stack also says plain document types derive from `schema.tables.<table>.validator`, while semantic shapes derive from Zod ([ADR-0002](../../../docs/adr/0002-confidence-stack.md#decision)). A seed contract should preserve that division.

The current schema cannot generate meaningful domain records by itself:

- Convex adds `_id` and `_creationTime`; stories do not author them. The Convex documentation also warns that code must not depend on the mock ID format ([data types](https://docs.convex.dev/database/types), [convex-test limitations](https://docs.convex.dev/testing/convex-test#limitations)).
- `factions.data` and `assets.data` are `v.any()` ([schema](../../../convex/schema.ts)). Their real rules live in shared Zod schemas such as [`FactionInputSchema`](../../../src/shared/factions/schema.ts).
- Unique names and slugs, relation type compatibility, soft-delete behavior, group permissions, and Ruleset asset-slot cardinality are mutation rules, not schema constraints.
- A validator can say that a value is a string, ID, union member, or optional field. It cannot choose a useful name, connect related records, decide which union branch tells the story, or invent a valid faction.
- The installed Convex runtime exposes table validators for type derivation. Its schema export and validator JSON representation are marked internal. Building a generator on those internal representations would add version-sensitive machinery without solving semantic validity.

The official `convex-test` guidance creates data through mutations, supports authenticated accessors, and describes the runtime as a mock with simplified behavior ([convex-test](https://docs.convex.dev/testing/convex-test)). Component mounts must be registered on each test instance ([component testing](https://docs.convex.dev/components/using#testing-components)). Those are foundation concerns, not fields every story should repeat.

This research used repository source, tests, and the #736 proof. It did not claim or contact the hosted development database. The repository provides useful size and drift evidence:

| Existing example                     |                                               Measured setup | Observation                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | -----------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faction catalogue seam suite         |                                       73 lines for one world | Repeats complete Ruleset and Faction rows plus joins in [`factions.catalogue.test.ts`](../../../convex/factions.catalogue.test.ts).                                                                                                                                                         |
| Profile detail seam suite            |                                                    236 lines | Builds users, profiles, groups, membership states, Rulesets, factions, questions, and answers in [`profiles.detail.test.ts`](../../../convex/profiles.detail.test.ts).                                                                                                                      |
| Rulesets worker spike                |                                          37-line seed module | Reuses one function for two initial rows and a live-query row in the [#736 branch](https://github.com/ndelangen/dunezone/blob/norbert/736-convex-worker-spike/src/app/routes/_app/rulesets/-index.stories.fixture.tsx).                                                                     |
| Authenticated create spike           |                         21-line seed plus 4-line actor value | Creates two users, then runs the real profile and Ruleset mutations in the [#736 branch](https://github.com/ndelangen/dunezone/blob/norbert/736-convex-worker-spike/src/app/routes/_app/rulesets/-create.stories.fixture.ts).                                                               |
| Faction semantic fixture             |                        71 input lines; 80 lines for the file | One representative faction still needs real domain content. It is parsed and derives complexity once in [`assetPublishingFaction.ts`](../../../src/shared/factions/fixtures/assetPublishingFaction.ts).                                                                                     |
| Rulebook starter and editor variants | 50-line canonical value; 9 to 21 lines per scenario function | [`createRulebookStarterContents`](../../../src/shared/rulebooks/fixtures.ts) is cloned, then editor fixtures apply small changes in [`-rulebookEditorState.fixtures.ts`](../../../src/app/routes/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit/-rulebookEditorState.fixtures.ts). |
| E2E baseline mutation                |                                                     99 lines | The broad baseline already writes `about: ''`, which is below the current Ruleset semantic minimum, in [`convex/e2e.ts`](../../../convex/e2e.ts). A central world can compile while drifting semantically.                                                                                  |

The #736 proof also established the runtime constraints relevant to seeds: a 25-line authenticated seed worked in development and static Storybook; real mutations and Aggregate components worked; a new worker reset the database reliably; the worker bridge had no public database reset or snapshot API; and component registration was manual. The retained report records a 475-line runtime and bridge cost, so reducing story fixtures must not be used to hide foundation complexity ([#736 report](https://github.com/ndelangen/dunezone/blob/norbert/736-convex-worker-spike/prototype-receipts/736/research.md)).

## Approach comparison

| Approach                                       | Compact stories | Semantic validity                     | Real behavior                                     | Invalid states                            | Maintenance result                                                                     |
| ---------------------------------------------- | --------------- | ------------------------------------- | ------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Typed document builders                        | Yes             | Only with domain parsing              | No mutation rules unless the writer runs triggers | Good                                      | Useful internal primitive, insufficient alone.                                         |
| Real mutations                                 | Usually         | Yes                                   | Yes, including triggers and components            | Poor for unreachable or historical states | Use for transitions and any behavior under examination.                                |
| Schema-derived generation                      | Superficially   | No                                    | No                                                | Random rather than intentional            | Reject for Storybook authoring; reserve seeded generators for structural fuzz tests.   |
| One canonical application world with overrides | Initially       | Depends on upkeep                     | Depends on seed path                              | Awkward                                   | Reject because unrelated records affect order, counts, startup, and migrations.        |
| Small canonical concern worlds with overrides  | Yes             | Yes when composed from domain recipes | Can opt into mutations                            | Good with an explicit unsafe lane         | Use for repeated page families such as catalogue, profile detail, or Rulebook editing. |
| Recommended hybrid                             | Yes             | Yes                                   | Yes where behavior matters                        | Explicit                                  | Small stories with centralized, typed maintenance.                                     |

## Public authoring membrane

The foundation should expose one story definition and a small vocabulary of domain recipes. A representative shape is:

```ts
defineStoryWorld({
  at: "2026-07-21T12:00:00.000Z",
  actors: { owner: actor({ name: "Catalogue owner" }) },
  records: [
    ruleset("advanced", { owner: "owner" }),
    ruleset("empty", { owner: "owner" }),
    faction("arrival", {
      owner: "owner",
      name: "New arrival",
      createdAt: day(20),
    }),
    faction("updated", {
      owner: "owner",
      name: "Recently updated",
      updatedAt: day(21),
    }),
    rulesetFaction({ ruleset: "advanced", faction: "arrival" }),
    rulesetFaction({ ruleset: "advanced", faction: "updated" }),
  ],
});
```

The stable public concepts are:

- `defineStoryWorld({ at, actors, records?, arrange? })`
- `actor(...)` for an authenticated user and its normal active profile recipe
- domain recipes such as `ruleset`, `faction`, `group`, `membership`, `faqItem`, and `faqAnswer`
- `arrange(async ({ as, id }) => ...)` for real typed mutation calls after baseline insertion
- `unsafeRecord(reason, table, value)` for an intentional semantic violation

The generic table insert, trigger wrapper, component registry, worker RPC, reference resolver, clock installation, and reset implementation stay behind the doorway. Stories should not select raw versus trigger-aware writes or register components.

A domain recipe accepts an alias plus meaningful overrides. It owns defaults such as `is_deleted: false`, valid semantic content, derived slug policy, and timestamps from the world clock. It returns an operation, not a materialized fixture object. This lets the foundation resolve references and choose a safe write path after all actors are known.

`arrange` receives real runtime IDs and identity-bound clients:

```ts
arrange(async ({ as, id }) => {
  await as("owner").mutation(api.rulesets.addFaction, {
    ruleset_id: id("advanced"),
    faction_id: id("arrival"),
  });
});
```

This callback preserves the generated mutation argument types. A placeholder object such as `{ $seedRef: 'advanced' }` cannot satisfy `Id<'rulesets'>` without either weakening types or adding a deep mapped type over every function argument.

## Determinism rules

### IDs and references

Aliases are the stable identity that stories author and retain. The worker maps each alias to the real ID returned by insertion. Runtime Convex IDs are opaque and must not appear in snapshots or expected URLs. When a loader needs an ID argument, its story obtains the ID from the initialized world. Slug-based routes continue to use the authored slug.

Actors use the same alias mechanism. The foundation inserts the `users` row first and binds `withIdentity` with that real user ID as the subject, matching the current Convex Auth lookup. The parent query cache key must include the actor alias and worker epoch. An omitted actor means signed out; `withIdentity({})` is still signed in.

### Time and ordering

`at` is required. The worker installs that clock before creating `convexTest`, then all recipe timestamps and production calls to `Date.now()` share it. Recipes may use named offsets such as `day(20)` or `after('arrival', minutes(1))`. The records array runs sequentially.

Every ordering story should set the domain field used by the query. Where production intentionally orders by `_creationTime`, as asset catalogue queries do, the seed runner advances the worker clock between sequential inserts. A tie must be explicit. Object property order and concurrent insertion must never decide visible order.

### Components and derived state

The foundation registers all mounts from the current app configuration once per worker: Migrations plus `statistics`, `profileDiscovery`, and `profileActivity`. Registration is not part of a story.

Baseline recipes write through `applicationTriggers.wrapDB`, not a raw `ctx.db`, so Aggregate state tracks inserted records. Real mutations remain mandatory when the story depends on mutation behavior beyond triggers, including normalization, uniqueness checks, authorization, relation rules, scheduling, and publication. [`homepage.test.ts`](../../../convex/homepage.test.ts) demonstrates this split: direct setup uses the trigger-aware writer, then real mutations keep Aggregate totals current.

The runner settles only work scheduled by the selected recipes or arrangement. It should not drain every scheduler by default, because that hides background behavior and adds startup cost.

### Reset

Reset means terminate the story's worker, clear parent caches and pending RPC, create a new worker, and replay the world. Do not clear tables in place or depend on private `convex-test` state. Each Docs-mode story gets its own worker epoch.

### Invalid states

Normal recipes always produce structurally and semantically valid current data. `unsafeRecord` requires a reason and remains schema-validated. It covers cases such as malformed faction data stored under the current `v.any()` field, dangling relations, and legacy semantic values.

Structurally invalid documents require a widened or historical schema and do not belong in the normal page-story contract. A migration-specific reproduction may own a local historical schema and seed beside that migration. Loading, offline, permission, and transport-error stories should use explicit bridge controls instead of corrupting the database.

### Migrations

Schema-derived recipe input types should fail compilation when a document shape changes. Domain recipes must parse their output through shared Zod, so a semantic rule change fails during world initialization. Concern worlds are functions composed from those recipes, not checked-in database snapshots.

Permanent page stories target the current post-migration shape. A migration status page may seed the current `migration_runs` document through a domain recipe. Historical pre-migration data belongs to the migration's own reproduction and is not promoted into a global world. The seed runner must not apply every migration implicitly; doing so would increase cost and hide missing current-state recipes.

## Representative authoring size

The proposed counts below are nonblank executable lines inside the story world definition. They are design estimates from the shown membrane, not measurements of an implementation. Imports and the shared recipe implementation are excluded. Existing counts include setup code because that is the code stories would otherwise repeat.

A populated profile detail page is 20 authored lines after formatting when its repeated document boilerplate lives in recipes:

```ts
defineStoryWorld({
  at: "2026-07-21T12:00:00.000Z",
  actors: {
    central: actor(),
    asker: actor(),
    orphan: actor({ profile: false }),
  },
  records: [
    group("tabr", { owner: "central", members: [active("central", day(2))] }),
    group("guild", { owner: "central", members: [active("central", day(3))] }),
    ruleset("advanced", { owner: "central" }),
    ruleset("basic", { owner: "central" }),
    faction("atreides", { owner: "central" }),
    rulesetFaction({ ruleset: "advanced", faction: "atreides" }),
    rulesetFaction({ ruleset: "basic", faction: "atreides" }),
    faqItem("spice", { ruleset: "advanced", askedBy: "asker" }),
    faqItem("worm", { ruleset: "advanced", askedBy: "orphan" }),
    faqAnswer("spice-answer", { item: "spice", answeredBy: "central" }),
  ],
});
```

The ready state for the create page is four lines. The page interaction itself runs the production create mutation:

```ts
defineStoryWorld({
  at: "2026-07-21T12:00:00.000Z",
  actors: { creator: actor({ name: "Ruleset creator" }) },
});
```

The Rulebook editor is not database-backed on the current branch. Its useful compact pattern is the existing canonical starter plus a three-line amendment, not a fictional database recipe:

```ts
const baseline = createRulebookSavedRevision("revision-2", (contents) => {
  contents.pagesById["page-reference"]!.anchor = "quick-reference";
});
```

| Page variation                 |                                            Existing evidence | Proposed authored lines | Composition                                                                                         |
| ------------------------------ | -----------------------------------------------------------: | ----------------------: | --------------------------------------------------------------------------------------------------- |
| Faction catalogue main state   |          73 setup lines, plus reused 71-line faction payload |                      20 | One actor, two Rulesets, two factions, two joins.                                                   |
| Profile detail populated state |                                              236 setup lines |                      20 | Three actors, two active groups, memberships, two Rulesets, one faction, two questions, one answer. |
| Ruleset create ready state     |                                        25 seed lines in #736 |                       4 | One actor with its active profile; the page runs `api.rulesets.create`.                             |
| Rulebook editor variation      | 50-line shared starter plus a 9 to 21-line scenario function |                       3 | Reuse the existing starter, then apply one amendment outside the database worker.                   |

The useful budget is at the call site: a new main page world should normally stay at or under 20 formatted lines, and another variation should normally add fewer than 10. This is not a total-code claim. The foundation task should report its central recipe and runtime cost separately, just as #736 reported the worker infrastructure cost.

## Bounded foundation work

The foundation task can implement this decision without implementing page stories:

1. Add `defineStoryWorld`, actor aliases, a fixed worker clock, sequential operation execution, and runtime ID lookup.
2. Add the complete root component registry and trigger-aware baseline writer.
3. Add the `arrange` mutation callback with generated function argument types.
4. Add a small first recipe set: actor/profile, group/membership, Ruleset, faction, and Ruleset-faction relation.
5. Add the reason-bearing `unsafeRecord` escape hatch.
6. Prove replay reset, actor isolation, deterministic ordering by domain time and `_creationTime`, semantic parse failure, Aggregate consistency, and development/static parity.

Do not add a schema-driven random generator, a global application fixture, data import, hosted database access, migration orchestration, or page stories in that task.

## Risks

- The hybrid has more shared code than raw inserts. It earns that cost only if page stories remain visibly smaller.
- Domain defaults can become a second source of truth. Deriving document types and parsing Zod output makes drift fail early, but mutation-only behavior still requires real mutation coverage.
- A concern world can grow into a global fixture by accumulation. Keep each one named for a page family and composed from smaller recipes.
- Trigger-aware direct insertion can create a state that no public mutation can reach. Use real mutations whenever reachability or side effects are material to the story.
- Fixed time requires a browser-worker clock adapter that also controls `convex-test` system creation times. A clock that changes only authored ISO fields is incomplete.
- Component registration remains coupled to package test helpers or source maps, as #736 found.
- The worker runtime itself remains experimental. This seed contract reduces fixture cost but does not resolve the #736 async-context, source-disclosure, transport, or upstream-drift risks.

## Accepted answer

The smallest stable Storybook seed contract is a fixed-time world of actors and domain recipes, with story-local aliases resolved to real IDs, trigger-aware baseline writes, and an optional real-mutation arrangement phase. Small concern worlds may compose those recipes. Schema-derived generation is limited to types and structural validation; semantic content remains in explicit domain builders. Invalid and historical states use named escape hatches rather than weakening every seed.
