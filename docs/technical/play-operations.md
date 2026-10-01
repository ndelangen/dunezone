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

`game-operation-failed` is the only Play application diagnostic
(`docs/technical/play-hosted.md:302-324`). The game Worker turns off invocation logs and keeps logs
at 100% sampling so these failure reports survive (`workers/game/wrangler.jsonc:11-16`). Each record
carries `operation`, `roomId` (the opaque Durable Object ID), `gitSha`, `errorKind`, `suppressed`
and `since` (`workers/game/diagnostics.ts:62-70`). The operation names are fixed
(`workers/game/diagnostics.ts:1-20`): `provision`, `confirmation`, `battle-alarm`, `directory`,
`fixture-deck`, `account-deletion`, `account-reconciliation`, `admission`, `authorization-watch`,
`authorization-renewal`, `message`, `socket-send`, `socket-error`, `authorization-close`,
`draft-catalogue`, `assignment`, `storage-sync`, `load` and `retire`. A room emits at most one
record per operation per 60 seconds, and the next one carries the count suppressed meanwhile. A
final suppressed count is never flushed, and the limit resets when the Durable Object is recreated.
Messages, stacks, identities and payloads are omitted, so the record locates the path and the
release; exception detail comes from reproducing locally.

Expected refusals, malformed requests and successful commands produce no record. A quiet log
therefore means no unexpected failure was reported, not that players are being served.

## 2. Release requirements

Play is healthy for release when all of these hold:

1. `/__play/health` on `https://dune.zone` answers 200 with `Cache-Control: no-store`, `ok: true`,
   and a `gitSha` and `workerVersionTag` equal to the merged commit, and a `workerVersionId` equal
   to the active Cloudflare deployment (`scripts/game-deployment-contract.ts:80-95`). The deploy
   smoke reads it up to 12 times, 5 seconds apart, and only the last read decides (`:97-147`).
2. `/__asset-publisher/health` reports the same commit, since the two Workers move together and the
   game Worker is never rolled back on its own (`docs/deployment.md:19-24`).
3. The game Worker passed its preflight and live contract: no workers.dev, preview or route ingress,
   one SQLite `GameRoom` namespace, and the exact checked-in configuration
   (`validateGameDeployContract` in `scripts/game-deployment-contract.ts`,
   `.github/workflows/deploy-main.yml:113-174`).
4. Convex `PLAY_SERVICE_URL` and `SITE_URL` are both `https://dune.zone`, and the test-only flags
   `IS_TEST`, `E2E_LOCAL_AUTH`, `PLAY_TEST_PHASE_COOLDOWN_MS` and `PLAY_TEST_START_STAGE` are off or
   unset in production (`docs/deployment.md:149-152`).
5. The deploy run for `main`'s tip finished green, and the commit is on `main` by ancestry, not by
   a merged badge (`docs/technical/operational-traps.md:143-158`).
6. `ci_ok` passed with the three `hosted_play` shards and `hosted_play_webgpu` on the merged change
   (`docs/deployment.md:171-211`).
7. No sustained `game-operation-failed` stream for the new `gitSha` in the game Worker's logs. No
   alert watches this yet (section 3), so it is read by hand after a deploy.

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

Email Routing owns the zone's mail records: MX `route1/2/3.mx.cloudflare.net`, SPF
`include:_spf.mx.cloudflare.net` and DKIM at `cf2024-1._domainkey`. The catch-all rule stays Drop,
so only addresses created on purpose receive mail.

Partly set up:

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
  path. The deploy contract and the live drift audit allow exactly that binding and that secret on
  the game Worker.

  Issue detection itself is per Worker and off by default. `observability.issues.enabled` in
  `workers/game/wrangler.jsonc` turns it on at every deploy; the dashboard's Enable issues toggle
  alone would be undone by the next `wrangler deploy`, and the deploy contract refuses a config
  without it. The live drift audit does not read the deployed observability settings, so a later
  dashboard toggle-off goes unnoticed until the next deploy. Issues is free during its open beta.
  Automations are per Worker too and only appear once detection is on: Workers & Pages >
  `dunezone-game` > Issues > Automations > Add automation, not the account-level Observability
  pages. Cloudflare requires a generic webhook to have a webhook secret or mTLS. The relay ignores
  it, so the value is any random string kept only in that automation, never a Worker secret or a
  repository value. Trigger on occurrence threshold; recurrence after inactivity can be a second
  trigger. To test, open any issue and send it to the automation's destination, which should
  produce one email.

  State (2026-10-01): `ALERT_EMAIL_TO` is set on `dunezone-game`. Detection turns on with the
  first deploy that carries the wrangler setting, and the automation is created after that.
- **Health Checks** against `/__play/health`. They need the Pro plan, and Norbert decided not to
  upgrade. The deploy smoke still reads that endpoint (section 2).

When an alert arrives, start from the matching case in section 4.

## 4. Symptom, first checks, recovery

### Health failing after a deploy

First checks: the `deploy` job's log for the `Smoke game Worker through the canonical publisher
binding` step, which prints each of its 12 reads and the last reason. Then whether the run's
`release_gate` deployed at all, and whether `Require active game Worker before binding publisher`
passed (`.github/workflows/deploy-main.yml:157-203`). A 502 `Game service unavailable` means the
binding answered with a redirect (`workers/publisher/index.ts:78-87`).

Recovery: if the smoke failed after both Workers went out, rerun that run. "Re-run failed jobs"
resumes at the failed job; "Re-run all jobs" deploys the same commit again from the start
(`docs/deployment.md:378-382`). If the cause is in the code, ship a fix forward. Do not recover by
rerunning an older run, which redeploys the older commit (`docs/deployment.md:373-376`).

If no run exists for the merge, follow "Recovering from a dropped push"
(`docs/deployment.md:341-382`): compare the publisher's reported `gitSha` with `main`, and dispatch
`deploy-main.yml` on `main` when they differ.

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
(`docs/technical/play-hosted.md:326-343`) and ship a fix forward. The repository has no switch that
pauses Play or one operation.

### A room stuck

First checks: `game-operation-failed` records for that room's `roomId`, especially `confirmation`,
`directory`, `battle-alarm` and `load`.

What recovers by itself:

- Provisioning confirmation re-arms its alarm before each request: 2 s within the provisioning
  window, 30 s after expiry to find a confirmation committed but lost
  (`confirmProvisioning` in `workers/game/index.ts`, `docs/technical/play-hosted.md:175-180`).
- Directory delivery retries on the room's alarm with backoff from 2 s up to 30 s, with no player
  connected; a refusal from Convex is terminal for that summary (`deliverDirectoryLoop` in
  `workers/game/index.ts`, `src/shared/play/directory.ts:15-16`). One alarm serves both the battle
  deadline and the directory retry (`scheduleAlarm`).
- A failed reconciliation retries with backoff (`reconcileAccounts` in `workers/game/index.ts`).
- A cold restore, including the one every deploy causes, closes old sockets with 1012 so browsers
  reconnect with a new ticket (the `GameRoom` constructor in `workers/game/index.ts`). Carries and
  pointers are lost by design; the table, receipts and history are kept
  (`docs/technical/play-hosted.md:28-33`).

What does not: a room whose stored game no longer loads is closed and answers only a retirement, and
its alarm throws so Cloudflare retries it a few times (the `GameRoom` load path and `alarm` in
`workers/game/index.ts`). Retirement accepts only the hosted fixture and refuses a real game
(`retire` in `workers/game/index.ts`). There is no operator procedure for a real game in that state;
a fix ships as a new release. Production rows are never edited by hand
(`docs/technical/play-hosted.md:297-300`).

### Asset publisher failing

First checks: `asset_publisher_cron` events with `result = failed`
(`workers/publisher/index.ts:219-228`), and `asset_delivery_failure` filtered by `assetId`
(`docs/deployment.md:101-121`). Open `/__jobs` as an administrator for the pickup switch and error
jobs (`docs/deployment.md:384-398`).

Recovery: follow "Post-deploy observation" (`docs/deployment.md:488-504`). The Cron does not retry a
failed invocation (`workers/publisher/index.ts:143`); the next one runs five minutes later. Turning
pickup off at `/__jobs` stops new leases but not leased work. Play depends on published faction and
deck assets: a real game refuses a faction until its faces are published and sets it aside with the
reason (`docs/technical/play-hosted.md:285-292`).

### Convex auth and authorization failures

First checks: `admission`, `authorization-watch`, `authorization-renewal` and
`account-reconciliation` records, and the Convex dashboard's function logs for `playAdmission`.
Confirm `PLAY_SERVICE_URL` and `SITE_URL` are `https://dune.zone` and the test flags are off
(`docs/deployment.md:149-152`).

Expected behaviour while Convex is unreachable: rooms suspend access rather than extend it. A
connection loses access by the lease or Auth expiry, whichever comes first, and any denial
withholds game data until a fresh reconciliation completes
(`docs/technical/play-hosted.md:120-163`). Players see a paused table, not stale access.

Recovery: none on the Worker side; access returns when Convex answers again. A hosted Convex
function that takes over 1 s fails where the local stack's 2 s limit passed it
(`docs/technical/play-hosted.md:345-349`), so a timeout seen only in production can be that.

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
(`scripts/deploy-decision.ts:29-53`). To undo a change, revert it on `main` and let the deploy run.

## 5. Known gaps

- Until issue detection is deployed and the Issues automation exists (section 3), no alert covers
  game Worker errors.
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
- No Play step in the post-deploy "Application smoke test" (`docs/deployment.md:506-514`), and no
  production synthetic game: real-game checks run only on isolated backends.
- The deletion backlog has no metric, count query or log line; it is visible only by reading the
  table.
- A real game whose stored state no longer loads has no recovery path short of a code fix.
- The final suppressed diagnostic count is never flushed, so totals are a lower bound.
- No kill switch for Play or for one operation.
- Capacity targets and load verification belong to
  [#1022](https://github.com/ndelangen/dunezone/issues/1022) and are not covered here.
