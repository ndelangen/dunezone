# Hosted table

This is the fixture multiplayer implementation for
[Deliver hosted multiplayer for signed-in users](https://github.com/ndelangen/dunezone/issues/1096).
The [connection decision](https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5590031475)
is the specification. The live issue records review, deployment and verification status.

## Scope and ownership

`/play/hosted` is unlinked and requires an active signed-in account. The first two distinct admitted
users occupy the fixture's Harkonnen and Atreides seats. Later users are spectators. A user's other tabs
share their seat but have independent connections and carries. These are fixture seats, not the
future seat-request, draft or faction assignment workflow. No private hands or faction messages
are dealt here. `/play/demo` stays public and local-only; `/play` remains reserved for the lobby.

Convex stores the fixture directory record, provisioning status, server-only game secrets, ticket hashes, session
registrations and account-deletion delivery records. It does not store table actions or seats.
The game Worker owns one SQLite Durable Object per game. Its transactions save the table with
command receipts and phase-boundary history. Seat changes have their own durable history.
Carries and pointers are
temporary and disappear on disconnect or cold restore.

Each socket can start at most 1,024 carries before it must reconnect. Replay history stays
bounded per connection and is released on disconnect. Ended carry IDs are never evicted while
that connection remains live, so delayed messages cannot revive an old carry.

The shared rules and geometry live in `src/shared/play`. Route-level re-exports preserve the local
demo's imports. `commands.ts`, `workers/game/room.ts` and `history.ts` extend the accepted source
implementation preserved in the [original import bundle](play-import.md#restore-the-source-history).
The browser connection and Worker admission layer replace its query-string fixture identity.

The controls panel is built from the interface kit on the dark-scheme island the play shell declares;
`dune-play.css` carries only the shell's own chrome. The line between the two, and the parts ledger a
prototype closes out with, are in
[`ui-design-decisions.md`](ui-design-decisions.md#plays-chrome-is-its-own-everything-on-its-panel-is-the-kit).

The panel takes the left half of the shape accepted on
[Prototype the controls panel for play](https://github.com/ndelangen/dunezone/issues/1147): one
`NestedTabs` rail beside the content it opens, filling the dock below the table, with the content
scrolling inside it. The hosted tabs are Shared inventory, Spice (the private bank and the public
transfers) and the fixture's own Table tab (the shared phase, the connection and playback, the
trackers, the selected piece and the storm). The phase controls, readiness included, stay in the
header. The accepted arrangement's right-hand rail, two levels with one tab per player and under
it the conversation and their public state, lands with the first per-player content. A browser
flow or story that acts on a tab other than the default opens it first; the panel is inert while a
board gesture is held, so a flow opens its tab before a drag, not during one.

## Seats, factions and stations

A seat is a stable identity the game assigned. It carries one station on the rim and, from public
assignment on, one faction; which player holds it is occupancy, kept in the actor directory and
published as the current seated players. The seating itself rides on every snapshot as the
`roster`: the station count and each seat's station, faction identity, display name and colour,
every station below the count and no two seats on one station. The table seats 2 through 18
players and places a seat at the sector its station selects (`src/shared/play/tableSettings.ts`).
The scene draws one station per count; a seat's own station places its withdrawals today and its
pieces and panel entry as later deliveries land. Two factions may share a display name; their
identities keep their banks, hands and plans apart. `neutral` (a viewer without a seat) and
`shared` (a piece no faction owns) are reserved words and never identities.

The game database keeps the seating in the `seats` table, one row per seat, and the station count
in the provisioning metadata: at provisioning for a fixture, and for a real game one seat per
approved drafting admission until public assignment fixes the factions. The room stamps the roster onto its snapshot when it opens, at
admission and at every commit, so a delivery that rewrites the rows restamps by the same path.
Private projections follow the faction a seat carries, so a replacement takes over the faction's
bank, hand and plan with the seat. A withdrawal lands in front of the acting seat's station.

The hosted fixture seats two houses, each seat named after the faction it carries, at the first two
of six stations; the first two admitted users take them in station order. A load fixture seats the
eighteen synthetic players with no faction. A room provisioned before the `seats` table existed
carried its faction-to-seat mapping in `faction_seats`; on its next start it seats those rows at
the fixture's stations, seeds a bank and combat faces for any house its snapshot lacks, and leaves
the old table in place unread. Rolling back to the earlier release is safe: it recreates
`faction_seats` when missing, ignores `seats`, the stored station count and the snapshot's roster,
and for the hosted fixture that is the same seating this release wrote. History steps stored before
the seating was published carry no roster; the browser then draws the fixture's six stations for
them.

## Retained catalogue definitions

A game keeps its own copy of the catalogue content it plays with, captured at two points and never
rewritten: the selected ruleset's supply at creation, and each faction at public assignment. The
records are the game contract's (`src/shared/play/capture.ts`); the catalogue stays the authority
for definitions and Play reads it through two public, viewer-free queries (`playCatalogue`) the way
the shared inventory already reads asset pages.

A ruleset capture holds the treachery and spice decks, the tech-token bundle and the custom decks
and bundles slot by slot, each through the same contents capture the shared inventory spawns from:
complete member definitions, counts, fronts and backs as live image references. A faction capture
holds the stored definition as it read at capture, the faces its generated components have
published (the faction token, one per supporting leader with the token as its back), the troops,
alliance card and traitor cards with no faces until their publication lands, and its Extras each
supplied once. Its declared extra phases join the record when phase authoring lands.

Every capture carries a readiness verdict: ready when every required definition and image is
present, otherwise the exact problems. A slot or Extra the catalogue cannot supply completely is
kept by name with the reason rather than dropped: a missing member, a missing front or back, an
empty required deck. An existing publication keeps a face usable while its replacement is pending
or failed. A real game refuses to proceed on a capture that is not ready; the isolated development
path may proceed on provisional content, which is not a readiness bypass for production.

The game database keeps the records in the `captures` table, one row per ruleset or faction. A
record already retained is read back without touching the catalogue, so a retry, a later source
edit or a deletion changes nothing the game plays with. A game has one ruleset; a second one is
refused. Capture creates no pieces and starts no publication job. Creation and assignment call these
seams when they land; until then only the isolated test fixture does.

## Readiness and shared inventory

[Readiness and shared inventory](https://github.com/ndelangen/dunezone/issues/1139) extend the fixture.
Mentat pause requires every occupied seat to be ready. Disconnects keep both the seat and its
readiness. Last-ready enables Next; only an explicit advance changes the phase. Previous and later
visits start fresh readiness without reversing pieces. Every phase change starts an eight-second
shared cooldown, enforced by the Worker as well as both rightmost header buttons.

The Worker includes its remaining cooldown duration in each view and update. The browser measures
that duration against its monotonic clock, so a player's wall clock cannot prolong or skip the
button lock. A tab that resumes after the deadline refreshes its controls on the next timer tick.
The Worker still checks its own deadline when a command arrives.

The controls panel holds one public inventory, initially empty. A sole seated player adds directly;
otherwise a different seated player approves the captured request. Any seated player can dismiss it.
Requests survive disconnects, account deletion and cold recovery. Approval uses the saved definitions,
member counts and image references, without reading the catalogue again. Public queries load the
catalogue without a browser token. Missing definitions, member images and backs prevent requests.
Published URLs remain live references, so later publication may replace their image bytes.

Inventory pieces use the ordinary carry, version and receipt boundaries. Dropping onto the board
removes the inventory location and turns every held item face down. Ready leaves these controls
available. Spectators see the inventory and requests but cannot change them. SQLite commits store
request, approval and dismissal records with their actor and captured contents alongside the
snapshot and idempotent receipt. Approval and direct request records also record their spawn.

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

All limits are shared constants in `src/shared/play/admission.ts`.

| Limit | Duration |
| --- | --- |
| Unused browser ticket | 30 seconds |
| Socket awaiting its first successful authorization | 5 seconds |
| Authorization and account-reconciliation lease | 5 minutes from request start |
| Lease renewal cadence | 90 seconds |
| Retry after a failed renewal or reconciliation | 1 second, doubling up to the renewal cadence |
| Authorization HTTP request timeout | 3 seconds |
| Initial provisioning attempt | 60 seconds |
| Confirmation retry within the provisioning window | 2 seconds |
| Confirmation recovery after the provisioning window | 30 seconds |
| Convex client inactivity reconnect | 60 seconds without a server message (`convex` 1.45.0, not configurable) |

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

## Real games

A real game is a `play_games` row with a ruleset, a minimum player count and a creator. The
fixture has none of these. Until the public-release decision widens access, only Administrators
create games (`/play/create`, backed by `playGames.createGame`) and only Administrators enter them:
`issueTicket`, `redeemTicket` and `watchAuthorizations` refuse everyone else, so losing the
Administrator flag revokes a seated player on the next authorization sweep. The fixture keeps its
signed-in access. `playGames.getGame` answers a game page before the socket opens: a game the
viewer may not enter reads as not found whether it exists or not, a pending game is preparing and
an expired one is unavailable. A real game has one route, `/play/$gameId`, whatever its stage; the
fixture keeps `/play/hosted`.

Creation lists the rulesets an Administrator can start with and the directory's objection when a
required deck is missing or empty. The game Worker decides completeness: provisioning captures
the ruleset before the room initializes and refuses a ruleset that is not ready, unless the
backend is isolated and marks the attempt provisional. A refused attempt initializes nothing.
The Worker reports a catalogue refusal through `playProvisioning.failProvisioning`, authenticated
with that game's secret and attempt. Only a pending attempt before its deadline can become expired
this way; a refusal cannot overwrite a ready game. Its page shows the retained reason to authorized
Administrators, while a timeout without a catalogue refusal keeps the timeout message. A later
attempt starts clean. Provisioning tells the Worker the ruleset, the minimum and the creator;
the secret never reaches the browser.

A real game opens in `drafting` on an empty table. Its roster has `minimumPlayers` stations and one
seat, the creator's, at the first position with no faction yet; everyone else who enters is a
spectator until a player approves their request (see Participation). Phase and turn commands are refused outside
`play`. The snapshot's `stage` is the presentation's only cue: the header shows the stage word
where a playing table shows its turn and phase, and the phase controls stay hidden.

## Participation

Watching never claims a place. A spectator asks for one: while the game is drafting, for a place in
the roster; once the seating is fixed, for one named vacant seat. The request is public to every
viewer by the requester's name, and the requester's own view alone marks it as theirs. One current
player approves; offline players count, so a request waits until one of them does. The approval is
judged when it takes effect, against the seating as it stands: the requester must still be
watching, a named seat must still be empty, and a drafting roster must still have room below the
18-player limit, so two approvals can never fill one place and a stale one fails with the current
state. A drafting approval adds a seat at the lowest free station, numbered past every seat the
game ever had, and the station count grows with it past the created minimum. A requester may
withdraw; a request nobody approves stays until then.

Disconnecting, idling or closing the tab changes nothing: the seat and its player stay. A player
leaves by their own departure, a removal vote (a later delivery) or account deletion. Departure
during drafting retires the place; after assignment the seat stays with its faction, station and
faction state for the replacement one approval seats, who takes over the faction's bank, hand and
plan from that commit, while the former player watches with the public projection only. When the
last player leaves or is deleted the game is discarded for good: its stage reads `discarded`, every
pending request closes, no seat command is accepted again and the lobby stops listing it, while the
table stays readable to anyone who may enter.

Seat commands (`seat-request`, `seat-withdraw`, `seat-approve`, `seat-depart`) travel as ordinary
commands with a command id and the expected revision, so a repeat returns its receipt and a stale
one fails. Each one commits the seating change, the stored snapshot, the summary the lobby is owed
and the receipt in one transaction, and restamps the roster after the rows changed. The game
database retains the request ledger in `seat_requests` (who filed it, for which seat, how it
resolved, who approved) and occupancy in `seat_history` (joined and vacated rows with their cause:
creation, admission, departure or deletion, the approver and the table event they wrote). The
table's events say who asked, who took which seat on whose approval and who left; a deleted user's
rows read `[deleted user]` and their events are rebuilt from those rows, so another player with the
same name keeps theirs. Real games alone take seat commands; the fixture seats its players itself.

In the panel, the important-decision bar above the tabs carries request, withdraw and approve. The
game menu in the header toolbar, present in every stage and left of the phase controls, offers Give up your seat; the bar then asks
once, says what leaving costs, and sends the departure. Nothing participation-related sits on the
panel's tabs; the play-stage right rail, one tab per faction, is a later delivery.

Real games are exercised on isolated backends only: the seam tests run on convex-test, the native
suite on miniflare, the browser flows on a disposable synthetic backend with fresh test
credentials. Nothing clones a production deployment and no production row is edited by hand; a
test backend is reset by rebuilding it, and a retired fixture is expired, not deleted.

## Directory summary

The lobby (`/play`) lists what the directory holds and nothing more; the route never imports the
3D runtime. A real game owes Convex a summary of what the lobby may show: its stage, who holds
which seat with any publicly assigned faction, the phase during play, the time of its last durable
change and, once a game can finish, the declared result (no Worker path declares one yet, so it
travels as null). Seated players' names are not in it. No hand, bank, prediction, plan, message, seat
history or event travels in it. Player names are never stored in Convex: the listing reads them
from current profiles, so a delayed summary cannot republish a deleted account's name. Real games
are Administrator-only, so the listing answers `not_authorized` to everyone else; the fixture
publishes nothing and is not listed.

The game Worker keeps an outbox (`directory_outbox`). A change to what the lobby may see is
staged inside the same transaction as the change, with the next sequence; the newest staged
summary replaces any older undelivered one; a staged row is never rewritten in place, and activity
alone earns a new sequence at most once a minute, so a busy table is not a delivery per drop. Delivery (`playDirectory:publishSummary`) is single-flight per room and
starts after the transaction commits, never inside it. Convex keeps the newest sequence it holds
and acknowledges every delivery with that sequence, so a stale or duplicate delivery has no
effect; the Worker clears only the acknowledged sequence, so an older acknowledgment arriving
late leaves newer work owed. A failed delivery defers with doubling backoff from 2 seconds to a
30-second ceiling, and the room's one alarm (shared with the battle deadline) retries it with no
player connected; a room that wakes owing a summary delivers it at once. The opening summary is
staged at creation and delivered after confirmation, because only a confirmed game is listed.

## Provisioning and transport

An operator invokes `playProvisioning:beginFixtureProvision` once after deployment. This internal
mutation creates the Stage B singleton and schedules its provisioning request. Browser users have
no game-creation operation in this stage. The directory hides pending fixtures.

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

## Private banks and public spice

The game database stores balances by faction. The current actor roster and faction-to-seat
assignment select the one bank a connection may receive. The Worker projects each snapshot before
computing its recipient's delta. Spectators receive no bank field. History uses the current
assignment, including when reading an earlier turn. A changed audience receives a full view and
clears browser playback. Reconnect and cold restore apply the same projection.

Fixture banks start at zero. The supply disc creates physical spice independently of the banks.
Players select a public stack and choose Take into bank to collect it, or withdraw an amount onto
the table near their station. Full-balance withdrawals need no approval. Collection consumes the
stack and credits the acting player's current faction. Dropping spice onto the supply disc removes
it without crediting a bank. Phase and turn changes leave both banks and physical spice unchanged.
There is no automatic settlement or pending-bribe balance, as decided in
[Players take spice into their banks themselves](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5653989796).

Each transfer commits its bank change, stack change, public ledger entry and command receipt in one
SQLite transaction. The public ledger records actor, kind, amount, source and destination. It never
includes a balance. The current snapshot carries the latest 20 transfers; a read-only paged command
provides older entries. Account deletion anonymizes that actor in the durable ledger and its
historical projections. No bank data goes to Convex.

The same projection omits a face-down card's front image and name in snapshots, history, carries,
shared inventories and catalogue deck previews. Operational card item IDs use a game-secret HMAC,
so public IDs cannot identify a catalogue member. New decks receive an independent shuffled order
and random item IDs when spawned; existing persisted decks keep their order. Shared inventory
thumbnails use the back. A committed flip supplies the newly public front to every viewer.

## Player-run battles

A seated player places the Battle marker during the Battle phase. Each combatant claims a side
for their current faction. The game database owns private hands, plans, reserved spice, readiness
and the reveal deadline. Other players and spectators receive neither plan contents nor counts
before reveal. Physical troop discs stay on the board; the plan declares their faces and counts.
The fixture uses captured published disc tokens as manually selected leaders. Faction authoring
remains outside this increment.

Max funding spends an exact selected amount on the strongest reachable allocation. Custom funding
uses the declared dialed counts. Removing troops can lower a Max reserve and return its difference;
adding troops never spends more automatically. Changing mode clears the declarations and reserve.
Ready locks a plan. Undo Ready preserves its contents and reserve, clears only that side's readiness
and cancels the countdown. When both sides are ready again, a new five-second countdown begins.

A Durable Object alarm commits both public plans and the reveal history checkpoint atomically.
Reconnect, seat replacement and cold restore retain the faction's plan and deadline. Reveal spends
the existing reserve without a second debit. Either combatant can publish left, right or no winner;
matching choices commit the result immediately. Pieces already moved or returned stay where the
players put them. Remaining revealed pieces move onto the table once. There are no automatic
casualties, card discards or winner calculations. Phase changes preserve an active battle and its
controls. Earlier public plans and results remain readable through ordinary table history.

## Verification

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --private-banks` for
manual collection, full withdrawal, disposal, phase boundaries, reconnect, history, multi-tab
sign-out and spectator privacy. This mode uses distinct synthetic accounts in two separate browser
processes. It retains received game frames in `private-bank-frames.json` for audience inspection.
The native suite also changes test-only faction assignments to exercise replacement, removal and
swaps before the later seat-management controls exist.

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
