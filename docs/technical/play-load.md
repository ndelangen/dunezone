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
and recipient delivery use the existing application path.

The runner itself accepts only explicit `http://127.0.0.1:PORT` origins. There is no remote flag.
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
correlated timing samples without credentials or complete game frames. Source sequence numbers
identify transmitted motion. One coordinator measures dispatch through recipient parsing and
projection application; its scheduling overhead remains in the result.
`source-state.json` preserves the tracked patch and untracked source text for new runs. Credentials
remain in the stack's private temporary directory and are not included. Warm-up and measured
latencies have separate distributions, and the last transmitted update's missing recipients stay
visible. Browser captures and frame samples remain diagnostic even when a byte stop interrupts play.

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
