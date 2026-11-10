# Physical-table bidding

The tool at `/tools/bidding` runs Treachery auctions beside a physical Dune board. Cards and spice
stay on the table. One central tablet or phone owns the auction, and players can use phone
remotes, voice or the central controls together.

On 2026-11-10 the user approved the tablet and remote design, then explicitly requested the whole
working tool, testing and production delivery. That request extends the original planning-only
scope of [IRL bidding tool: agree a build-ready specification](https://github.com/ndelangen/dunezone/issues/2835).
The user asked for continued work while away, separate reviewers using different models, and
checks of UI reuse, the design decisions, architecture, code quality, coverage, QA, performance
and billing. This document is the build contract and release audit. An unchecked gate is not a
completed verification.

## Sources of agreement

The decision tickets own the detailed product rules. This document connects them to the build and
its acceptance evidence.

| Contract | Canonical source |
| --- | --- |
| Auction, hands, corrections and phase progression | [Bidding tool: decide auction rules, hand counts and corrections](https://github.com/ndelangen/dunezone/issues/2838#issuecomment-6752912315) |
| Authority, local restoration and phone promotion | [Bidding tool: decide table authority, access and recovery](https://github.com/ndelangen/dunezone/issues/2836#issuecomment-6753348442) |
| Voice, phone, tablet and timer competition | [Bidding tool: agree mixed-input behavior](https://github.com/ndelangen/dunezone/issues/2840#issuecomment-6753627037) |
| Approved visual reference | [Bidding flow review at the approved revision](https://github.com/ndelangen/dunezone/tree/3a2d970c579/src/app/routes/_tool/tools/bidding-prototype) |
| Browser and connection limits | [Bidding tool: establish browser and network capabilities](https://github.com/ndelangen/dunezone/issues/2837#issuecomment-6751836174) |
| Local speech engine and device questions | [Bidding tool: establish offline voice capabilities](https://github.com/ndelangen/dunezone/issues/2844#issuecomment-6751854891) |

The [original linked-table prototype](https://github.com/ndelangen/dunezone/tree/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding)
supplies behavior only where those decisions do not replace it. Its Harkonnen limit, automatic
bonus increment, automatic next-card start, undo history and render-captured command processing
must not return through reuse. The approved visual prototype uses fixture data and simulated
connections, audio, timeouts and recovery. It is a reference, not the production implementation.

## Product contract

A phase contains the chosen number of card auctions. A bidding opportunity is one faction's
chance to bid or pass on one card. Full reports participation separately from the hand count.
Always pass is a persistent choice; an ordinary Pass consumes only the current opportunity.

| Flow | Required result |
| --- | --- |
| Set up | Choose a catalogue ruleset and factions, starting with the base six. Add, remove and reorder factions to match storm order in a separate setup step on the central device. Show the join QR and each faction's live phone connection beside the shared seating controls. Hand controls appear after setup. Finish setup opens the waiting table without starting an auction. Keep its circle fixed to the real seating arrangement. |
| Join | Scan the central QR code or enter its short code, then choose a faction. A deliberate new claim replaces that faction's previous remote. |
| Start a phase | Suggest one card for each non-full faction. Update that suggestion until the first auction starts, unless the table chooses another count. The central device changes the card count with the minus/value/plus control in either mirrored table bar before that first auction. The phase count is not part of table setup. The timer remains configurable before the first auction. An assigned remote or the tablet can select the first bidder by tapping a faction, then press Start new bid. Starting freezes the phase's card count. |
| Bid | Accept a higher positive whole-spice amount from the current bidder. Bid, Pass and green +1 are separate controls. A raise clears ordinary passes; Always pass stays enabled. |
| Win | When the other eligible factions have passed since the latest raise, record the winner and amount, add exactly one card and recalculate Full. Preserve the physical payment and peek reminders. |
| Next card | Wait for Start new bid. Suggest the next non-full faction after the previous starter, wrapping in configured order. Let a player choose another starter. |
| Reset | Abandon only the current card's auction. Keep setup, hands, Full, Always pass, completed wins and the chosen phase count. Wait for a new explicit start. |
| Finish | End after the chosen cards, when all pass on an unbid card, or when nobody remains eligible. Show results. Next phase is available on assigned remotes and the tablet. It keeps the table setup, hands and completed wins, refreshes the card-count suggestion and waits for another explicit Start new bid. |
| Leave | Confirm leaving this device's table and removing its local recovery copy. Return to New table / Join table and clear the join URL. Other devices keep their copies. A stale tab must not erase a newer tab's recovery record. |

Every faction starts with a hand limit of 4. Counts and limits accept manual corrections. Changing
either recalculates Full as `count >= limit`; a manual Full override lasts until that next change.
A faction marked not Full may bid even above its stated limit. Winning recalculates Full after the
single-card increment. Hand edits never cancel an accepted bid or rewrite a completed result.

Always pass starts off and remains as chosen across raises, card auctions, Reset and later phases.
It does not alter Full, the hand count or the phase's suggested card count. A player can change it
outside their turn. Tablet controls can edit every faction; a remote edits its assigned faction.

The timer defaults to 15 seconds. It can be off or 5 through 70 seconds in five-second steps.
Expiry submits an ordinary Pass for the opportunity whose timer began. Waiting for Start new bid
or Resume has no running timer. Resume gives the restored bidder a fresh full interval.

Useful acceptance examples:

- A hand of 5 with limit 4 and Full switched off can bid. Changing its count to 6 turns Full on.
- If Atreides opened and Fremen won, the next suggested starter follows Atreides, skipping Full
  factions. The winner does not determine the next starter.
- If a phone Pass beats a spoken bid to the central session, the spoken result is refused. It
  cannot bid for the next faction or for Atreides when its turn later returns.
- If Emperor wins, its payment reminder names the bank. Otherwise a seated Emperor receives the
  payment, with the bank as the fallback when Emperor is absent. These inherited reminders do
  not implement arbitrary faction powers.

## Approved UI

The standalone route has no application chrome. It reuses the existing kit and tool controls.
The [tablet capture](https://github.com/ndelangen/dunezone/blob/3a2d970c579/src/app/routes/_tool/tools/bidding-prototype/review/tablet.png)
and [remote capture](https://github.com/ndelangen/dunezone/blob/3a2d970c579/src/app/routes/_tool/tools/bidding-prototype/review/remote.png)
record the approved direction.

The tablet gives its space to large faction tokens, hand counts and the bidder. Tokens face the
centre. Hand information shares each token's orientation, sits between token and bidder, and uses
large Dune lettering with a thick outline in the background colour. The pointer aims at the
token's centre. Its centre shows the highest bidding faction and amount, with the timer when
enabled. Full darkens the token and adds the black prohibition mark used by Dune Play. Faction
names are optional and off by default. Hand limits are optional and off by default; hiding them
keeps the hand count visible and does not change the limit or Full behavior. Both display choices
are available during setup and in the tablet menu.

The top and bottom bars contain the same controls, with the top bar upside down. Sheets opened
from either bar face that side of the table and attach to its edge. Phone actions and hand
controls stay near the bottom for thumb reach. The next-starter control uses clickable faction
tokens. Motion follows the spice tool's character, while respecting reduced motion and never
delaying command acceptance.

Page composition stays in the route. Reuse `IconAction`, `LabeledAction`, `ControlBlock`,
`SortableItem`, `SortableReorderHandle`, `TouchSurface`, `SheetPopover` and the existing faction
token rendering where their contracts fit. Follow the [UI design decisions](ui-design-decisions.md)
and [component ownership](ui-component-hierarchy.md). A novel visual is not permission to add a
second kit or export a one-page assembly as a widget. Bidding and the Treachery tracker share
`FactionSeating` for the setup list, reordering, removal and add control. Each route keeps its
full faction data and owns its add chooser.

## Build ownership

These boundaries define the implementation. The final review must check them against the code.

| Owner | Responsibility |
| --- | --- |
| `src/app/routes/_tool/tools/bidding/route.tsx` and its stylesheet | Compose setup, tablet, remote, inspection and recovery flows from the approved UI. Own local view choices and bid drafts. |
| Route-local `auction.ts` | Pure auction transitions, hand semantics, phase progression and results. |
| Route-local `session.ts` | One synchronous command decision path, assignments, opportunities, generations, revisions and command receipts. React reads its snapshot. |
| Route-local `client.ts` and `recovery.ts` | Complete local records, browser ownership, transport lifecycle, timer scheduling and command retries. These are replaceable seams, not a second auction engine. |
| Route-local `setupRequests.ts` | Keep catalogue responses tied to the setup that requested them, including hand edits made while a request is pending. |
| `src/shared/tools/biddingSession.ts` | Validated state, command and result contracts shared by the deployed artifacts. |
| `src/shared/tools/biddingTransport.ts` and route-local `transport.ts` | Validated relay/signaling frames and browser links. Prefer an open direct channel, with relay fallback. |
| `workers/game/biddingTable.ts` | A separate hibernating Durable Object for introductions and relay. It owns connection admission, not auction decisions or auction storage. |
| `src/app/db/biddingTool.ts` and its bounded catalogue reads | Capture the selected ruleset, faction faces and card display data during setup. Active auctions and remotes hold no catalogue subscription. |
| Route-local voice modules and pinned assets | Local keyword recognition, capture health, announcements and release CSP compatibility. |

Every actionable command identifies the table, central instance, command generation, bidding
opportunity and command. A phone's faction comes from its authenticated assignment. The central
validates commands independently of the UI, including numeric bounds and allowed stages. Invalid
input leaves the opportunity available. The first valid action wins; retries return the recorded
result. A bounded receipt store must still reject old commands after their detailed receipt expires.

Short codes locate tables. Separate random capabilities authorize central and remote reconnection.
Keep the central capability out of phone snapshots, QR links, URLs and logs. A code collision during
creation retries with another code. A replaced connection stops reconnecting and closes its direct
channels. A displaced remote may choose its faction again deliberately, but does not reclaim it
automatically.

Join frames advertise a protocol version. An older phone connected to an updated central device
receives a refresh message and closes its direct channel. The relay retains the central's required
version while it is disconnected and across hibernation. Legacy tables keep working together, and
updated phones can still join a legacy central device. Deploy the game Worker before the app.

Parse and bound both relay and direct messages. Bound UTF-8 frame size, SDP, text, arrays and
completed state before acceptance. A rejected size limit must not silently discard completed wins.
Authentication and socket metadata must survive Durable Object hibernation. A relay disconnect alone
does not destroy a healthy direct channel, and broadcasts include those direct peers.

The implemented limits allow 24 factions and 24 simultaneous remotes. A complete snapshot is at
most 196,608 UTF-8 bytes, and a transport frame is at most 262,144 bytes. Larger direct copies use
bounded chunks with incomplete-copy expiry. Reconnect metadata retains at most 128 device
capability hashes. The relay stores table identity, capability hashes and central generation data;
it stores no auction snapshot, cards or bids.

## Recovery and audio

The central stores a complete, versioned local record after changes. Each phone keeps its latest
complete valid snapshot, its source identity and revision, and its own receipt time. A later-arriving
old revision cannot overwrite a newer copy. Display storage failure without preventing live play.
Do not claim a recovery copy exists after a failed write.

Local central restoration keeps the table code and remembered assignments, restores the current
bid and bidder, and pauses for Resume. It creates a fresh instance and command generation. It never
restores a running deadline, pending command or recognition queue. Sleeping or interrupted central
execution must not turn elapsed time into a pass when it returns.

Use this phone as central closes the old link and restores the phone's copy into a new identity and
code. Clear assignments and pending work. Show the copy's receipt time, hands, setup, phase,
completed wins, current bid and bidder for inspection, then wait for Resume. Other phones rejoin and
choose factions. The old central stays in its old table. No election or merging is part of this
contract. Without a valid copy, offer fresh setup and manual hand entry.

Listen and announcements are separate, initially off. The English voice vocabulary is bid one
through bid twenty, bid plus one, pass and reset. Bare numbers do not bid. Voice does not identify
the speaker and has no confirmation step. It has no hand-edit, starter, Start new bid or Resume
command. Manual bid amounts may exceed the voice vocabulary.

Audio capture records its opportunity and listening session before recognition. Turn changes,
Stop listening, Reset, pause, Resume, card start and replacement invalidate old frames, partial
phrases and results. Two results in one recognition batch cannot act on two later bidders.
Announcements remain interruptible while listening and must avoid recognized command phrases,
including phrases introduced by catalogue names. Capture refusal, interruption and failed loading
remain visible and leave manual controls usable.

The local engine and model load only after an explicit listening action. Pin and self-host the
artifacts, retain their license notices, and validate cache completeness and integrity. Browser
packaging must work under the release CSP without dynamic JavaScript evaluation. Any WASM
permission belongs to the worker response that needs it. A downloaded model is separate from a
running microphone, and a local recognition engine does not prove that every speech-synthesis
voice works offline.

## Performance and operating cost

Keep auction state in browsers and catalogue access in setup. The relay needs no periodic server
poll, auction database writes or long-running task. Use hibernating sockets and runtime keepalive
responses. Countdowns render locally; they do not publish a state or write storage every frame.

Publish complete snapshots after changes and periodically as agreed. Serialize a revision once and
reuse it for recipients. Avoid sending a second relay copy to a peer already served directly.
Receiving an unchanged periodic copy updates liveness and receipt information without rewriting
the whole recovery snapshot. Snapshots contain selected display metadata and asset URLs, never
voice binaries or image payloads.

The browser sends a small heartbeat every two seconds and a complete unchanged snapshot every
30 seconds. The 12 client seam tests verify this cadence and that unchanged copies do not rewrite
the stored snapshot. The relay answers transport keepalive pings through its runtime auto-response.
Relay message cadence alone is not evidence of continuous billed execution time.

A local catalogue probe observed one `battleWheelTool:rulesets` query and one `biddingTool:setup`
query in the default New table flow. Both subscriptions were removed before Start. A three-second
active sample had no query-set changes. This measures the normal default flow, not every custom
faction search. The doorway uses one-shot reads with `hold: false`.

Measure before claiming an improvement. Record snapshot bytes and frames per minute for direct and
relay-only play, catalogue reads during setup and during an active auction, and main-thread work
while a timer runs. Exercise at least six remotes and an eight-faction display. Measure cold voice
download, initialization and memory separately from manual bidding. No hosted load run or paid
speech service is needed for this feature's acceptance.

A local desktop probe used Chromium 158.0.8127.18, the real game Durable Object, eight synthetic
factions and six joined phones. Its faction records had no token URLs, so the 2,522-byte final
snapshot does not represent a table with full published artwork metadata. Neither unchanged-state
window produced page errors, Worker error logs or voice-asset requests.

| Measured window | Direct, 32.213 seconds | Relay-only, 32.033 seconds |
| --- | ---: | ---: |
| Central main-thread task time | 324.088 ms | 235.127 ms |
| Central script time | 195.329 ms | 107.335 ms |
| Central layout time | 5.354 ms | 7.625 ms |
| Central application traffic | 96 heartbeats, 21,408 bytes, and six full copies, 16,914 bytes, over WebRTC | 15 heartbeats, 7,350 bytes, and one full copy, 2,887 bytes, to the Durable Object |
| Relay application traffic | No auction frames | 90 heartbeats, 28,800 bytes, and six full copies, 16,302 bytes, to phones |
| Central recovery writes | 0 | 0 |
| Writes per phone | 0 full snapshots and 1 small receipt record | 0 full snapshots and 1 small receipt record |

Transport keepalives added seven ping/pong pairs in the direct window and eight in the relay
window, answered through runtime auto-response. These are bounded local observations, not mobile
timing guarantees or a hosted billing estimate. The different windows are not a latency comparison
between the two paths.

The voice engine reserved a 512 MiB WASM linear heap in a manual worker check. This is the heap's
addressable size, not a resident-memory measurement. Stop terminates its worker and releases the
audio context. Physical memory pressure, heat and battery use remain playtest questions.

The final local Chromium voice test measured 932.2 ms from Listen to the first worklet frame and
2,353.6 ms from Listen to an accepted bid. An earlier passing run measured 1,293.3 ms and 2,960.3 ms.
These include listener startup and the synthesized phrase, so they are not isolated recognition
latency or device guarantees. The local server supplied 20,569,410 uncompressed listener-asset
bytes in seven requests. Permission refusal made no worker or model request, and an offline
restart in the same loaded page made no additional listener-asset request. HTTP compression and a
cold offline page launch were not measured by this test.

## Review and release gates

Follow [the confidence stack](../adr/0002-confidence-stack.md): schema-derived types, behavioral
tests at the public seams, and a small number of real-stack browser flows. Do not substitute
BroadcastChannel stories or mocked network responses for WebSocket and WebRTC verification.

- [x] The user approved the tablet and remote direction and requested the complete production tool.
- [x] Four agents reviewed the prototype using GPT-6.1 Sol, GPT-6 Astra, GPT-6.1 Terra and GPT-6 Sol.
  They identified implementation gaps and the far-side sheet placement defect.
- [x] Auction tests cover Full overrides and recalculation, Always pass, explicit starts, next
  starter, Reset, all-pass completion and exactly one card added per win.
- [x] Command tests cover simultaneous phone, tablet, voice and timer input; invalid first input;
  duplicates; lost acknowledgements; stale opportunities and generations; and a faction's later turn.
- [x] Recovery and client tests cover complete round trips, malformed or old records, storage refusal, local
  paused restore, phone promotion, cleared assignments and late old-table callbacks.
- [x] Worker and transport tests cover code collisions, capability checks, replacement, restart
  persistence, frame limits, incomplete-copy expiry and a direct link surviving relay loss. Closing
  socket state lives in serialized attachments. A true hosted hibernation during close was not induced.
- [x] Two real-stack Chromium flows pass with coverage collection enabled. The tablet-only flow
  completes a one-card phase with phones and listening unused. The remote flow mixes phone and
  tablet actions, edits participation, survives relay loss over WebRTC, restores and resumes the
  central, promotes a phone, rejoins through relay fallback and completes phases, including a
  resumed five-second timer expiry.
- [x] Voice boundary and asset tests cover the vocabulary, stale captured contexts and pinned
  bytes. A browser test runs the actual WASM and AudioWorklet under the release policy, with
  simulated microphone permission refusal, track cleanup and offline listener restart.
- [x] The committed audio browser test feeds synthesized speech through capture and verifies its
  acceptance by a real session. Physical speech and speaker-to-microphone feedback remain separate.
- [x] Current browser UI checks cover central creation and phone joining, reflected phone bidding,
  matching mirrored sheets, phone touch targets and reduced motion. See the limits below.
- [x] Keyboard, names-toggle and Full-mark QA pass against the working route. Tab shows a visible
  focus ring, Enter creates a table, names toggle off/on/off, and Full matches the Dune Play sign.
- [x] Manual-play performance evidence records browser work, frame sizes, cadence, catalogue reads
  and storage writes with eight factions and six remotes over both paths.
- [x] Record voice cold startup and download evidence separately from the manual-play probe.
- [x] Different agents and models reviewed the working code, architecture, UI reuse, design-decision
  adherence, coverage and QA. Their actionable findings have fixes and scoped verification.
- [ ] Read and resolve actionable PR review comments before delivery.
- [ ] Required repository checks and CI pass on the reviewed revision. Merge and deploy through the
  established workflow; delivery does not stop at the PR.
- [ ] Verify the deployed application and game Worker release identities, open `/tools/bidding`,
  check its assets, and exercise the normal central-and-remote flow in production.

Production verification uses normal application flows. This release does not authorize direct
administrative writes to production catalogue or account data. Follow the repository's separate
confirmation rule if such a repair becomes necessary.

## Local verification evidence

These results were collected on 2026-11-10 before CI and production delivery. A combined run of
the nine bidding, catalogue and asset unit suites passed all 65 tests. Counts overlap where
a focused suite was rerun; they are not a cumulative test total.

| Check | Completed evidence | Scope |
| --- | --- | --- |
| Auction, command and recovery seams | 36 tests in [auction](../../src/app/routes/_tool/tools/bidding/auction.test.ts), [session](../../src/app/routes/_tool/tools/bidding/session.test.ts) and [recovery](../../src/app/routes/_tool/tools/bidding/recovery.test.ts) pass. | Pure transitions, conflict rules and validated records. Actual storage and timers belong to the client and browser checks. |
| Browser orchestration seam | All 12 [client tests](../../src/app/routes/_tool/tools/bidding/client.test.ts) pass. | Retries, fresh timers, promotion, storage refusal, competing local centrals, cadence and direct-link continuity with replaceable browser dependencies. |
| Catalogue and pending setup | Four [catalogue tests](../../convex/biddingTool.test.ts) and three [deferred-request tests](../../src/app/routes/_tool/tools/bidding/setupRequests.test.ts) pass. | Selected ruleset data, deleted records, reversed responses and edits made during a pending request. |
| Relay and deployment contracts | Seven files, 122 tests pass. The seven [native relay tests](../../workers/game/biddingTable.native.test.ts) passed again after the closing-socket attachment fix. | Real workerd restart and admission behavior; transport browser seams; publisher forwarding and deployment contracts. This is not 122 distinct relay tests. |
| Voice boundaries and assets | 11 tests across [voice commands](../../src/app/routes/_tool/tools/bidding/voiceCommands.test.ts), [pinned assets](../../scripts/bidding-voice-assets.test.ts) and [bundle policy](../../workers/publisher/bundle-assets.test.ts) pass. | Grammar, stale contexts, integrity and worker-only WASM policy. |
| Voice browser runtime | [Browser launch test](../../scripts/bidding-voice.browser.test.ts) passes with actual packaged WASM and fake microphone capture. A synthesized bid five reaches a real session as exactly one accepted bid of 5. | Production policy code, permission refusal before model loading, actual AudioWorklet capture, recognition, track release and offline restart in an already-loaded page. |
| Complete application flows | Both [bidding browser tests](../../e2e/bidding-table.spec.ts) pass with `E2E_COVERAGE=1`, 13.4 seconds for tablet-only and 51.5 seconds for remote recovery, 1.1 minutes overall. | Disposable local Convex fixture, real Worker WebSockets and real Chromium WebRTC. Coverage includes route, client, transport, session, recovery, auction and setup request code. |
| Compilation and lint | Typechecking, repository lint and format checks pass. The full React Compiler audit compiled 1,876 functions with zero diagnostics. Game Worker and publisher typechecks and scoped transport lint also pass. | The full checks preceded the final CSS and voice-test edits. Repeat them on the final reviewed revision; CI remains pending. |
| Production build | The local production build and dry run completed. | Commit the expected renderer manifest and complete final release verification. This is not a deployment or production smoke. |

The UI smoke used a 1024 by 768 central and a 390-pixel-wide remote. Both mirrored sheets measured
480 by 443.69 pixels. The remote +1 action measured 50 pixels high, and every visible remote button
was at least 44 pixels high. Reduced-motion mode produced no animations, and the creation, join,
assignment and Bid 1 flow produced no page errors. Full and Always pass responded to both track and
label taps in the earlier current-route check.

The local UI fixture could not load its published token artwork, so its screenshots establish
layout with fallback tokens. At 320 pixels, bid details can require scrolling inside the remote.
A final CSS correction removed the central display's inner overflow. Fresh real tables fit both
1024 by 768 and 1280 by 800 viewports, with matching client and scroll heights of 735 and 767 pixels
respectively. Both bars remain visible. These are desktop-browser observations, not physical-device
results.

The working-code reviews found and corrected the following holes:

| Finding | Correction and evidence |
| --- | --- |
| An old hand edit or faction claim could arrive for the first time after a later change. | Field and claim revisions reject stale first delivery, including Full and assignment changes that return to the same apparent value. The session suite covers these cases. |
| A late catalogue response could replace newer setup or manual hand edits. | Setup requests retain their request context. Three deferred-promise tests cover reversed ruleset responses, an old faction response and an intervening hand edit. |
| A disconnected old central tab could overwrite a newer local recovery record. | Commands, timers and queued saves check ownership. Browser locks serialize save and restore. Client tests cover generation changes, a different selected table and accepted revision retention. |
| A malformed paused copy could omit the bidder and resume another faction. | Semantic validation rejects missing bidder or starter, contradictory waiting states, invalid card progress, duplicate or future wins and incomplete assignment revisions. Recovery tests cover the new refusals. |
| Creation and a normal full-table join burst needed different limits. | Creation has a separate six-per-minute IP limit before forwarding. The central allowance accepts 24 simultaneous remote joins and 72 replies; a 25th remote is refused. Native and publisher tests pass. |
| A closed socket could remain in the runtime's list across hibernation. | Persist its closed state in the socket attachment instead of relying on an in-memory set. Restart tests pass; a hosted hibernation during the close has not been forced. |
| The quick increment was too small and route state bypassed the local-reducer decision. | The +1 button now measures 50 pixels high on the remote. Named reducers own the welcome and local view state, and the route compiler and scoped lint pass. |

## Pull request review follow-up

The first draft CI run passed the game Worker suite, 621 tests across 74 files with two skipped,
and found unused exports plus dynamic entries that Knip could not discover. The unused exports
were removed. Knip now names the pinned runtime adapters and the native fixture as entry points,
and its local check passes. Three affected-job graph tests also exposed missing support for Vite
worker-URL imports. The tracer now follows the underlying worker and its dependencies while
representing the imported URL correctly. Two behavioral fixtures cover both query-parameter
orders; all 103 graph and closure tests pass locally, including the three CI failures.

CodeQL also identified modulo bias in the 31-symbol join alphabet. Rejection sampling now
discards bytes 248 through 255 before mapping; a public-API test covers every accepted byte and
verifies equal symbol counts without changing the capability secrets.

The external review findings led to typed UI commands, simpler recovery comparisons and private
handlers for connection events, relay messages, chunks and worker audio messages. The generator
uses an absolute tar executable and a minimal environment. An isolated run with a hostile PATH
and TAR_OPTIONS reproduced its pinned output unchanged. The post-review Chromium journeys pass
with coverage collection, 15.2 seconds for tablet-only and 30.3 seconds for remote recovery.

The CodeScene findings were reviewed individually. Ordered protocol guards, one-page composition
and complete recovery journeys retain their existing owners where a size or complexity score did
not identify an independent responsibility. No external service exclusions or suppression settings
were changed. Sonar's vendored runtime findings concern intentional Emscripten control flow and
its virtual filesystem; the owned generator's PATH finding was fixed. CodeRabbit declined the
manual review because the shared free-review limit had been reached. The separate model reviews
remain the code and architecture review evidence.

The final lifecycle audit found that persistent recovery made the welcome screen unreachable
after joining or creating a table. Leave table returns to that existing screen, separately from
Reset and Next phase. It stops local input and connections without resetting the old auction or
deleting another device's copy. A new game starts with a new table code and fresh results.
Consumed QR join parameters must clear only after the matching recovery copy is saved, without
restarting the active client. A promoted phone then reloads its new table instead of the old QR
destination.
The nine focused suites now pass 80 tests, including 26 client tests. They cover retirement of
saved copies, cleanup retries, queued writes and confirmed persistence before URL cleanup. Browser
QA also revisits the same QR URL without a document reload, consumes it again, leaves and reloads
to the welcome screen. Near-side, far-side and phone confirmations reuse the existing sheets.

The actual development route exposed Vite rewriting dynamic imports of the pinned speech modules.
Absolute same-origin module URLs fix that path without changing CSP. The route accepted a
synthesized bid of five through microphone capture and WASM, then stopped listening. It requested
no voice assets before Listen and seven afterward. The production-built voice suite also passed.

## Remaining empirical questions

The following limits were exposed by research and review. They are part of playtest reporting,
not established compatibility or accuracy claims.

The physical playtest targets Safari on iPhone and iPad, and Chrome on Android. Manual controls
need the ordinary application browser capabilities. WebRTC is optional because the WebSocket
relay remains a fallback. Voice additionally needs secure microphone access, AudioWorklet and the
packaged WASM engine. Missing voice capability must leave manual play usable. Record exact tested
versions before publishing a broader browser-support claim.

| Question | Required evidence |
| --- | --- |
| Physical-device behavior | Record actual iPhone, iPad and Android hardware and browser versions; test backgrounding, screen lock, reloading and microphone interruption. |
| Direct connectivity | Try the devices on the same home network and a network with client isolation. The relay must remain usable. Same Wi-Fi does not guarantee a direct link. |
| Offline continuation | Separately test an already-open direct connection and a loaded listener. New joins need online introductions. There is no promise of an offline cold start or reload. |
| Room speech | Try supported commands, ordinary conversation, overlapping speech, accents and announcement playback. Record missed commands, wrong actions and latency. Generated speech is not real-table accuracy evidence. |
| Audio feedback | Confirm players can interrupt announcements without the speaker triggering commands through the microphone. Echo cancellation alone does not prove this. |
| Long sessions | Observe memory, heat, battery and responsiveness with voice on the least capable test device, including cache loss and storage failure. |
| Partitioned old central | A disconnected central cannot instantly learn that another connection replaced it. Once replacement is known it must stop. Phone promotion uses a fresh table identity so old traffic cannot mutate the recovered table. |

Physical trials have not been completed as of this document's initial audit. Automated browser
results must name their browser and fixture, and the production delivery report must retain any
unverified device or room-audio limits. Record newly discovered holes with their effect on the
contract and their test or fix; do not mark the map delivered while required implementation or
release work remains.
