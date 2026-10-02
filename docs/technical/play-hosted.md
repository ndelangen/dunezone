# Hosted table

This is the fixture multiplayer implementation for
[Deliver hosted multiplayer for signed-in users](https://github.com/ndelangen/dunezone/issues/1096).
The [connection decision](https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5590031475)
is the specification. The live issue records review, deployment and verification status.

## Scope and ownership

Players reach a game only at `/play/<gameId>`: `/play` is the lobby, and any signed-in player creates a
real game at `/play/create`. Nothing in the application links to `/play`, and every play page is
`noindex`, through a robots meta tag and through the `X-Robots-Tag` header the publisher's `_headers`
file adds to `/play` and `/play/*` ([deployment](../deployment.md#build-process)):
real games are an unlisted beta, shared privately, until the public-release decision
([#1094](https://github.com/ndelangen/dunezone/issues/1094)). The retired `/play/hosted` and `/play/demo` pages
([#1296](https://github.com/ndelangen/dunezone/issues/1296)) no longer exist in the application,
and their old addresses redirect to the lobby. The hosted fixture game they opened stays stored but
admits no player ([#1323](https://github.com/ndelangen/dunezone/issues/1323)): its `/play/<gameId>`
address answers as an unknown game does, and no ticket is issued or redeemed for it. Players enter a
real game, or a synthetic test game that the load runner and the protocol verifier create on an
isolated backend. `admitsPlayers` in `convex/lib/playAuthorization.ts` holds that rule for the game
page, the tickets and the live authorization alike. The stored fixture's account reconciliation and
deletion acknowledgements keep answering its Worker. The fixture game this document describes
remains the Worker's native test fixture and the load baseline's: the first two distinct admitted users occupy its
Harkonnen and Atreides seats, and later users are spectators. A user's other tabs share their seat
but have independent connections and carries. The expanded load profiles run the Worker's load
entry, `workers/game/load-entry.ts`, whose fixtures seat eighteen load players instead. The
production Worker never imports it.

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

The history table holds two kinds of row (`workers/game/sessionHistory.ts`). A `checkpoint` stores
the whole snapshot. It is written for a reset, for the step that leaves setup (the Next that opens
Turn 1), for a revealed battle that settles (by agreed outcome or by cancel), and by `GameSession` for the faction
assignment and the setup cleanup. Every other playback step is a `patch` against the step before
it: phase and turn changes, declaring a result and continuing past it, setup actions, Ready while
setup gates on it, and a battle's reveal. A restore loads the latest checkpoint at or before the
step and replays the patches after it, checking that each row's `base_revision` matches. `diff` in
`workers/game/history.ts` changes an array entry by entry when that is smaller than storing it
whole: a changed entry by its index, an added one at its new index, and a shorter array by its
`length`. These are the set and remove operations `applyPatch` has always read, so a room rolled
back to an earlier release still restores rows the later one wrote. `anonymizeHistory` uses the
same `diff`, so its first scrub of a room written before entry-by-entry patches rewrites most patch
rows in the new shape.

Each command names the revision its sender last saw, and `Room.assertRevision` in
`workers/game/room.ts` refuses one sent against a table that has changed since with "The table
changed. Try the action again." The actions in `REVISION_TOLERANT_ACTIONS` (spice spawns, deck
draws, battle actions, draft picks and bans, and removal ballots) name what they change and are
checked against the live table instead, so seats acting at the same moment do not turn each other
away. Readiness (`ready`, `draft-ready`, `swap-ready`) may cross other readiness, but not a commit
that changed more than who is ready. A bank withdrawal stays strict, so two tabs of one player
cannot both spend from a bank they saw once.

Each socket can start at most 1,024 carries before it must reconnect. Replay history stays
bounded per connection and is released on disconnect. Ended carry IDs are never evicted while
that connection remains live, so delayed messages cannot revive an old carry.

The shared rules and geometry live in `src/shared/play`, and the Play route imports them as
`@shared/play/<module>`. `commands.ts`, `workers/game/room.ts` and `history.ts` extend the
accepted source implementation preserved in the
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
re-provisioning.

## Connection lifetime

1. The signed-in browser requests a single-use opaque ticket from Convex. Convex resolves the
   current user and Auth session itself; the browser cannot select another identity.
2. The browser opens the same-origin game socket and sends that ticket in its first message.
   Tickets stay in memory, never in a URL. Convex client tokens never reach the game Worker.
3. The Worker redeems the ticket using that game's server-only secret. Admission still waits for
   both a fresh reactive authorization result and an uncached HTTP validation lease. A ticket
   that lapsed or was already redeemed closes the socket with code 4410 and no refusal; the
   browser requests a new ticket and reconnects, with the same wait as a ticket it finds lapsed
   before sending it. That wait doubles from 1 second up to `PLAY_TICKET_RETRY_MAX_MS`, and a view
   resets it. A refused session, account or game stays denied.
4. Every command and outgoing game message checks authorization, session expiry and both the
   session and account-reconciliation leases. Timer delays cannot extend these deadlines.
5. Logout, expiry or a known authorization failure stops game traffic. Reconnection requires a
   new ticket. A seat survives logout and disconnect. Account deletion vacates it and replaces
   retained identity labels with `[deleted user]`. Table events name the seat, never its player,
   so deletion leaves them as written.

The admission and provisioning timings are shared constants in `src/shared/play/admission.ts`; the
ticket and redeem rate limits are in `convex/lib/playRateLimits.ts`.

The browser never reads the player's wall clock; it reads server time in one of two ways. Every
frame but `admission` carries the Worker's `serverNow`, and the browser keeps the largest offset
from its monotonic clock since it last connected, so deadlines, vote ages and message times follow
the Worker's clock. A Worker duration (the phase cooldown, the battle countdown, the admission
ticket's `expiresInMs`) is measured on the monotonic clock from when it arrived, or from just
before the ticket request. A tab that resumes after a deadline refreshes its controls on the next
timer tick, and the Worker still checks its own deadlines when a command arrives. Carries and
pointers expire on the Worker alone, which broadcasts each removal.

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

A watch result does not say why it denied a registration, and a sign-out and an account deletion
look alike to the room. So any denial withdraws the room's account lease until a reconciliation
started after the denial has checked every retained account. Meanwhile the room sends no game data
and applies no command. A connection whose own grant still stands is held rather than suspended: it
is not told about the wait, the room does not clear its carry and pointer, and its messages wait and
then meet the same check as any other. A catalogue read or spawn request whose catalogue call
returns during the wait is held the same way and answered once the wait ends. A message whose
connection was suspended after it arrived is dropped, even if the connection was admitted again
since, because the page discards its unanswered requests on a pause. That includes a catalogue read
or spawn request whose connection was suspended during its catalogue call. When the lease returns,
each held connection is sent what changed since the last frame it received, so another player's
sign-out leaves its table as it was. A failed reconciliation or a lapsed lease suspends held
connections like every other. One watch result that denies several connections, such as every tab of
a signed-out session, starts one reconciliation, and a pass that a later denial or deletion made
stale is followed at once by the next, so an admission waiting on it is not refused for the stale
pass.

## Provisioning and transport

A real game is provisioned when a signed-in player creates it (`playGames.createGame`). No operator
step follows a deployment. The directory hides pending fixtures.

`createGame` refuses a session past its idle or total deadline, as `issueTicket` does
(`livePlaySession` in `convex/lib/playAuthorization.ts`); Play queries read no clock, so a lapsed
session's sign-in token bounds what it can still read.

A player may be seated in at most `PLAY_SEAT_LIMIT` games, 30, set in
`src/shared/play/participation.ts`. A game holds a seat for a player when the directory summary its
Worker published last lists them in a seat, unless the game is finished, discarded or expired. A real
game with no summary yet holds its creator's seat, because the creator is seated from creation.
`atPlaySeatLimit` in `convex/lib/playSeats.ts` counts them from the games the player created
(`play_games.by_creator_id`) and the games they entered (`play_game_accounts.by_user_id`), reading at
most the newest 200 of each, so a seat in an older game can be missed. `createGame` refuses a player
at the limit with `seat_limit` before it spends anything, and the create page shows the limit message.
Joining is refused by the game Worker: `redeemTicket` answers `seatLimitReached` for the player,
counted without the game being entered, and the room refuses that connection's `seat-request` with the
same message. It also refuses a `seat-approve` while any admitted connection of the requester's
reported the limit, telling the approver why. The flag is read once per admission, so a player who
leaves a seat elsewhere reconnects to ask again, and requests pending in several games at once can
each be approved, leaving a player a few seats over the limit. A missing flag, as an older Convex
deployment answers, reads as not at the limit. `watchAuthorizations` does not carry the flag: counting
for every registration in a batch of 64 would outgrow a query's reads, and the count's read set would
rerun the watch whenever any of those games published a summary.

Creation also draws from the token bucket `playCreatePerAccount` in `convex/lib/playRateLimits.ts`
(capacity 3, refilling at 10 an hour). It bounds how fast an account creates games, not how many it
holds open. A refusal answers `rate_limited`, and the create page says "Too many games were created
recently. Try again later."

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

The three `hosted_play` CI shards, `regular`, `catalogue` and `protocol`, are the merge gate for the
hosted flows: `ci_ok` requires all three on every pull request whose diff can reach the flows, as
the [deployment contract](../deployment.md#hosted-gameplay) describes. Each shard's command also runs
locally with the same launcher:

```sh
bun --no-env-file scripts/verify-hosted-play-stack.ts --shard regular --browser-only
bun --no-env-file scripts/verify-hosted-play-stack.ts --shard catalogue --browser-only
bun --no-env-file scripts/verify-hosted-play-stack.ts --shard protocol
```

CI also passes `--skip-generate`, Playwright's full Chromium as `--browser` and
`--expect-renderer webgl2-swiftshader`, the renderer of its Linux runner; a local run can leave them
out. A local run is optional and never required before merging.

The `hosted_play_webgpu` job, also required by `ci_ok`, runs the `regular` shard a second time on a
standard macOS runner. There full Chromium draws the table with WebGPU on the runner's Metal device,
and the job passes `--expect-renderer webgpu` in place of `webgl2-swiftshader`. Reverting the fix
for [#1272](https://github.com/ndelangen/dunezone/issues/1272), a vertex buffer validation error only
WebGPU reports, turned most of this job's runs red while the Linux shards stayed green.

In CI the hosted shards run on a pull request only when its diff can reach the flows, decided by
the `play_closure` job from the closure in `scripts/lib/hosted-play-closure.ts`; a daily run on
`main` runs them once more when the tree at its tip has not had them
([deployment](../deployment.md#hosted-gameplay)).

`bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --flow all` boots one stack and
runs every browser flow against it, each on a fresh game with fresh accounts. `--flow` repeats to
select flows by name. A failed flow does not stop the ones after it, and the run fails at the end.
Only the public-controls flow, which checks the phase cooldown, plays at the real cooldown. The
launcher provisions every other flow's games with none: before each flow it sets the backend's
test-only `PLAY_TEST_PHASE_COOLDOWN_MS` to 0 or removes it, and a synthetic backend passes the value
to the game Worker at provisioning. In the same way it sets `PLAY_TEST_START_STAGE` to `play` for
every flow but `regular`, so those flows' games are provisioned past drafting and setup: the Worker
takes each such game to Turn 1 with the commands its players would send, seating placeholders that
ready the draft, keep the seats they are dealt and ready every setup step beside the creator, and
then give up their seats. The synthetic backend vouches for those placeholders when the room
reconciles its accounts, so the game's log keeps their names, and the flow's second player joins
through the open seat as a replacement would. The `regular` flow keeps creating its
game at drafting and stepping through every stage, which is what it proves. The Worker refuses to
provision a game with either test value unless its `GIT_SHA` is play-local's `local-isolated` and
its `APPLICATION_ORIGIN` is a loopback origin.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --flow private-banks` for
manual collection, full withdrawal, disposal, phase boundaries, reconnect, history, multi-tab
sign-out and spectator privacy. This mode uses distinct synthetic accounts in two separate browser
processes. It retains received game frames in `private-banks-frames.json` for audience inspection.
The fixture refuses seat commands, so the native suites change its faction assignments in SQL to
exercise replacement.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --flow public-controls` for
readiness, request, approval, dismissal, sole-player spawn, inventory drag-out and spectator checks.
It needs the disposable public catalogue, which the launcher seeds once per run with synthetic
front/back images in local R2.
Two distinct Password sessions exercise the shared controls; a third spectates. Native contracts
also cover captured deck and bundle quantities, missing backs, retries, account deletion and cold
recovery. The regular browser mode remains available for the broader tabletop interactions.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --flow battles` for private
plans, funding refunds, both side assignments, Undo Ready, each player's countdown reconnect,
revealed-piece dragging, opposing choices, agreement and cancellation by a seated faction outside the battle.
It uses two distinct signed-in browser processes and a spectator, retaining `battles-frames.json`
for privacy inspection. Native cases additionally cover exact and zero-cost funding, replacement,
cold restore, stale commands, ordering races and older results.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --flow decks` for the deck
menu's one-card draw and direct deal, the hover-and-R shuffle, a private hand card dropped face
down on the table, and a dealt hand surviving the recipient's reconnect. It uses two distinct
signed-in browser processes and a spectator, and it retains received game frames in
`decks-frames.json`.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts --browser-only --flow results` for the end
of a real game. Two players step to Mentat pause, one opens Determine winner and declares a faction,
and a spectator watches. It checks each panel's decision bar, a reload into the finished game, the
lobby's Past entry with its winner, and Continue playing back to Mentat pause and the Ongoing list.

### Real-game journeys

`workers/game/journey.native.test.mjs` takes whole real games through the native workerd runtime,
each on its own miniflare store with synthetic accounts and catalogue. Every other native suite
proves one rule; these prove the rules still hold when one game passes through all of them.

- Two accounts go from creation through drafting, the deal, trading, setup and play to a declared
  result and Continue playing. On the way the directory refuses writes twice and the alarm delivers
  the owed summary, the socket drops right after a withdrawal and its identical retries debit once,
  a player reconnects, and the room restarts cold in play and again while finished.
- Eighteen accounts are each dealt a distinct faction, station and bank, finish as an alliance,
  restart cold and continue at Mentat pause. A spectator holds no bank and cannot end the game.
- In a running game a player leaves and a spectator takes the seat with its faction and bank. The
  replacement declares a result and then deletes their account. The result, log and stored history
  name `[deleted user]` through a restart, and the last departure discards the game.

Every browser flow above creates its own real game at `/play/create`; the `regular` flow plays it
through drafting and setup, and the others start at Turn 1 as described above. The `results` flow
also finishes and continues one, so the lobby's Create and Past listings and the result bars are
covered by a signed-in browser run as well as by Storybook and the native journeys.

A real game deals only ready content. The catalogue capture (`workers/game/catalogue.ts`) refuses
a faction until its token faces, leader, troop, traitor and alliance faces, troop battle values
and Extras are all published. A real game judges each drafted faction when it is picked, and the
deal judges every faction it captures, random fills included. A refused faction is set aside with
its reason (`DraftState.setAside`): the draft list shows the reason, it cannot be picked or
random-filled, and the next draft command after a fix reads the catalogue again and returns it to
the pool. A refusal that only random filling met leaves readiness standing, and the deal fills from
what remains; a drafted one changes the pool, so readiness clears (#1613). An isolated backend marks
its content provisional and deals it regardless. The native journeys run on that provisional
synthetic content: one-card decks and factions that share one published fixture's faces. They say
nothing about capacity or about the actual catalogue, which the live checks on #1232 cover.

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
It creates its synthetic accounts through `playTesting:provisionAccounts` before the first check,
so every check signs in and none signs up. Retained logs contain check results and payload
counters, not credentials.

The launcher's backend lets a query or mutation run for 2 s, where Convex's default, which hosted
deployments keep, is 1 s. By default Convex Auth checks a password with Scrypt inside a mutation at
every sign-in, and on a loaded machine that check alone passed 1 s
([#1493](https://github.com/ndelangen/dunezone/issues/1493)). A function that takes between 1 and
2 s therefore passes on this stack and fails on a hosted deployment.

The launcher also sets the test-only `PLAY_TEST_PASSWORD_HASH=pbkdf2` on its backend, and there
Password stores and checks PBKDF2-HMAC-SHA256 at 1,000 iterations instead of Scrypt
(`convex/lib/syntheticPasswords.ts`). Scrypt was most of each sign-in's `auth:store` time on the
macOS runner, and a stall of that runner during it ended a sign-in at the 2 s limit (#1493). A work
factor multiplies the cost of each guess, which protects a password a person chose, and the
synthetic accounts' passwords are 48 random hex digits that take up to 2^192 guesses anyway. NIST SP
800-132 recommends 1,000 iterations as a minimum, and they take about a millisecond. Only an
isolated loopback backend honours the variable, and only the launcher sets it, so every other
backend keeps Scrypt. Production keeps `E2E_LOCAL_AUTH` off and so registers no Password provider at
all, and the `--load-hosted-backend` copy keeps Scrypt because its own URL is the hosted one. The
runners send each password to `playTesting:provisionAccounts` both ways, and the control keeps the
one the backend checks.

The browser flows play real games. The stack seeds a synthetic ruleset
(`playTesting:seedRealGameCatalogue`) with both required decks, a treachery deck of treachery cards
and a spice deck of spice cards, and two factions, installs its publication bytes, and passes its
id to each flow. Every flow signs in synthetic accounts without the Administrator flag, creates a
game at `/play/create`, seats the second player through a seat request and its approval, and reaches
Turn 1 before its own checks: the `regular` flow plays through drafting and setup, and the others
start there, as described above. Against a running
[local stack](../deployment.md#hosted-gameplay), seed that ruleset once and use a build with local
Password sign-in enabled (`VITE_E2E_LOCAL_AUTH=true`). That build also installs
`window.__duneTable`, and the script projects table positions through the camera it exposes.
Create a mode-0700 directory under the operating system temporary directory, reported by
`node -p "require('node:os').tmpdir()"`. In the command below, `/PRIVATE_TEMP` means that private
directory; it must be replaced with its absolute path:

```sh
bun --no-env-file scripts/verify-hosted-play-browser.mjs \
  --origin http://127.0.0.1:8787 \
  --env-file /PRIVATE_TEMP/local.env \
  --credentials-file /PRIVATE_TEMP/browser-accounts.json \
  --report-dir /absolute/proof-output \
  --flow regular \
  --ruleset-id <rulesetId>
```

The environment file must contain the loopback `CONVEX_SELF_HOSTED_URL` and the backend's
`CONVEX_SELF_HOSTED_ADMIN_KEY`. Private files need mode 0600 and at most 8 KiB, and the report
directory must not contain them. Before Chromium starts, the script creates its synthetic accounts
through `playTesting:provisionAccounts` and retains their credentials for later runs, so a browser
only signs in. A sign-in fails the flow when the backend refuses it, when it reaches the login
form's sign-up fallback, or when the script never saw the form's `auth:signIn` frame. Other
network origins are blocked. It runs headless;
`--browser /absolute/browser-executable` selects a local Chromium-compatible executable instead
of Playwright's installed Chromium. On Linux it adds `--use-angle=swiftshader`: headless Chromium
there draws WebGL on SwiftShader and composites in software, which reads each WebGL frame back on
the page's main thread, and the switch moves compositing onto SwiftShader too. Other platforms
launch with no added switch. Without `--browser`, Playwright launches its headless shell, which takes
the same readback path on macOS as on Linux; full Chromium on macOS draws on Metal, and on the CI
macOS runner it draws the table with WebGPU. The report's
`chromium` field records what the running browser reports about itself: its build (`headless-shell`
or `full`), the executable path from its command line and its version, with the switches the script
added. Its `renderer` field records the backend three.js initialised for the first table the flow
opens, read through three.js's devtools hook: `webgpu` with the adapter's vendor and architecture,
or WebGL2 with the unmasked GL renderer string, as `webgl2-swiftshader` when that string names
SwiftShader and `webgl2-other` when it does not. When no backend was read within 15 s, the kind is
`unidentified` with the reason. `--expect-renderer` takes one of those three and
fails the flow at that table, naming both, when the table rendered with another; without it no
renderer is enforced. With or without it, the flow fails at its end when any of its pages logged an
uncaptured WebGPU error. three.js logs such an error and keeps drawing, so the flow's pixel checks
can pass while some draws fail. `--flow` names one flow and defaults to `regular`. Each run writes
screenshots and a compact report without credentials. A flow that retains synthetic received
game frames writes them to `<flow>-frames.json`.

Browser proof supplements these tests with native pointer gestures, independent camera views,
playback, reload, logout and route exit. The PR records the screenshots and sanitized reports. Payload and fanout counters establish a small fixture baseline only.
[Define multiplayer load targets and verification](https://github.com/ndelangen/dunezone/issues/1022)
owns capacity targets and load testing; it does not block this environment's first deployment.
