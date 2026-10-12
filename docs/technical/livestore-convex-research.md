# LiveStore in the Convex and Cloudflare decision

Investigated on 12 October 2026. This extends the [usage audit](convex-usage-research.md),
[editor research](rulebook-editor-performance-research.md),
[year-ahead scenarios](convex-year-ahead-research.md) and
[Convex self-hosting study](convex-cloudflare-self-hosting.md). It changes no
application, billing or infrastructure. No LiveStore prototype was run.

LiveStore deserves a bounded Rulebook editor experiment if persistent offline
drafts, local queries or richer collaboration are product goals. It is a poor
immediate response to the current usage warning. Keep Convex Cloud and make the
known read paths cheaper first. A full replacement would move substantial backend
responsibility into code we operate, even though the storage can live on Cloudflare.

The August investigation mapped dependencies but ended without a prototype,
finished report or migration recommendation. This report checks the current
sources rather than treating that partial work as a settled decision.

## What LiveStore supplies

LiveStore gives a client a reactive SQLite database. The application commits typed
events; deterministic materializers turn those events into queryable tables. A
sync backend orders and distributes events. Clients apply local changes immediately
and rebase pending events when upstream history advances. The event log, rather
than an existing Convex database, becomes the source of truth.
[Architecture](https://docs.livestore.dev/building-with-livestore/syncing/),
[materializers](https://docs.livestore.dev/building-with-livestore/state/materializers/).

This can replace much of an editor's local state, query and persistence machinery.
It does not supply an authentication service, application authorization policy,
hosted backend or direct synchronization of an existing database. Its own fit
guidance discourages traditional server-authoritative applications and highly
connected data across users. These are relevant to our catalogue, Groups, account
lifecycle and Play permissions.
[Fit guidance](https://docs.livestore.dev/overview/when-livestore/),
[FAQ](https://docs.livestore.dev/misc/faq/).

## What can run on Cloudflare now

The current stable release is [v0.4.0](https://github.com/livestorejs/livestore/releases/tag/v0.4.0),
released on 2 June 2026, at commit
`c80acb39066b9472da426a35c81969df4919ae2d`. The newer
[v0.5.0-dev.0](https://github.com/livestorejs/livestore/releases/tag/v0.5.0-dev.0)
is a prerelease from 24 August. Stable source and current main are distinguished
below. All packages in an experiment should use one tested version.

Version 0.4 has two different Cloudflare pieces:

| Piece | What it does |
| --- | --- |
| `@livestore/sync-cf` | A Worker routes by `storeId`; a Durable Object orders events and handles sync. Events persist in DO SQLite by default, with D1 as an option. WebSocket, HTTP and DO RPC transports exist. |
| `@livestore/adapter-cloudflare` | Runs a full LiveStore client and its derived state inside a Durable Object. A server-side application can query or commit through that client. |

Sources: [sync provider](https://docs.livestore.dev/sync-providers/cloudflare/),
[stable Cloudflare adapter](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/adapter-cloudflare/src/create-store-do.ts).

An all-Cloudflare LiveStore design therefore has a documented implementation path.
It does not need the native Convex binary, a Container or external Postgres. The
default DO SQLite arrangement is the sensible starting point; use D1 only if its
inspection or integration benefits justify another storage path. D1 contains event
records, not an automatically maintained application-wide relational read model.
[Stable event storage](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/sync-storage.ts).

The sync backend uses WebSocket hibernation and automatic ping responses. That is
useful for idle collaborators. It is not a measured cost result for our app, and a
server-side LiveStore client adds its own storage, replay and wakeup work.
[Stable WebSocket handling](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/durable-object.ts).

## The editor is the best candidate

Our current editor loads the whole saved draft and reads the whole current Edition
to calculate whether anything is unpublished. Saves send the whole draft with an
expected revision. Ordinary typing already stays local, and Save is explicit.
LiveStore would not remove a database request for every keystroke because that
request does not exist today.
[Current behavior](rulebook-editor-performance-research.md),
[editor and Save handlers](../../convex/rulebooks.ts).

A LiveStore model could use Page and Block tables, with events such as Page
created, Block text changed, Page reordered and settings changed. The active
Page could query only its own rows. Small events can avoid repeatedly transferring
the whole draft after reconnecting, and local persistence can retain unsaved work
across a reload. These are proposed benefits, not benchmark results.

A Page query does not mean Page-only synchronization. The default sync path pulls
the selected store's event history. One store per Rulebook would still bring that
Rulebook's history and derived state onto the device. One store per Page makes
partial loading easier, but introduces cross-store ordering, references and
publication consistency. LiveStore documents no transactional consistency between
stores.
[Data modeling](https://docs.livestore.dev/building-with-livestore/data-modeling/),
[stable pull implementation](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/pull.ts).

The current editor's all-Page clipping measurement, whole-book copying and reference
resolution still need attention with either backend. Local SQL does not repair
those render paths. Normalized query arguments, cheaper unpublished-change
comparison and narrower references can be evaluated within Convex first.
[Ranked opportunities](rulebook-editor-performance-research.md).

There are two distinct editor experiments:

| Scope | Benefits to test | Responsibility retained or added |
| --- | --- | --- |
| Local-only LiveStore draft, Convex remains authoritative | Persistent local work, Page-local queries, undo/history and reload recovery | Existing explicit Save, expected revision, access checks and publication remain. Convex reads and full saves do not disappear automatically. Import and conflict/recovery logic are needed. |
| Shared LiveStore Rulebook store on Cloudflare | Offline work and event-level collaboration with small sync updates | We own event validation, permissions, rejection recovery, durable server confirmation and transfer of an exact saved version into publication. This adds a second data service while Convex remains. |

LiveStore supports client-only events and an in-memory adapter, so the first scope
does not require a sync deployment. It would evaluate the editor experience before
moving authoritative data.
[Client-only events](https://docs.livestore.dev/api/livestore/variables/clientonly/),
[web adapter](https://docs.livestore.dev/platform-adapters/web-adapter/).

## Permissions decide the store boundaries

LiveStore has auth hooks, but the application implements authentication and
authorization. `validatePayload` gates a connection. `onPush` and `onPull` can
reject requests, and their client-supplied payloads require verification. A
LiveStore `clientId` identifies a client, not an authenticated user.
[Auth guidance](https://docs.livestore.dev/patterns/auth/).

The normal Cloudflare pull returns the store's ordered events after a cursor. Its
auth callback returns permission or an error, rather than a filtered row set.
Members with access to that history can inspect the event payloads, even if our
UI hides some derived rows. Private drafts, public Editions, account secrets and
private Play state cannot share one broadly readable store.
[Stable pull callback and event retrieval](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/pull.ts).

We already distinguish anonymous readers, owners, active Group members, pending
members and deleted accounts. A shared editor needs current membership checks,
verified actors, a permitted event list, argument validation and limits on each
event. It must reject attempts to publish, change ownership or modify another
Rulebook through a forged event. Validating only the browser materializer would
trust client code; server checks remain necessary.
[Existing access policy](../../convex/lib/collaborativeAccess.ts),
[stable push validation hook](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/push.ts).

Revocation requires more than checking the next reconnect. An established live
pull can keep receiving broadcasts; the stable push broadcaster does not rerun
each listener's `onPull` callback for every event. We need an explicit policy for
closing revoked connections and stopping future writes. A disconnected device
can retain data already downloaded, so account switching, local cleanup and
unconfirmed edits need their own behavior. No prototype has verified these paths.
[Stable broadcasts](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/push.ts).

Retaining Convex Auth is plausible for a hybrid, but a verified token alone does
not establish current Group membership or revocation state. Calling Convex on
every event for those checks could preserve some of the I/O we wanted to remove.
Short-lived capabilities, replicated access state and direct checks have different
revocation tradeoffs. This remains a design decision.

## Offline, concurrency and publication

The web adapter persists through OPFS and uses browser workers. Private browsing
can fall back to in-memory storage, losing unsynced work on closure or reload.
Offline data support also does not cache the application, fonts, images or external
references automatically. Those assets need a deliberate offline policy.
[Web storage behavior](https://docs.livestore.dev/platform-adapters/web-adapter/),
[offline guidance](https://docs.livestore.dev/patterns/offline/).

Rebasing gives clients a common event order. It does not define the correct result
when two authors replace the same text, reorder the same Page or delete a Block
another author edits. The upstream [merge conflict issue](https://github.com/livestorejs/livestore/issues/253)
remains open. The rich-text guide recommends a separate CRDT library and transport,
with LiveStore holding document references. Adopting that arrangement would add
another protocol and a consistent-snapshot problem for publication.
[Rich-text guidance](https://docs.livestore.dev/patterns/rich-text-editing/).

Materializers execute local transactions, but LiveStore's FAQ says online global
transactional behavior needs application logic. Our Publish mutation currently
checks the saved draft revision, allocates the next immutable Edition, stores its
contents, queues derived artifacts and advances the current Edition together.
A replacement must preserve that behavior through a trusted server operation.
An offline publish request cannot claim the same result before confirmation.
[Transaction distinction](https://docs.livestore.dev/misc/faq/),
[current Publish contract](../../convex/rulebooks.ts).

For a hybrid, I would retain Convex's saved draft and immutable Editions initially.
A Save bridge would submit a validated snapshot against an expected Convex
revision and an identified LiveStore event head. Only acknowledged saves become
publishable. Retries need an idempotent acknowledgement; a browser retry must not
create duplicate versions. This proposal avoids two independent authoritative
drafts, but the bridge still needs testing.

## Public reads and application-wide queries

Published HTML and media are already appropriate for Cloudflare delivery. Giving
every reader SQLite, a sync connection and a Rulebook history would add startup
work to a read-only visit. Keep public readers on published artifacts and narrow
metadata. LiveStore is not required for that saving.
[Reader direction](convex-usage-research.md#reusing-published-html).

A browser-only store also does not provide our anonymous request-time SSR data.
The stable TanStack Start LinearLite example explicitly disables SSR for its store
route. A Cloudflare server-side client can provide a read model, so SSR is possible
to investigate, but preserving initial HTML, canonical metadata, deletion gates
and hydration requires a bridge. It is not a drop-in `useQuery` replacement.
[Stable example](https://github.com/livestorejs/livestore/blob/v0.4.0/examples/web-linearlite/src/routes/%24storeId.tsx),
[server-side DO client](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/adapter-cloudflare/src/create-store-do.ts),
[our loader/subscription contract](../state-management.md).

Catalogues, profile activity, unique slugs and Group relationships span entities.
With per-Rulebook stores, a global catalogue needs a separate trusted projection
and reconciliation strategy. D1-backed event persistence alone does not create
that projection or transactions across stores. Server commands, scheduled work,
rate limiting, account merge/deletion and publication recovery also need homes.
[Current schema](../../convex/schema.ts), [components](../../convex/convex.config.ts),
[cron](../../convex/crons.ts), [publication](../../convex/rulebooks.ts).

A fresh baseline scan finds 234 exported query, mutation, action and HTTP-action
declarations outside tests/generated code, and 38 explicit `defineTable` entries,
with additional Convex Auth tables and component state. These are rough dependency
counts at `3bc00a482a7e7014cc0c2719ee8e8f5c575757fc`, not an effort estimate.
The earlier investigation's smaller counts are stale.

## Migration and development environments

LiveStore is Apache-2.0 licensed. Its beta status matters more to this decision than
licensing cost. The project warns that minor releases may change APIs, client
storage formats and sync-backend formats. Event definitions must remain compatible
with historical events; changing derived state can require replaying history.
[License](https://github.com/livestorejs/livestore/blob/v0.4.0/LICENSE),
[project status](https://docs.livestore.dev/misc/state-of-the-project/),
[event evolution](https://docs.livestore.dev/building-with-livestore/events/).

An existing database migration would validate exported data and generate initial
events or a separately proven initialization procedure. It cannot point the sync
provider at Convex and reuse its tables. Preserve IDs, references, ownership,
deletion and published-only anonymization. Resetting a sync backend can reset
client data through backend identity mismatch handling, including pending work;
production recovery needs a chosen policy rather than development defaults.
[Existing database limitation](https://docs.livestore.dev/misc/faq/),
[reset detection](https://docs.livestore.dev/building-with-livestore/syncing/).

Wrangler-local sync and an in-memory adapter align with the user's preference for
local E2E and browser-memory Storybook. They still require isolated local state,
fresh per-test stores and actual server/auth tests. A local materializer does not
exercise a malicious network event, revocation, durable acknowledgement or
Cloudflare eviction. Today's Convex test runtime already covers server handlers;
new tests would replace a proven seam, not remove a missing one.
[LiveStore Storybook pattern](https://docs.livestore.dev/patterns/storybook/),
[our confidence stack](../adr/0002-confidence-stack.md).

Separate development and production namespaces remain necessary. Browser stores
must also distinguish environment and account. A manually refreshed, anonymized
production snapshot can seed development, but its importer and client-reset policy
change. LiveStore does not make safe prod-to-dev copying unnecessary. Keeping
everything on Cloudflare reduces vendors while retaining multiple environments,
sync/read-model services and backup responsibilities.

Cloudflare provides per-object SQLite point-in-time recovery for the previous
30 days. That does not establish a consistent application-wide restore across
stores, derived read models, auth and R2 artifacts. Export, restore, client
reconnection and an offline device returning after restore need a rehearsal.
[Cloudflare storage recovery](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).

## What a year of growth changes

The [Convex scenarios](convex-year-ahead-research.md) estimate calls and database I/O
at about $16 to $19 per month at 10x today's demand. That still does not justify a
full rewrite for billing alone. Ownership and offline authoring can justify an
experiment independently. No LiveStore workload or Cloudflare account headroom has
been measured, so there is no defensible LiveStore monthly quote yet.

Moving local editor queries can make server reads follow newly synced events rather
than repeated whole-book query executions. It may improve scaling when drafts grow,
editors reopen them frequently or many collaborators invalidate subscriptions.
The present editor and Save attribution totals 16.5% of team I/O. Removing all of
it would be an upper bound; a hybrid still has initial import, auth and publication
reads. Full replacement might also change call costs, but the current attribution
does not prove those savings.

LiveStore shifts some growth into retained history and fresh-client replay.
Event-log compaction is still an open [upstream issue](https://github.com/livestorejs/livestore/issues/136).
At an illustrative 100 one-kilobyte events per book per day, one year adds 36.5 MB
of raw event payload. At 1,000, it adds 365 MB. These are decimal units and chosen
scenarios, excluding metadata, indexes, materialized state and any CRDT history.
They are not our measured editing rate. Each fresh replica may have to fetch and
replay that book's history. Whole-book replacement events would be much larger.

Fine-grained events and batches therefore matter, but emitting every keystroke
would turn today's explicit-Save workflow into a different workload. A prototype
must measure cold startup, offline backlog, rejection recovery, schema replay and
retained history after a simulated year. Scaling across independent books is
plausible; more authors on one book raise rebase and conflict pressure.

Cloudflare Paid currently includes 25 billion SQLite row reads, 50 million row
writes and 5 GB-month of stored data. Beyond these, row reads cost $0.001 per million,
writes $1 per million and storage $0.20 per GB-month. DO requests and duration have
separate allowances and prices. Allowances are shared with our other services.
A LiveStore event is not exactly one billed row write: metadata, indexes, stored
state pages and schema replay can add work. Idle hibernation helps, but a benchmark
must capture active duration and server-client replicas too.
[Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Version-specific unknowns and a useful experiment

The stable 0.4 HTTP push implementation supplies no shared `syncPayload` to
`onPush`; use verified forwarded headers or test another transport rather than
assuming payload auth works there. Current main fixes this. Main also changes
Cloudflare adapter stub retries and eviction/replay recovery. Those improvements
are not a reason to treat an unreleased revision as a tested production dependency.
[Stable HTTP push](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/%40livestore/sync-cf/src/cf-worker/do/transport/http-rpc-server.ts),
[checked main at 3cb74e6](https://github.com/livestorejs/livestore/blob/3cb74e62017c463f49323d296ba73450efc60007/packages/%40livestore/sync-cf/src/cf-worker/do/transport/http-rpc-server.ts),
[main Cloudflare adapter](https://github.com/livestorejs/livestore/blob/3cb74e62017c463f49323d296ba73450efc60007/packages/%40livestore/adapter-cloudflare/src/create-store-do.ts).

Some guides are incomplete or disagree with newer code. The server-side-client
page still describes a future Cloudflare adapter although 0.4 ships one, and the
production checklist and side-effect guide remain unfinished. Verify the exact
release source and recovery behavior rather than relying on page titles alone.
[Server-side guide](https://docs.livestore.dev/patterns/server-side-clients/),
[production checklist](https://docs.livestore.dev/building-with-livestore/production-checklist/),
[side effects](https://docs.livestore.dev/patterns/side-effects/).

If offline editor work is worth pursuing, use a synthetic Rulebook and a bounded
experiment before an application migration:

1. Start with one local-only book. Load the active Page through SQL, retain edits
   across reloads, preserve explicit Save and the expected-revision conflict flow.
   Compare latency, heap use, startup and bundle delivery with the current editor.
2. Add one Cloudflare sync store only if shared/offline behavior is wanted. Test
   two authors editing different Pages and the same text, concurrent reordering,
   offline deletes, rejected events and reconnect after permission removal.
3. Bridge one confirmed revision into Convex Save and Publish. Prove that retries
   do not duplicate saves or Editions, publications use exactly the confirmed data,
   and local unconfirmed work never becomes a public Edition accidentally.
4. Generate a year's chosen event history. Measure cold import/replay, state-schema
   upgrade, interrupted upgrade, DO replacement and a restore with an offline
   client returning. Record row writes, duration, event bytes and storage.
5. Verify local E2E and Storybook isolation, dev/prod separation, account switching,
   private browsing and signed-out/denied behavior. Keep public reading on HTML.

Advance only if this gives a useful editor capability or a measured saving that
outweighs the new auth, synchronization and operating work. If permissions and
publication make a single-book hybrid costly to maintain, a full replacement will
be harder. The immediate recommendation remains Convex Cloud with scoped read
optimizations; LiveStore stays a credible editor option with an explicit evaluation
path, rather than a promised cure for the current bill.
