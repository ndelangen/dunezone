# Play operations

Monitoring and recovery requirements for the multiplayer Play module, recorded for the
public-release decision ([#1094](https://github.com/ndelangen/dunezone/issues/1094)). Everything
here describes what the repository already does. Where something is not built, section 5 says so
rather than describing a tool that does not exist.

## 1. What is monitored today

- `GET /__play/health`, at `https://dune.zone/__play/health`, read by `release_gate` and the deploy
  smoke. The game Worker answers through the publisher binding and reports `gitSha`,
  `workerVersionId` and `workerVersionTag`.
- `GET /__asset-publisher/health`, at `https://dune.zone/__asset-publisher/health`, same readers.
  The publisher answers with its identity, `maxItems`, schedule and Renderer identity.
- `game-operation-failed`, in Cloudflare Workers Logs for `dunezone-game`. An unexpected failure in
  one named operation of one room.
- `asset_publisher_cron`, in Workers Logs for the publisher. One Cron invocation's `result`
  (`empty`, `completed` or `failed`), with `reason = disabled` when pickup is off.
- `asset_delivery_failure`, in Workers Logs for the publisher. A public asset read or cache step
  failed.
- The `deploy-main.yml` run status in GitHub Actions. Whether the last merge reached production.
- The `hosted-play-daily` issue. A red run of `.github/workflows/hosted-play-daily.yml`, which runs
  the hosted play shards on `main` once a day, opens one issue with that label or comments on the
  open one.
- Cloudflare's aggregate runtime metrics in its dashboard: requests, errors and CPU, independent of
  logs.
- Convex function logs in the dashboard for `exuberant-finch-263`: failures in the `playAdmission`,
  `playDeletion`, `playProvisioning` and `playDirectory` functions.

The two health endpoints are identity checks. `/__play/health` returns a fixed `ok: true` with the
release identity (`/__play/health` in the default export of `workers/game/index.ts`) without
touching a Durable Object or Convex. The publisher's endpoint is the same kind of answer
(`workers/publisher/index.ts:123-135`). A green health read proves which release is live and that
the binding routes, not that a game works. The publisher exempts the exact GET health path from the
Play ingress rate limit (`workers/publisher/index.ts:49-51`).

`game-operation-failed` reports unexpected failures in GameRoom and HomepageRoom. Invocation logs
remain off and application logs retain 100% sampling. Each report includes the opaque `roomId`,
`roomClass`, `gitSha`, `workerVersionId`, current `revision` when loaded, connection count and
`uptimeMs` since this object instance started. Uptime restarts after deployment, eviction or
hibernation; a low value alone does not prove that a deployment caused a failure.

The fixed operation names live in `workers/game/diagnostics.ts`. Reports include `errorKind`, a
safe `failureCategory`, `suppressed` and `since`. Convex transport failures distinguish HTTP
status, timeout, abort and network failure, with request duration. Invalid parsed responses get
an `invalid-response` category. The exact Cloudflare storage-reset message yields only its opaque
`storageReference`; boolean `retryable`, `overloaded` and `remote` flags are retained when present.
Unknown errors remain `exception` or `unknown`. Messages, stacks, tickets, account identities,
SQL values and response bodies are never copied into these application records.

A room emits at most one failure per operation per minute. Reconciliation, confirmation,
directory delivery, authorization renewal and homepage admission/refresh/message handling also
report `game-operation-recovered` when a subsequent attempt succeeds. A recovery includes
`failures` since the first failed attempt and `outageMs`. Healthy operations emit nothing.
Recoveries are independently limited to one per operation per minute, so a flapping dependency
cannot bypass the failure limit. These counters live in memory and do not cross an object restart;
absence of a recovery record does not prove a continuing outage. The failure limit also stays in
place across recovery, and its next failure record includes suppressed failures from earlier attempts.

Unexpected homepage failures retain their existing propagation or handling. Expected game
refusals and malformed client messages remain quiet. A quiet log means no unexpected failure was
reported, not that players are being served.

### Tracing and the initial baseline

Source maps and Cloudflare Issues remain enabled. URL query strings are redacted from logs and
traces. Automatic tracing stays disabled because Cloudflare includes
`cloudflare.durable_object.query.bindings` in SQL spans, and GameRoom writes private state and
room secrets as SQL parameters. The current Wrangler schema provides URL-query redaction but no
SQL-value filter. Do not enable automatic tracing until those values can be excluded before
persistence. See [Cloudflare's span attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/).

The October 4 dashboard reading showed 83,000 account-wide events over 30 days, including 9,400
for dunezone-game. This predates these diagnostics and the latest homepage traffic, so it is a
comparison baseline, not a measured forecast. This change adds no success-path logs, tracing
spans, timers, storage writes or external monitoring service. At most one failure and one recovery
per operation per room per minute are emitted; a fleet of rooms can still produce substantial volume.

At the next check, record the elapsed hours and deployment SHA, compare account-wide and game
Worker event totals, and inspect each failure's category, duration, room uptime and recovery.
Correlate `gitSha`/`workerVersionId` with deployment times. The October 4 account-reconciliation
issue had fingerprint `70e2104d16cb4a01d1e138edfcf95148`; the homepage storage-reset issue had
fingerprint `4205c6a6b814c422ac77011aa169ae33` and reference `5oamf4t48n2la7egi58douuu`.
This release collects evidence; it does not claim to fix either failure.

## 2. Release requirements

Play is healthy for release when all of these hold:

1. `/__play/health` on `https://dune.zone` answers 200 with `Cache-Control: no-store`, `ok: true`,
   and a `gitSha` and `workerVersionTag` equal to the merged commit, and a `workerVersionId` equal
   to the active Cloudflare deployment (`scripts/game-deployment-contract.ts:92-107`). The deploy
   smoke reads it up to 12 times, 5 seconds apart, and only the last read decides (`:109-159`).
2. `/__asset-publisher/health` reports the same commit, since the two Workers move together and the
   game Worker is never rolled back on its own (`docs/deployment.md:19-24`).
3. The game Worker passed its preflight and live contract: no workers.dev, preview or route ingress,
   one SQLite `GameRoom` namespace, the `ALERT_EMAIL` binding, and the exact checked-in configuration
   (`validateGameDeployContract` in `scripts/game-deployment-contract.ts`, `auditGameWorker` in
   `scripts/cloudflare-game-drift.ts`, and the `Preflight private game Worker release` and
   `Require active game Worker before binding publisher` steps of `.github/workflows/deploy-main.yml`).
4. Convex `PLAY_SERVICE_URL` and `SITE_URL` are both `https://dune.zone`, and the test-only flags
   `IS_TEST`, `E2E_LOCAL_AUTH`, `PLAY_TEST_PHASE_COOLDOWN_MS`, `PLAY_TEST_START_STAGE` and
   `PLAY_TEST_PASSWORD_HASH` are off or unset in production (`docs/deployment.md:164-167`).
5. The deploy run for `main`'s tip finished green, and the commit is on `main` by ancestry, not by
   a merged badge (`docs/technical/operational-traps.md:143-158`).
6. The hosted play flows passed on the merged tree: `ci_ok` with the three `hosted_play` shards and
   `hosted_play_webgpu` on a pull request whose diff reaches the hosted closure, or else the daily
   `hosted-play-daily.yml` run on `main` (`docs/deployment.md:186-231`).
7. No sustained `game-operation-failed` stream for the new `gitSha` in the game Worker's logs. The
   Worker-error alert (section 3) emails when an issue appears; read the logs after a deploy anyway,
   since one email covers ten minutes.

## 3. Alert routing

Decided by Norbert on 2026-10-01: alerts are email from Cloudflare. Cloudflare Email Routing (free)
forwards `alerting@dune.zone` to Norbert's personal inbox, and Play alerts are addressed to
`alerting@dune.zone`, so the recipient can change in one place. Alerts are configured in the
Cloudflare dashboard; the only alerting code in the repository is the relay described below.

Live since 2026-10-01:

- **dune.zone origin unreachable** (Traffic Monitoring: Passive Origin Monitoring), for the
  dune.zone zone: Cloudflare's alert when Cloudflare cannot reach an origin. A test notification
  reached `alerting@dune.zone`. dune.zone is served by Workers, so this alert does not fire on
  Worker exceptions and covers little of Play.

- **Worker errors, through the alert relay.** Workers Issues captures uncaught exceptions, failed
  invocations, 5xx responses and `console.error` output, including `game-operation-failed`, but
  delivers only through Automations (coding agent, generic webhook, chat, incident management),
  not email. The game Worker therefore relays it (`workers/game/alerts.ts`): an Issues automation
  with a generic webhook posts to `https://dune.zone/__play/alerts/issues`, which the publisher
  forwards like any `/__play` path, and the game Worker emails from `alerting@dune.zone` through
  the `ALERT_EMAIL` Email Routing binding. Sending to a verified destination is free on every
  plan. The route takes no credential, so the email carries nothing from the request: it only says
  an issue was reported and to open the Worker's Issues page in the dashboard. The interval guard
  holds one email per ten minutes within each Cloudflare location and isolate, not globally: callers
  reaching several locations can each cause one, so an unexpected burst means someone is calling the
  route, and the dashboard shows whether a real issue exists. A failed send is logged as a
  `console.warn` `alert-email-failed` and still answered 202, so it cannot feed itself back as a new
  issue faster than the interval. The one Worker secret, `ALERT_EMAIL_TO`, holds the destination so
  the address stays out of the repository; until it is set the route is refused like any unknown
  path. The deploy contract requires exactly that `send_email` binding. The live drift audit, which
  also runs in the deploy's `Require active game Worker before binding publisher` step, requires
  the binding too and allows `ALERT_EMAIL_TO` as the game Worker's only secret; only the secret may
  be missing, since it is set by hand (`checkBindings` in `scripts/cloudflare-game-drift.ts`). An
  isolate that finds another isolate's marker in the cache gives its own claim back, so a marker
  never stretches the interval past ten minutes (`alreadySent` in `workers/game/alerts.ts`).

  Issue detection itself is per Worker and off by default. `observability.issues.enabled` in
  `workers/game/wrangler.jsonc` turns it on at every deploy; the dashboard's Enable issues toggle
  alone would be undone by the next `wrangler deploy`, and the deploy contract refuses a config
  without it. The live drift audit does not read the deployed observability settings, so a later
  dashboard toggle-off goes unnoticed until the next deploy. Issues is free during its open beta.
  Automations are per Worker too and only appear once detection is on: Workers & Pages >
  `dunezone-game` > Issues > Automations > Add automation, not the account-level Observability
  pages. The generic webhook form offers an optional webhook secret; the relay ignores it, so leave
  it empty or set any random string kept only in that automation, never a Worker secret or a
  repository value. Trigger on occurrence threshold; recurrence after inactivity can be a second
  trigger.

  To prove the email path without a real error, send the request the automation would send:
  `curl -i -X POST https://dune.zone/__play/alerts/issues`. A `202` answer and one email at the
  alert inbox within a minute mean the publisher forwarding, the game Worker route, the secret and
  the Email Routing binding all work. A `404` means `ALERT_EMAIL_TO` is unset. A second call
  within ten minutes from the same location answers `202` without an email, which is the interval
  guard, not a failure; it also means a real issue in that window sends no email, so test when
  nothing is being watched. A `429` is the publisher's per-IP limit on `/__play` requests; retry
  after ten seconds. Look for `alert-email-failed` in the game Worker's logs when no email
  arrives after a `202`. The automation itself can only be tested by a real issue.

  State (2026-10-01): `ALERT_EMAIL_TO` is set on `dunezone-game`, and detection is on since
  deploy run 36937790739. Setting the secret in the dashboard blocked strict deploys until that run
  (`docs/deployment.md`, "Recovering from a dashboard edit"), so avoid dashboard edits to this
  Worker. The automation "Email alert relay" fires when an issue occurs once and posts to the route
  above, with no webhook secret.
- **Health Checks** against `/__play/health`. They need the Pro plan, and Norbert decided not to
  upgrade. The deploy smoke still reads that endpoint (section 2).

Email Routing owns the zone's mail records: MX `route1/2/3.mx.cloudflare.net`, SPF
`include:_spf.mx.cloudflare.net` and DKIM at `cf2024-1._domainkey`. The catch-all rule stays Drop,
so only addresses created on purpose receive mail.

When an alert arrives, start from the matching case in section 4.

## 4. Symptom, first checks, recovery

### Health failing after a deploy

First checks: the `deploy` job's log for the `Smoke game Worker through the canonical publisher
binding` step, which prints each of its 12 reads and the last reason. Then whether the run's
`release_gate` deployed at all, and whether `Require active game Worker before binding publisher`
passed (`.github/workflows/deploy-main.yml`). A 502 `Game service unavailable` means the
binding answered with a redirect (`workers/publisher/index.ts:78-87`).

What players see: a table whose socket closes before its first view, or whose ticket request fails,
reads "The table could not be reached. Reconnecting..." and keeps that line through every retry
until a view arrives; a ticket the game turns away reads "The table is temporarily unavailable."
A socket that drops after the table has shown reconnects without keeping a failure line, so a
deploy's cold restart does not read as an outage (`retryAfterFailure` in
`src/app/routes/_app/play/multiplayer/GameSubscription.ts`).

Recovery: if the smoke failed after both Workers went out, rerun that run. "Re-run failed jobs"
resumes at the failed job; "Re-run all jobs" deploys the same commit again from the start
(`docs/deployment.md:403-408`). If the cause is in the code, ship a fix forward. Do not recover by
rerunning an older run, which redeploys the older commit (`docs/deployment.md:398-401`).

If no run exists for the merge, follow "Recovering from a dropped push"
(`docs/deployment.md:365-419`): compare the publisher's reported `gitSha` with `main`, and dispatch
`deploy-main.yml` on `main` when they differ. If every push run fails at `Deploy exact game Worker
release` after a dashboard change to `dunezone-game`, follow "Recovering from a dashboard edit to
`dunezone-game`" (`docs/deployment.md:421-447`).

### Spike in `game-operation-failed` for one operation

First checks: in Workers Logs, group by `operation` and `gitSha`. A spike that starts with a new
`gitSha` points at that release. Many `roomId` values point at a shared dependency; one `roomId`
points at one room. Sum `suppressed` to estimate volume, remembering it is a lower bound.

Operation to likely dependency, from the call sites in `workers/game/index.ts` and
`workers/game/authorization.ts`:

- `confirmation`, `directory`, `account-reconciliation`, `admission`, `authorization-watch`,
  `authorization-renewal`, `account-deletion`: a request to Convex failed.
- `draft-catalogue`, `fixture-deck`: a catalogue capture failed.
- `socket-send`, `socket-error`, `message`: socket transport or command processing.
- `storage-sync`, `load`: the room's SQLite storage. `load` means the stored game no longer opens.

Recovery: reproduce locally with `bun run game:test` or `scripts/verify-hosted-play-stack.ts`
(`docs/technical/play-hosted.md:361-378`) and ship a fix forward. The repository has no switch that
pauses Play or one operation.

### A room stuck

First checks: `game-operation-failed` records for that room's `roomId`, especially `confirmation`,
`directory`, `battle-alarm` and `load`.

What recovers by itself:

- Provisioning confirmation re-arms its alarm before each request: 2 s within the provisioning
  window, 30 s after expiry to find a confirmation committed but lost
  (`confirmProvisioning` in `workers/game/index.ts`, `docs/technical/play-hosted.md:209-214`).
- Directory delivery retries on the room's alarm with backoff from 2 s up to 30 s, with no player
  connected; a refusal from Convex is terminal for that summary (`deliverDirectoryLoop` in
  `workers/game/index.ts`, `src/shared/play/directory.ts:15-16`). One alarm serves both the battle
  deadline and the directory retry (`scheduleAlarm`).
- A failed reconciliation retries with backoff (`reconcileAccounts` in `workers/game/index.ts`).
- A cold restore, including the one every deploy causes, closes old sockets with 1012 so browsers
  reconnect with a new ticket (the `GameRoom` constructor in `workers/game/index.ts`). Carries and
  pointers are lost by design; the table, receipts and history are kept
  (`docs/technical/play-hosted.md:30-35`).

What does not: a room whose stored game no longer loads is closed and answers only a retirement, and
its alarm throws so Cloudflare retries it a few times (the `GameRoom` load path and `alarm` in
`workers/game/index.ts`). Retirement accepts only the hosted fixture and refuses a real game
(`retire` in `workers/game/index.ts`). There is no operator procedure for a real game in that state;
a fix ships as a new release. Production rows are never edited by hand
(`docs/technical/play-hosted.md:332-335`).

### Asset publisher failing

First checks: `asset_publisher_cron` events with `result = failed`
(`workers/publisher/index.ts:219-228`), and `asset_delivery_failure` filtered by `assetId`
(`docs/deployment.md:110-130`). Open `/__jobs` as an administrator for the pickup switch and error
jobs (`docs/deployment.md:449-463`).

Recovery: follow "Post-deploy observation" (`docs/deployment.md`). The Cron does not retry a
failed invocation (`workers/publisher/index.ts:143`); the next one runs five minutes later. Turning
pickup off at `/__jobs` stops new leases but not leased work. Play depends on published faction and
deck assets: a real game refuses a faction until its faces are published and sets it aside with the
reason (`docs/technical/play-hosted.md:320-327`).

### Convex auth and authorization failures

First checks: `admission`, `authorization-watch`, `authorization-renewal` and
`account-reconciliation` records, and the Convex dashboard's function logs for `playAdmission`.
Confirm `PLAY_SERVICE_URL` and `SITE_URL` are `https://dune.zone` and the test flags are off
(`docs/deployment.md:164-167`).

Expected behaviour while Convex is unreachable: rooms suspend access rather than extend it. A
connection loses access by the lease or Auth expiry, whichever comes first, and any denial
withholds game data until a fresh reconciliation completes
(`docs/technical/play-hosted.md:145-188`). Players see a paused table, not stale access. A Play
page whose first Convex query has had no answer for 10 seconds, the lobby, the create page or a
game link, says "Can't reach the server. Retrying..." in place of its loading line and keeps its
way out; Convex keeps retrying, and the page fills in when it answers
(`src/app/routes/_app/play/useServerUnreachable.ts`).

Recovery: none on the Worker side; access returns when Convex answers again. A hosted Convex
function that takes over 1 s fails where the local stack's 2 s limit passed it
(`docs/technical/play-hosted.md:380-384`), so a timeout seen only in production can be that.

### Account-deletion acknowledgement backlog

How it works: each deletion queues one `play_account_deletions` row per game, `pending` until the
room acknowledges it after its SQLite change (`convex/playDeletion.ts:15-38`,
`convex/playAdmission.ts:282-303`). Each claim backs off from 1 s up to 300 s
(`convex/playDeletion.ts:86`), and a one-minute Cron reschedules up to 32 due rows
(`convex/crons.ts:6`, `convex/playDeletion.ts:122-135`). A game not in state `ready` waits out the
same backoff.

First checks: `account-deletion` records in the game Worker's logs. For the Convex side, the
`play_account_deletions` table in the Convex dashboard: rows with `state = pending`, their
`attempts` and `next_attempt_at`. The `deliver` action discards delivery errors without logging
(`convex/playDeletion.ts:110-116`), so the table is the only Convex-side view.

Recovery: delivery retries on its own once the room and Convex answer. A room that cannot load
cannot acknowledge (see "A room stuck"). For the retired hosted fixture, `retireFixtureRoom` gives
up after 17 attempts with a logged error, and its comment says running it again from attempt 0
resumes (`convex/playDeletion.ts:168-199`). The repository does not document the command to do so.

### Rollback

There is no rollback procedure. Fixes ship as new forward deployments, and the game Worker is never
rolled back or redeployed to an older release on its own, because a page and a game Worker from
different releases can refuse each other's messages (`docs/deployment.md:19-24`). `release_gate`
stops any run whose commit is older than what production reports
(`scripts/deploy-decision.ts:39-71`). To undo a change, revert it on `main` and let the deploy run.

## 5. Known gaps

- Only the game Worker has issue detection. The publisher would need its own setting and
  automation.
- The relay runs in the game Worker behind the publisher, so an outage of either silences Worker
  error alerts; the email says only that an issue exists, and the dashboard has the detail.
- Alert thresholds are Cloudflare's defaults; nothing in the repository defines what rate of
  `game-operation-failed` per operation is abnormal.
- The alerts live in the Cloudflare account, not the repository, so a change to them is not
  reviewed.
- No saved Workers Logs query or dashboard is checked into the repository; the filters above are
  described, not stored. Log retention for either Worker is not stated in the repository.
- `/__play/health` is static and says nothing about Durable Objects, SQLite or Convex reachability.
- No Play step in the post-deploy "Application smoke test" (`docs/deployment.md`), and no
  production synthetic game: real-game checks run only on isolated backends.
- The deletion backlog has no metric, count query or log line; it is visible only by reading the
  table.
- A real game whose stored state no longer loads has no recovery path short of a code fix.
- Final suppressed failure counts are not flushed. Recovery records count their own outage, but are also rate limited and lost on restart, so logs are not a complete error census.
- No kill switch for Play or for one operation.
- Capacity targets and load verification belong to
  [#1022](https://github.com/ndelangen/dunezone/issues/1022) and are not covered here.
