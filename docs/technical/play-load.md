# Local multiplayer load preparation

[Prepare the isolated multiplayer load fixture](https://github.com/ndelangen/dunezone/issues/1105)
tracks this work. The [agreed workload](https://github.com/ndelangen/dunezone/issues/1022#issuecomment-5599029811)
is the acceptance contract. The spending cap is zero euros.

This runner prepares local protocol measurements. It does not establish hosted latency or complete
the preparation ticket. Hosted testing requires a verified isolated origin, Worker and Durable
Object namespace, and synthetic Convex/Auth backend that fit the spending cap.

## Run a bounded probe

```sh
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile baseline
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile separated --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --load-case peak --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --load-case reconnect --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --load-case trace --load-max-bytes 536870912 --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile separated --load-case trace --load-max-bytes 536870912 --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --load-case multitab --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile baseline --load-case slow --load-max-bytes 536870912 --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --load-case browser --load-max-bytes 536870912
```

Run these sequentially. Each invocation owns one temporary backend and one test game. The first
build creates local app assets; `--skip-build` is for protocol runs only, because those assets still
refer to the first invocation's backend. Browser measurements require a fresh build for their
backend. `--backend-binary /absolute/path/to/convex-local-backend` can use the pinned cached backend
instead of downloading it. The default download verifies its checksum.

The stack starts a disposable loopback backend with synthetic Password accounts. It deploys the
checked-out Convex code there and starts local Workers through the existing publisher service
binding. It imports no production snapshot, uses no hosted deployment credentials and never changes
the shared development deployment. Admission, authorization leases, command validation, persistence
and recipient delivery use the existing application path. The stack runs the production five minute
lease and 90 second renewal cadence, so a load run's `watchAuthorizations` and `reconcileAccounts`
traffic is about 0.7 calls a minute per function per connected room.

The runner requires Node 22.6 or later for the shared TypeScript update decoder. The parent enables
Node's type-stripping flag.

The runner accepts explicit `http://127.0.0.1:PORT` origins by default. The separate hosted preparation path below requires a private run file and a deployment-scoped key.
Synthetic fixture creation and provisioning also enforce the isolated-backend guard. A supplied
profile is server-selected provisioning metadata, never a browser-supplied seat or authority claim.
The browser case uses the ordinary hosted page and its directory query. A guarded internal test
control may create the canonical fixture key only when that route has never been used on the
disposable loopback backend. It refuses an existing fixture and cannot run against production.

## Fixture and workload

[`loadWorkload.json`](../../src/shared/play/loadWorkload.json) records the versioned workload.
The baseline keeps six pieces, 17 items and the original two player seats. Its smoke adds one
observer and one secondary player tab. It is not the expanded audience.

Both expanded arrangements have 18 distinct seated accounts, 20 observers and six secondary tabs.
The runner asserts distinct users and seats, observer roles and shared seats for secondary tabs.
Their 750 item identities are the same. The stacked arrangement has 294 pieces; the separated
arrangement has 750. The synthetic pieces occupy a dense area of the table, with a clear position
for the action piece. This layout is provisional and is not real catalogue or device acceptance.

The load profile allows 18 simultaneous carries. The baseline retains its 16-carry guard and both
retain the one-carry-per-connection guard. Reset restores the selected profile; restart retains its
configuration and saved contents. The live fixture is not selected or modified by these controls.

`probe` uses six moving players, or two in the baseline, rotating groups every ten seconds.
`peak` uses all 18 primary players. Motion transmits at the existing 20 Hz cadence for pointers and
carries. Delayed coordinator ticks are counted as coalesced synthetic inputs instead of causing a
catch-up burst. This counter does not measure a browser's own input coalescing.

Expanded normal runs offer two saved actions per second through a secondary protocol connection,
cycling a move, rotation, flip, token split, merge, deck draw and return of the drawn card. The
return keeps repeated cycles supplied. Preparation moves two action stacks into clear space; the
separated profile first merges two loose items of each kind through normal carry commands. The
initial fixture counts are checked before this setup. Baseline and peak runs retain rotation and
flip as their durable work. The peak keeps its full 18 carries without adding a nineteenth carry
for a saved move. Offered, accepted, rejected, failed and uncompleted scheduled actions are distinct.

`trace` runs two complete action cycles without background motion, checks item conservation and
compares every recipient's durable snapshot. `multitab` checks each secondary tab and its primary
tab independently carrying and cancelling. A preflight checks command replay and durable-snapshot
convergence. `reconnect` interrupts one connection,
then six, then all 44 for ten seconds each. Initial admission is paced; each reconnect group begins
at once and retains refusals and retry timing.
Ticket transport errors use the browser's one-second retry delay and remain in the report.
Every reconnect outcome is collected before cleanup, including failures.

`steady` selects the manifest's 60-second warm-up and five-minute measurement. Select one repetition
with `--load-repetition 1`, `2` or `3`; the default seed advances with the repetition, and
`--load-seed` records an explicit override. Run each profile and repetition separately. The default
128 MiB budget still applies, so selecting `steady` alone will usually stop during warm-up. Supply
an explicit `--load-max-bytes` budget for longer local work. No hosted budget is approved.

`slow` constrains one observer's game connection for 60 seconds through a loopback TCP proxy. The
proxy adds 250 ms in each direction and caps downlink wire bytes at 256 kbit/s, with pipelined delay
and a bounded queue. Wire bytes include WebSocket compression and differ from application-payload
bytes. It records buffering and checks the observer's durable revision and final carries after
restoration. It does not simulate packet loss or operating-system TCP retransmission behavior.

`browser` replaces one observer protocol connection and one secondary player tab with headless
Chromium pages, keeping the expanded total at 44. They sign in through the real local Auth page.
The observation hook reports after the real game message handler applies the received projection;
Playwright transport and instrumentation overhead remain in the timing. Frame intervals, long
tasks, memory, browser, viewport, host hardware and the actual WebGL renderer are recorded separately.
Software rendering is identified in the report and is not representative device acceptance.
Each browser records image loads after clearing its cache and on a repeat navigation with cache
enabled. Synthetic fixture image traffic does not represent final catalogue images.

## Bounds and evidence

The sizing probe stops after 30 measured seconds or 128 MiB of aggregate application payload. Its
byte limit cannot be overridden. Other cases accept an explicit positive byte limit. A separate
240-second wall deadline bounds short cases; steady runs have 480 seconds, including preparation.
The parent also supervises the runner. The byte threshold
terminates sockets. Frames already in flight can overshoot that threshold, and the report includes
that overshoot. This is a local stop mechanism, not a hosted billing guarantee.

Stop manually with Ctrl-C in the foreground stack process. Normal completion and interruption
terminate the owned Workers and backend, retire the fixture and remove the private temporary
storage. A forced process kill can interrupt cleanup. The console names the temporary local URLs,
and the worker log names its state directory; only the processes and directories belonging to
that invocation should be removed. Reports remain under a unique timestamped directory in
`test-results/play-load/`. Keep failed runs; subsequent invocations do not overwrite them.

Each report records the base Git revision, tracked diff digest, untracked-source digest, manifest
digest, seed, local origins, roles, admission attempts, checks, rejections, byte totals, recipient
message counts, missing observations and timing distributions. `observations.ndjson` contains
correlated timing samples without credentials or complete game frames. Raw rows stream to disk
with a 1 MiB queue limit; reaching it stops the run as incomplete. In-memory histograms report
quantiles in one-millisecond buckets and retain an exact maximum. Pending observations expire
after 30 seconds, count as missing and leave an expiry row in the raw file. At most 30,000
correlation records remain pending; reaching that bound also stops the run. The report names
these limits and any expired or dropped observations. Source sequence numbers
identify transmitted motion. One coordinator measures dispatch through recipient parsing and
projection application; its scheduling overhead remains in the result.
`source-state.json` preserves the tracked patch and untracked source text for new runs. Credentials
remain in the stack's private temporary directory and are not included. Warm-up and measured
latencies have separate distributions, and the last transmitted update's missing recipients stay
visible. Browser captures and frame samples remain diagnostic even when a byte stop interrupts play.

The compact transport coalesces movement for up to 50 ms and sends only changed activity fields.
Snapshots use revisioned patches after the client negotiates the compact format. Initial admission,
reconnection and a missing patch base use a full view; older pages retain the original format.
Saved changes and final drops are sent immediately. Authorization is checked again when each
queued broadcast sends. Movement timers stop when the room becomes idle.

Intermediate positions replaced by a newer observed sequence are recorded as
`supersededDeliveries`, with raw sequence evidence. They are separate from missing deliveries.
The latest sample from each source must still reach every expected recipient. Before rotating movers
or finishing, the runner waits up to five seconds for those observations before cancelling carries.
The report records each drain duration and outstanding recipients; a timeout fails the run. Rotation
drains pause motion input, and skipped scheduled input remains in `coalescedInputs`. Timing quantiles
cover observed samples and must be read alongside both counters.

The default `--load-compression on` requests standard WebSocket compression. Use
`--load-compression off` for an otherwise identical protocol comparison. Browser runs retain the
browser's negotiation and refuse the off option. Per-connection reports record the negotiated
extension and underlying TCP stream bytes, including the upgrade and WebSocket framing. These
exclude TCP/IP headers, retransmissions and browser connections. The original application-payload
counter remains the stop budget and counts decompressed message sizes. Compression savings must
come from those measured stream bytes, not from assuming a ratio for JSON.

`motionForwarded` counts accepted source updates. `activityDeliveries` counts actual activity
message sends, while the protocol recipients independently count messages and bytes. Socket send
counts alone do not prove recipient delivery. Local process CPU totals and resident memory are
recorded around motion; they include the local runtime processes and do not substitute for hosted
billing or isolate-level profiling.

A budget stop is `incomplete`, never a performance pass. Missing deliveries at that boundary stay
visible. Extrapolated traffic covers the two steady profiles and their warm-up and repetitions;
it excludes reconnect, slow-client, browser/image and diagnostic work. It is an estimate, not an
approved resource budget.

Cloudflare's Workers Paid subscription is per account. An additional test Worker does not require
another subscription. Workers has no bandwidth or egress charge. The six steady runs would send
about 518,400 motion messages, or 25,920 Durable Object request units at the documented 20:1 ratio.
One object active throughout their 2,160 seconds uses about 276.48 GB-seconds. Those figures exclude
setup, saved commands, reconnect, browser and diagnostic work. Compare them with remaining account
allowances, not just the advertised monthly totals. Convex usage is separate. See
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Remaining preparation

The ticket remains open. Before its measurement successor can run, it still needs:

- A verified hosted environment and enforceable resource bounds that fit the zero-euro cap.
- Hosted execution of the steady, reconnect and slow-observer matrix with explicit resource
  approval. The local runner's controls and smoke evidence do not establish hosted behavior.
- Handler, serialization, storage and authorization measurements beyond current delivery counters
  and local process totals.
- Review, full required checks, deployment verification where applicable, and linked evidence.

Private mechanics, real catalogue content and final device support remain the separate public
release requirements already named by the workload decision.

## Limits in an isolated game room

`workers/game/load-limits.fixture.ts` supplies a separate test entry around the real `GameRoom`.
The production entry does not import it. A generated isolated entry passes the same `LoadLimits`
to `BoundedLoadRoom` and `boundedLoadFetch`; the latter refuses every other game ID before looking
up a Durable Object. It still delegates accepted routes to the production Worker, including its
origin and provisioning checks. It introduces no admission or command bypass.

The limits name one game and a fixed start and expiry, no more than twenty minutes apart. They
allow at most 44 simultaneous sockets, 1,000 HTTP requests reaching the game object, 25,000 incoming WebSocket messages
and 8 MiB of incoming message data. A run can choose smaller limits. These are engineering
ceilings for the initial probe, not permission to run the full matrix or to spend beyond the
approved budget. The coordinator counts incoming and outgoing application messages toward its 128 MiB probe stop,
including hosted runs. The room independently enforces incoming-byte limits only.

The object stores its configuration and budget reservations in SQLite. It reserves up to 128
messages and 64 KiB of input at a time, while each HTTP request consumes one durable reservation.
Unused reservations are lost on restart, so a restart can stop a test earlier but cannot refill
its budget. `loadStatus()` reports reserved amounts, which can exceed actual received amounts;
the recipient and coordinator reports remain the source for actual traffic. The added reservation
reads and writes are test overhead and must be included when interpreting storage or CPU results.
A different configuration cannot replace the ledger of an existing game.

An in-memory deadline and a durable alarm stop the fixture even without another client message.
Per-request and per-message deadline checks also refuse expired work. HTTP body reads accept at
most 8 KiB and finish within three seconds, or the remaining run lifetime if shorter. The fixture
cancels an unfinished upload before delegating to the game handler, so a stalled client cannot
hold teardown open. An operation that finishes after stop receives HTTP 410.
It keeps the earlier provisioning-retry alarm while needed, then restores its own deadline. Stop first marks
the ledger, closes the authorization watch and sockets, and waits for outstanding reconciliation,
admission and provisioning work. It then removes the alarm and synthetic game records. One small
stopped ledger remains so subsequent requests or a restart cannot reopen the run. Removing the
isolated Worker and namespace remains the final storage cleanup; a cleanup error is surfaced and
can be retried through `stopLoad()`.

`load-controller.fixture.ts` adds a secret-protected controller for the fixed game at
`/__play/games/<gameId>/load-control`. GET reads its configuration, reservations, row counts and
alarm; DELETE stops it and returns the same evidence. Both require the separate 64-hex-character
`LOAD_CONTROL_SECRET`. The controller remains available after expiry, uses the application service
binding, and cannot select another game. Controller calls are trusted operator work outside the
fixture HTTP-request budget. Only the native test adapter exposes `/native-test/*`; never deploy it.

Run the boundary checks with:

```sh
bunx vitest run workers/game/load-limits.native.test.mjs
```

These use native workerd, SQLite and the real game class with a controlled Convex protocol peer.
They cover wrong targets, connection caps, budget stops, lost reservations on restart, expiry
without more input and cleanup during an outstanding confirmation. They supplement the real Auth
and 44-connection local probes; they do not establish hosted latency or a completed hosted smoke.

## Preparing a hosted probe

The hosted path supports only the 30-second expanded `probe`. It does not authorize steady,
reconnect or slow-observer runs. Those still need an approved resource estimate. Local runs retain
their loopback check, and production has no controller or hosted synthetic-auth switch.

`src/shared/play/loadTarget.ts` validates a target record containing `project`, `reference`,
`backendName`, `backendOrigin`, `applicationOrigin`, `gameWorker`, `namespaceId` and `sourceRevision`.
Names must belong to the dedicated load project and load-worker prefixes. Known production and
shared-development targets are rejected. Names alone do not prove ownership: before deployment,
read back the selected Convex project/deployment, Cloudflare service bindings and namespace, and
verify that the backend and namespace are empty. Stop if they are not. Record that readback with
the run, without credentials. Check current included allowances and the deployment's usage limits
before arming it; engineering limits do not establish a billing allowance.

Start from a clean reviewed commit. Generate a backend copy in a new private directory:

```sh
bun --no-env-file scripts/prepare-hosted-play.mjs backend \
  --target /private/target.json --directory /private/backend
```

The copy contains tracked Convex and shared code, with five changes recorded in `load-source.json`:
its synthetic guard binds the selected backend and application origin; Password Auth accepts only
38 fixed synthetic emails during the run; fixture creation refuses a second game; and its cron
registry is empty. Real hashing, sessions, JWTs, admission, authorization and commands remain in use.
No environment files or data are copied. Production source retains its loopback-only synthetic guard.
The additional guard and resource-ledger work must be included in the reported test overhead.

Mint a development deploy key using the full explicit project and deployment reference in a
sanitized environment. Save it to a private file and check its `dev:<backendName>|` prefix without
printing it. Use only that key to deploy the generated backend. Configure fresh Auth signing keys,
`IS_TEST=true`, `E2E_LOCAL_AUTH=true`, `SITE_URL` and `PLAY_SERVICE_URL` for the isolated application.
Do not arm `PLAY_LOAD_RUN` yet. It contains a random 32-hex-character `runId`, `startsAt` and
`expiresAt`, with a window of at most twenty minutes. Synthetic account emails are
`load-<0..37>-<runId>@example.invalid`; passwords contain 32 to 128 characters.

Build application assets with `VITE_CONVEX_URL` set to the isolated backend. Generate and upload
application assets using an already-expired run before creating the fixture. Then set the backend's
run window, create exactly one fixture through `playTesting:createFixture`, and generate the active
entries with its returned game ID:

```sh
bun --no-env-file scripts/prepare-hosted-play.mjs workers \
  --target /private/target.json --run /private/window.json \
  --game-id GAME_ID --assets /private/assets --directory /private/workers
bunx wrangler deploy --dry-run --config /private/workers/game.jsonc
bunx wrangler deploy --dry-run --config /private/workers/application.jsonc
```

The game entry has no public route. The application entry serves the actual built assets and passes
the fixed game's requests through the publisher's service binding and ingress limiter. It has no
publishing, image or production storage bindings. Asset responses restrict browser connections to
the selected synthetic backend and the application itself, so a mismatched bundle cannot contact
production. Both entries disable invocation logs and schedules,
and cap CPU at 1,000 ms per invocation. Deploy them with a fresh controller secret, verify their
bindings and source revision, and start the probe before the fixture's one-minute provisioning
lease expires. An expired lease is a failed preparation attempt; do not extend or silently retry it.

The private run file contains `{ target, run, game, profile, controlSecret }`; `game` is the complete
pending-provision response. Make it mode 0600. With only the isolated `CONVEX_DEPLOY_KEY` loaded:

```sh
node --experimental-strip-types scripts/play-load/run.mjs \
  --origin https://dunezone-play-load-RUN.ndelangen.workers.dev \
  --profile stacked --case probe --hosted-run /private/run.json \
  --report-dir /private/report
```

The runner attests the controller's game, backend, origin, source revision and deadline before Auth
or provisioning. It admits the real 18 player identities, 20 spectators and six additional player
tabs, applies the normal trace and terminates connections in cleanup. It retires the directory
fixture and calls DELETE on the controller, requiring zero remaining game rows and no alarm.
Namespace analytics supply hosted compute measurements; local CPU profiles are refused here.

For an interrupted coordinator, call the same controller DELETE with its secret from a private
header file. Keep that capability until the controller reports stopped, no alarm and zero game
rows. Then delete the dedicated application and game Workers through their generated configs,
delete the disposable Convex deployment, revoke the scoped key, and remove private credential files.
Verify resource deletion through the providers. A stopped ledger or expired Auth window is not final
storage cleanup. Retain reports, target/version readbacks, usage measurements and cleanup evidence
without secrets. A failed run stays in the evidence alongside any later approved attempt.

The copied backend can first be checked entirely on loopback:

```sh
bun --no-env-file scripts/verify-hosted-play-stack.ts \
  --load-profile stacked --load-hosted-backend --skip-build
```

## Local CPU profiles

Add `--load-cpu` to a local stack command to capture `game.cpuprofile` beside its report.
For example:

```sh
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile baseline --load-cpu --skip-build
bun --no-env-file scripts/verify-hosted-play-stack.ts --load-profile stacked --load-cpu --skip-build
```

This diagnostic requires `ps` and `lsof`. It discovers only loopback listeners belonging to
workerd descendants of the stack's Worker process, then requires exactly one synthetic game
Worker target. It does not attach to Wrangler's publisher debugger or accept a remote inspector
URL. The socket has a 32 MiB response limit and debugger commands time out after ten seconds.
A requested profile that cannot be captured makes the run fail and retains its error.

Recording starts after admission and the initial metrics read, and ends after the workload,
including its final metrics read. Initial signup and admission are outside that window. The
report includes the target identity, recording duration, sample counts per frame and sample gaps.
The raw profile preserves call stacks for inspection with DevTools.

These are diagnostic samples, not per-handler CPU durations. In the first local baseline,
495 samples over 31 seconds had a median gap near 49 ms and a maximum gap above one second.
Assigning those gaps to a frame as CPU milliseconds would misrepresent time while the isolate
was yielding. The summary therefore ranks frames by sample count. Keep profiled repetitions
separate from responsiveness measurements because debugger overhead can change the result.

Cloudflare documents [local CPU profiling](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/)
and the [timer restrictions in deployed Workers](https://developers.cloudflare.com/workers/runtime-apis/performance/).
The [V8 profiler format](https://chromedevtools.github.io/devtools-protocol/v8/Profiler/#type-Profile)
defines sample gaps as elapsed intervals. This capture does not replace the outstanding exact
handler/serialization timings, storage accounting, authorization-call/error measurements or
hosted resource-use evidence.
