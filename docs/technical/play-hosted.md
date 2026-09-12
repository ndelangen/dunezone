# Hosted table

This is the fixture multiplayer implementation for
[Deliver hosted multiplayer for signed-in users](https://github.com/ndelangen/dunezone/issues/1096).
The [connection decision](https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5590031475)
is the specification. The live issue records review, deployment and verification status.

## Scope and ownership

`/play/hosted` is unlinked and requires an active signed-in account. The first two distinct admitted
users occupy the fixture's Harkonnen and Atreides seats. Later users observe. A user's other tabs
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
| Authorization and account-reconciliation lease | 10 seconds from request start |
| Lease renewal cadence | 3 seconds |
| Authorization HTTP request timeout | 3 seconds |
| Initial provisioning attempt | 60 seconds |

The reactive query watches an explicit batch of at most 64 session registrations. New watch
generations and observation/request ordering reject stale responses. A cached reactive result
cannot renew the HTTP lease. Known disconnection or error suspends access; an otherwise silent
failure cannot extend access beyond the request-start lease or Auth expiry, whichever comes first.
Explicit denial remains denied for that registration. A cold room starts with no inherited grant.

Every new tab requires a new validation round, even when another tab shares its Auth session.
Changing the watched registrations preserves existing tabs' grants only until their original
deadlines, so joining does not interrupt an active carry. An expired positive reactive result
suspends access while an uncached check distinguishes delayed refresh data from actual expiry.

Account deletion has a durable Convex notification with acknowledgment after the SQLite change.
The room also reconciles all retained accounts in bounded batches before sending game data and
while connected. A disconnected account can therefore lose its seat without reconnecting first.

## Provisioning and transport

An operator invokes `playProvisioning:beginFixtureProvision` once after deployment. This internal
mutation creates the Stage B singleton and schedules its provisioning request. Browser users have
no game-creation operation in this stage. The directory hides pending fixtures.

The game Worker checks the supplied game secret and attempt with the fixed trusted Convex backend
before creating state. Unknown, duplicate, expired and invalid requests get the same generic
refusal. Completion confirmation can retry internally without recreating the game, including when
Convex committed confirmation but the reply was lost. An unconfirmed attempt expires.

The publisher forwards only the canonical `/__play` namespace through its `GAME_SERVICE` binding.
The game Worker has no public route, workers.dev endpoint or preview URL. The socket requires the
exact application Origin. The [deployment contract](../deployment.md#hosted-gameplay) documents
ingress limits, Worker identity, deployment order and local infrastructure.

## Verification

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
disconnects, lease deadlines, pending admission and lost provisioning confirmation. The peer does
not prove real Convex Auth behavior.

Run `bun --no-env-file scripts/verify-hosted-play-stack.ts` for the actual Convex/Auth, publisher
binding and game Worker path. It creates a synthetic local backend with no production data or
hosted development credentials. Its checks include independent non-admin users, anonymous and
observer rejection, contested mutations, transient activity, receipt replay, phase playback,
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
credentials or raw socket frames. The internal `playTesting:retireFixture` control can retire an
old fixture on an isolated backend before provisioning a new one; it does not erase game data.

Browser proof supplements these tests with native pointer gestures, independent camera views,
playback, reload, logout and route exit. The PR records the matching demo and hosted screenshots
and sanitized reports. Payload and fanout counters establish a small fixture baseline only.
[Define multiplayer load targets and verification](https://github.com/ndelangen/dunezone/issues/1022)
owns capacity targets and load testing; it does not block this environment's first deployment.
