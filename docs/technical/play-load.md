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

`probe` uses six moving players, or two in the baseline. `peak` uses all 18 primary players.
Motion transmits at the existing 20 Hz cadence for pointers and carries. Separate work offers two
saved actions per second, alternating rotation and flip on the clear action piece. A preflight
checks command replay and durable-snapshot convergence. `reconnect` interrupts one connection,
then six, then all 44 for ten seconds each. Initial admission is paced; each reconnect group begins
at once and retains refusals and retry timing.
Ticket transport errors use the browser's one-second retry delay and remain in the report.
Every reconnect outcome is collected before cleanup, including failures.

## Bounds and evidence

Motion stops after 30 measured seconds or 128 MiB of aggregate application payload. A separate
240-second wall deadline bounds the runner; the parent also supervises it. The byte threshold
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
- The complete paced move, split, merge and draw trace, rotating active players and independent
  gestures from secondary tabs. Current smoke actions cover rotation, flip and replay only.
- The configurable steady-run warm-up and repetition matrix, with explicit budget approval for
  longer hosted runs. The current command supports bounded preparation probes only.
- The throttled-observer case and recovery observations.
- One actual player browser and one actual observer browser inside the 44-connection total,
  including frame, memory, long-task and cached/uncached image evidence.
- Handler, serialization, storage and authorization measurements beyond current delivery counters
  and local process totals.
- Review, full required checks, deployment verification where applicable, and linked evidence.

Private mechanics, real catalogue content and final device support remain the separate public
release requirements already named by the workload decision.
