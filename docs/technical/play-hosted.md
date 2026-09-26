# Hosted table

This is the fixture multiplayer implementation for
[Deliver hosted multiplayer for signed-in users](https://github.com/ndelangen/dunezone/issues/1096).
The [connection decision](https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5590031475)
is the specification. The live issue records review, deployment and verification status.

## Scope and ownership

`/play/hosted` is unlinked and requires an active signed-in account. The first two distinct admitted
users occupy the fixture's Harkonnen and Atreides seats. Later users are spectators. A user's other tabs
share their seat but have independent connections and carries. These are fixture seats, not the
future seat-request, draft or faction assignment workflow. Seated players draw and are dealt private
hands here; faction messages are not available. `/play/demo` stays public and local-only; `/play`
remains reserved for the lobby.

Convex stores the fixture directory record, provisioning status, server-only game secrets, ticket hashes, session
registrations and account-deletion delivery records. It does not store table actions or seats.
The game Worker owns one SQLite Durable Object per game. Its transactions save the table with
command receipts and phase-boundary history. Seat changes have their own durable history.
Carries and pointers are
temporary and disappear on disconnect or cold restore.

`workers/game/session.ts` owns the Room, durable metadata, domain stores and history boundary.
Its operations coordinate commands, assignment, deadlines, account deletion, conversations and
retained content. `workers/game/index.ts` owns authorization, sockets, external requests and alarm
installation. It asks the session for projections instead of reading or changing its stores.

A command and any setup cleanup it enables commit before the Room accepts the result. If saving
fails, the snapshot, history boundary and unfinished carry stay unchanged so the same command can
be retried. Activity ending also runs pending cleanup through the session. Connection identities
and released carries settle before delivery; broadcasting only reads the completed state. Replay
reconstructs stored checkpoints and patches with continuity checks, then applies viewer privacy.
It never executes past commands again.

Each socket can start at most 1,024 carries before it must reconnect. Replay history stays
bounded per connection and is released on disconnect. Ended carry IDs are never evicted while
that connection remains live, so delayed messages cannot revive an old carry.

The shared rules and geometry live in `src/shared/play`. Route-level re-exports preserve the local
demo's imports. `commands.ts`, `workers/game/room.ts` and `history.ts` extend the accepted source
implementation preserved in the
[source history bundle](https://github.com/ndelangen/dunezone/releases/download/proof-assets/duneplay-source-e593e95.bundle)
on the `proof-assets` release; the
[#1093 resolution](https://github.com/ndelangen/dunezone/issues/1093#issuecomment-5584553890) links
its hash and restore steps.
The browser connection and Worker admission layer replace its query-string fixture identity.

## Game mechanics

Each mechanic's contract is its resolution ticket; [CONTEXT.md](../../CONTEXT.md) defines the terms in bold.

- Seats, factions and stations: **Seat** and **Station**, [#1211](https://github.com/ndelangen/dunezone/issues/1211).
- Retained catalogue definitions: [#1212](https://github.com/ndelangen/dunezone/issues/1212).
- Readiness and shared inventory: [#1139](https://github.com/ndelangen/dunezone/issues/1139).
- Real games: **Real game** and **Stage**, [#1213](https://github.com/ndelangen/dunezone/issues/1213).
- Participation: **Seat request** and **Departure**, [#1215](https://github.com/ndelangen/dunezone/issues/1215).
- Drafting and public assignment: **Draft list**, **Ban list** and **Public assignment**, [#1216](https://github.com/ndelangen/dunezone/issues/1216).
- Directory summary: **Directory**, [#1214](https://github.com/ndelangen/dunezone/issues/1214).
- Private banks and public spice: [#1140](https://github.com/ndelangen/dunezone/issues/1140).
- Player-run battles: [#1141](https://github.com/ndelangen/dunezone/issues/1141).

## The fixture's treachery deck

The hosted fixture deals a real treachery deck when the catalogue can supply one: at provisioning
the Worker captures `deck/dreamrules-treachery-deck` through the same capture the shared inventory
spawns from, shuffles the cards with fresh identities as every supplied deck is shuffled, and deals
them into the fixture's own treachery pieces, all but one face down on the deck's published
cardback and the last face up as the loose card. Piece ids, labels, colours and positions stay the
fixture's, so every flow and story that addresses them reads unchanged; only the cards carry the
catalogue's faces, as live references. A catalogue that cannot answer (the native peer, a backend
without the deck) leaves the placeholder cards in place; the room asks again at every wake, one
read while the deck is absent. The captured pieces are retained with the room's metadata: a reset
deals them again, reshuffled, and a room provisioned before the deck existed adopts it on wake,
asynchronously, so a reset after the adoption brings the real cards to a running fixture without
re-provisioning. The local demo at `/play/demo` keeps its placeholder; it has no backend.

## Connection lifetime

1. The signed-in browser requests a single-use opaque ticket from Convex. Convex resolves the
   current user and Auth session itself; the browser cannot select another identity.
2. The browser opens the same-origin game socket and sends that ticket in its first message.
   Tickets stay in memory, never in a URL. Convex client tokens never reach the game Worker.
3. The Worker redeems the ticket using that game's server-only secret. Admission still waits for
   both a fresh reactive authorization result and an uncached HTTP validation lease.
4. Every command and outgoing game message checks authorization, session expiry and both the
   session and account-reconciliation leases. Timer delays cannot extend these deadlines.
5. Logout, expiry or a known authorization failure stops game traffic. Reconnection requires a
   new ticket. A seat survives logout and disconnect. Account deletion vacates it and replaces
   retained identity labels with `[deleted user]`.

The admission and provisioning timings are shared constants in `src/shared/play/admission.ts`; the
ticket and redeem rate limits are in `convex/lib/playRateLimits.ts`.

The reactive query watches an explicit batch of at most 64 session registrations. New watch
generations and observation/request ordering reject stale responses. A cached reactive result
cannot renew the HTTP lease. Known disconnection or error suspends access; an otherwise silent
failure cannot extend access beyond the request-start lease or Auth expiry, whichever comes first.
Explicit denial remains denied for that registration. A cold room starts with no inherited grant.

The three mechanisms have distinct roles. The reactive subscription is the prompt path: sign-out,
session revocation and account changes arrive as pushed results within seconds. Session expiry is
not pushed; the result carries the Auth deadline and the room checks it locally before every command
and outgoing game message. The Convex client's own inactivity reconnect bounds a dead transport:
after 60 seconds without any server message it closes and reconnects, which suspends every grant
until a new generation's result arrives. The uncached lease bounds a subscription that has stalled
over a live transport: a revocation the subscription missed is denied by the next renewal, and the
lease is the ceiling when renewals neither succeed nor fail. A suspension while connected restarts
the watch after a short backoff rather than waiting for the next renewal. The lease must stay longer
than the cadence plus the request timeout
([amendment](https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5649336152) to the
connection decision).

Every new tab requires a new validation round, even when another tab shares its Auth session.
Changing the watched registrations preserves existing tabs' grants only until their original
deadlines, so joining does not interrupt an active carry. An expired positive reactive result
suspends access while an uncached check distinguishes delayed refresh data from actual expiry.

Account deletion has a durable Convex notification with acknowledgment after the SQLite change.
The room also reconciles all retained accounts in bounded batches before sending game data and
while connected. A disconnected account can therefore lose its seat without reconnecting first.

## Provisioning and transport

An operator invokes `playProvisioning:beginFixtureProvision` once after deployment. This internal
mutation creates the Stage B singleton and schedules its provisioning request. A real game is
provisioned when an Administrator creates it (`playGames.createGame`). The directory hides pending fixtures.

The game Worker checks the supplied game secret and attempt with the fixed trusted Convex backend
before creating state. Unknown, duplicate, expired and invalid requests get the same generic
refusal. Completion confirmation can retry internally without recreating the game, including when
Convex committed confirmation but the reply was lost. An unconfirmed attempt expires.

Each confirmation attempt arms its next alarm before sending the request, choosing the cadence at
request start. Within the provisioning window, the 2 second retry keeps confirmation responsive
even when a request stalls. After expiry, the 30 second recovery checks for an already committed
confirmation whose reply was lost, because an expired attempt cannot newly confirm a game.
Only the newest attempt may settle confirmation or change its alarm; older replies are discarded,
though a failed older reply still reaches diagnostics.

The publisher forwards only the canonical `/__play` namespace through its `GAME_SERVICE` binding.
The game Worker has no public route, workers.dev endpoint or preview URL. The socket requires the
exact application Origin. The [deployment contract](../deployment.md#hosted-gameplay) documents
ingress limits, Worker identity, deployment order and local infrastructure.

## Verification

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --private-banks` for
manual collection, full withdrawal, disposal, phase boundaries, reconnect, history, multi-tab
sign-out and spectator privacy. This mode uses distinct synthetic accounts in two separate browser
processes. It retains received game frames in `private-bank-frames.json` for audience inspection.
The fixture refuses seat commands, so the native suites change its faction assignments in SQL to
exercise replacement.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --public-controls` for
readiness, request, approval, dismissal, sole-player spawn, inventory drag-out and spectator checks.
This mode seeds a disposable public catalogue and installs synthetic front/back images in local R2.
Two distinct Password sessions exercise the shared controls; a third spectates. Native contracts
also cover captured deck and bundle quantities, missing backs, retries, account deletion and cold
recovery. The regular browser mode remains available for the broader tabletop interactions.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --battles` for private
plans, funding refunds, both side assignments, Undo Ready, each player's countdown reconnect,
revealed-piece dragging, opposing choices, agreement and cancellation by a seated noncombatant.
It uses two distinct signed-in browser processes and a spectator, retaining `battle-frames.json`
for privacy inspection. Native cases additionally cover exact and zero-cost funding, replacement,
cold restore, stale commands, ordering races and older results. Run browser modes sequentially,
since each builds the app for its own disposable backend.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --decks` for the fixture's
treachery deck menu and shortcuts: a one-card draw and a direct deal that keep the menu open and give
each recipient a private hand, a hover shuffle that reaches the other player with new card handles, a
hand card dragged onto the table that the spectator sees face down without its front, and a dealt hand
that survives the recipient's reload. It uses two signed-in browser processes and a spectator.

Real games are exercised on isolated backends only: the seam tests run on convex-test, the native
suite on miniflare, the browser flows on a disposable synthetic backend with fresh test
credentials. Nothing clones a production deployment and no production row is edited by hand; a
test backend is reset by rebuilding it, and a retired fixture is expired, not deleted.

### Game diagnostics

The game Worker disables automatic invocation logs. Ordinary socket messages, successful commands,
malformed requests and expected game rejections produce no application diagnostic. Logs remain
enabled with 100% sampling for explicit failures; changing global sampling would discard those
failure reports too. Cloudflare's aggregate runtime metrics remain available independently.

Unexpected failures in command processing, provisioning, authorization, account reconciliation,
account-deletion acknowledgement and socket transport emit `game-operation-failed`. Each record
contains the fixed operation name, opaque Durable Object ID, release commit, safe error category
and suppressed repeat count. Exception messages, original stacks, causes, credentials, player
identities and game payloads are omitted. Use the operation and release to locate the failing path,
then reproduce locally for exception details. Expected refusals retain their useful player-facing
message; unexpected command failures return a generic message.

Each room emits at most one custom diagnostic per operation every 60 seconds. The next eligible
failure includes the number suppressed since the previous report. A final suppressed count is not
flushed when failures stop. This uses bounded memory and no new timer, database write or background
request. The limit resets when the Durable Object is recreated; it is not an account billing cap
and does not govern Cloudflare's own runtime exception records.

The publisher's logging configuration is separate and is unchanged. This policy governs the game
Worker's high-frequency socket handling. See [Cloudflare invocation logs and sampling](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

### Local checks

Run `bun run game:test` for the room contracts and native workerd tests. The native tests exercise
the production authorization client against a controlled local Convex protocol peer, plus cold
restore against the same SQLite storage. They cover response races, missing fresh watches,
disconnects, lease deadlines, recovery from a failed subscription, a revocation caught by the next
renewal, pending admission and lost provisioning confirmation. The tests pass shorter lease and
renewal lifetimes to the watch; the production constants are not exercised. The peer does not prove
real Convex Auth behavior.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts` for the actual Convex/Auth, publisher
binding and game Worker path. It creates a synthetic local backend with no production data or
hosted development credentials. Its checks include independent non-admin users, anonymous and
spectator rejection, contested mutations, transient activity, receipt replay, phase playback,
single-use tickets, multi-tab logout, inactivity/total expiry, and account-deletion vacancy.
Retained logs contain check results and payload counters, not credentials.

Against a running [local stack](../deployment.md#hosted-gameplay), use a fresh canonical fixture
and a build with local Password sign-in enabled:

```sh
bun --no-env-file scripts/verify-hosted-play-browser.mjs \
  --origin http://127.0.0.1:8787 \
  --env-file /absolute/private/local.env \
  --credentials-file /absolute/private/browser-accounts.json \
  --report-dir /absolute/proof-output
```

The environment file must contain the loopback `CONVEX_SELF_HOSTED_URL`. Private files need mode
0600 in a mode-0700 directory, outside the report directory. The script creates synthetic accounts
and retains their credentials for later runs. Other network origins are blocked. It runs headless;
`--browser /absolute/browser-executable` selects a local Chromium-compatible executable instead
of Playwright's installed Chromium. Each run writes screenshots and a compact report without
credentials. The private-bank mode additionally retains synthetic received game frames. The internal `playTesting:retireFixture` control can retire an
old fixture on an isolated backend before provisioning a new one; it does not erase game data.

Browser proof supplements these tests with native pointer gestures, independent camera views,
playback, reload, logout and route exit. The PR records the matching demo and hosted screenshots
and sanitized reports. Payload and fanout counters establish a small fixture baseline only.
[Define multiplayer load targets and verification](https://github.com/ndelangen/dunezone/issues/1022)
owns capacity targets and load testing; it does not block this environment's first deployment.
