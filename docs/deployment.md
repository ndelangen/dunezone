# Deployment

## Production release contract

The production Convex project slug is `dunezone` (display name `dune.zone`) and its
production deployment is `exuberant-finch-263`. Renaming the project slug does not
change its `.convex.cloud` or `.convex.site` URLs, but does require rotating
`CONVEX_DEPLOY_KEY` wherever that key is used.

The scheduled publisher has one simple execution model:

- Convex stores durable Publication jobs and the current public asset records.
- Cloudflare R2 stores one current object per published asset.
- One `*/5 * * * *` Worker Cron leases at most twenty pending jobs.
- The Worker always uses the one Renderer in the deployed release.
- A Renderer revision increase only enqueues recaptures for that asset type.
- The `/__jobs` administrator route controls whether future jobs may be picked up.

There is no Renderer selection, rollout state machine, deployment pause, or rollback
procedure. Fixes ship as new forward deployments.

Cloudflare Workers is the only frontend host. The checked-in Worker configuration
attaches the exact Custom Domain `dune.zone`; Cloudflare manages its DNS record and
TLS certificate. After the release smoke, CI sets the production Convex Auth
`SITE_URL` to `https://dune.zone`.

## Build process

**Build configuration**: [`vite.config.ts`](../vite.config.ts)

- SPA mode enabled: `spa: { enabled: true }`
- Assets directory: `public`
- Public directory: `public`

Build the unified application and capture release with:

```bash
VITE_CONVEX_URL=https://exuberant-finch-263.eu-west-1.convex.cloud bun run publisher:assets
```

This builds `dist/client`, builds the isolated capture bundle, and assembles both into
`workers/publisher/dist`. The assembly also copies TanStack's `_shell.html` to the
`index.html` Cloudflare Static Assets requires for SPA fallback and fails if the
final bundle violates Workers asset-count or per-file limits.

Storybook is a separate secret-free Static Assets Worker at `https://storybook.dune.zone`.
`bun run verify:storybook-publication` builds `storybook-static`, scans the final bytes for
credentials and hosted Convex URLs, checks the CSP and exact hosting configuration, and runs the
browser-local Convex page through both the root host and a non-root served path. The build copies
the canonical `public/` files; there is no second maintained image or font source.

For a local release rehearsal:

```bash
VITE_CONVEX_URL=https://exuberant-finch-263.eu-west-1.convex.cloud bun run publisher:dry-run
```

CI uses `bun run publisher:release:dry-run` after verifying the already-built
assets. Pull-request CI builds the same production-URL release on Linux and rejects
Renderer manifest drift.

## Routing and ownership

Cloudflare Static Assets uses `not_found_handling:
"single-page-application"`. Requests are asset-first by default. These namespaces
are Worker-first:

| Namespace | Owner |
| --- | --- |
| `/published` and `/published/*` | Current public generated-asset delivery by stable pathname |
| `/__asset-publisher` and `/__asset-publisher/*` | Health and operational endpoints |
| `/publisher-capture`, `/publisher-capture.html`, `/publisher-capture/*` | Protected capture document and bundle |
| `/__play` and `/__play/*` | Canonical-host-only forwarding to the private game Worker |
| Everything else, including `/factions/*` | Static asset lookup, then SPA fallback |

Faction sheets use `/published/factions/<Convex faction id>/sheet.pdf`. Rulebook
HTML uses a permanent Edition path under `/published/rulebooks/<Convex rulebook
id>/editions/` and a revalidated latest-ready path beside it. The `/published`
prefix avoids collisions with user-facing slug routes.

Generic generated assets are selected by pathname only. Any query string, including
bare, empty, repeated, arbitrary, or legacy signed `v` values, serves the same
current file. The Worker keeps a query-independent internal cache, checks the stable
R2 object's current ETag before reuse, and sends browsers `Cache-Control: no-cache`
with ETag validators. This generic contract does not change immutable Rulebook
Edition HTML/PDF delivery or its latest-ready resolver.

### Hosted gameplay

The publisher forwards the reserved `/__play` namespace only when the request origin equals
`PUBLIC_BASE_URL`. Its `GAME_SERVICE` binding targets `dunezone-game`, whose `workers_dev` and
`preview_urls` are disabled and whose route list is empty. Unknown reserved paths never become
SPA documents. The game Worker accepts only `/__play/health` and
`/__play/games/:gameId/socket|provision|account-deletion`; it validates methods, origin and admission
at that boundary. The public `/play/demo` remains local-only. Hosted gameplay requires a signed-in
session and a fresh first-message connection ticket.

Before calling the game binding, the publisher applies `PLAY_INGRESS_RATE_LIMIT` (namespace
`10960001`): 120 requests per ten seconds per trusted `CF-Connecting-IP`, with separate counters
for connection requests and provisioning/deletion callbacks. Rotating game IDs does not change
the key. The exact GET health endpoint is exempt. A refused request returns `429`, `Retry-After: 10`
and `Cache-Control: no-store` without resolving a Durable Object. This is Cloudflare's per-location,
eventually consistent ingress protection, not an exact global quota; authenticated ticket and
in-room limits are separate.

`workers/game/wrangler.jsonc` owns the `GAME_ROOMS` binding and its initial `GameRoom` SQLite
migration. The publisher owns neither game storage nor a Durable Object class. The game Worker has
three nonsecret variables: the fixed `CONVEX_URL`, `APPLICATION_ORIGIN`, and deployed `GIT_SHA`.
`CF_VERSION_METADATA` supplies the active Worker identity. Per-game secrets are provisioned through
the game protocol; no deployment bootstrap secret is installed on the game Worker.
Convex's nonsecret `PLAY_SERVICE_URL` must equal its `SITE_URL` origin, `https://dune.zone`. CI sets
the callback origin after verifying the private game Worker and before exposing the hosted frontend.
The test-only `IS_TEST` and `E2E_LOCAL_AUTH` flags must remain disabled in production.

For an isolated rehearsal against an already provisioned synthetic Convex/Auth backend:

```bash
bun run play:local --convex-url http://127.0.0.1:56823 --convex-site-url http://127.0.0.1:56824 --port 8787
```

Set that backend's `SITE_URL` and `PLAY_SERVICE_URL` to `http://127.0.0.1:8787` and enable its existing
test-only local Auth configuration first. The runner does not import production data, create users
or provision a game. It builds the real app with local Auth, starts the publisher and game Worker
in one local Wrangler session, and routes the browser through the actual service binding. Worker
names, R2 buckets and persistence are unique to the session and removed on exit. Both backend
arguments must be explicit loopback origins. `--game-convex-url` can select a separate loopback
failure-injection proxy without changing the frontend backend. `--skip-build` reuses an existing
publisher asset build; use it only when that build already has the same local backend and Auth settings.

The `hosted_play` CI job runs `bun --no-env-file scripts/verify-hosted-play-stack.ts`. It verifies the
checksum of the pinned native Convex backend release, creates a fresh database, configures real
local Auth, builds the app, then runs `scripts/verify-hosted-play.mjs` through both actual Workers.
No hosted deployment credentials or production snapshots are used. Its generated private keys,
admin key, SQLite database and local Worker persistence are removed on exit; only the Worker and
verification logs are retained as artifacts. The same command runs locally on supported platforms.
For a protocol-only local rehearsal, `--backend-binary` can select an existing native executable and
`--skip-build` can reuse the publisher bundle; that shortcut does not verify the bundle's frontend backend URL.

## Environment variables

Set as secrets on the GitHub `production` environment (deployment branch policy:
`main` only, so no other ref can receive them):

- `CONVEX_DEPLOY_KEY`
- `CLOUDFLARE_API_TOKEN`

Set as GitHub `production` environment variables (public identifiers, not secrets):

- `CLOUDFLARE_ACCOUNT_ID`
- `CONVEX_DEPLOYMENT`
- `VITE_CONVEX_URL`

Set as GitHub repository secrets (used outside the `production` environment):

- `CLOUDFLARE_READ_API_TOKEN` (Cloudflare live-drift audit)
- `CODECOV_TOKEN` (coverage uploads in PR CI)
- `CONVEX_DEV_DEPLOY_KEY` (passed to the `dev_rebuild` job that follows a production deploy)

Auth values (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_DISCORD_ID` /
`AUTH_DISCORD_SECRET`, `JWT_PRIVATE_KEY` / `JWKS`) live on the Convex deployment
itself, not in GitHub. So does `ASSET_PUBLISHER_ACTIVATION_SECRET`, which `convex/http.ts` reads and
`scripts/publication-revisions.ts` fetches with `bunx convex env get … --prod`.

The Worker secret `ASSET_PUBLISHER_EXECUTOR_SECRET` remains installed directly in
Cloudflare. CI validates its name but never reads, rotates, or reinstalls its value.
The retired `ASSET_PUBLISHER_CACHE_TOKEN_SECRET` may remain installed after this
release because Wrangler does not delete undeclared secrets during deployment. The
live-drift report identifies that one retired name without relaxing checks for any
other missing or unexpected secret. Its later deletion is a separate operator
change after the public delivery release is verified.

## GitHub Action

**Workflow**: [`.github/workflows/deploy-main.yml`](../.github/workflows/deploy-main.yml)

On every push to `main`:

1. Install dependencies, then verify schema-narrowing prerequisites
   (`migrations:narrow-check`). This runs *before* the Convex deploy and blocks
   it.
2. Deploy Convex and run required migrations.
3. Create `admin_settings` when absent, with pickup disabled and the checked-in
   Renderer revision map. Existing settings are unchanged.
4. Validate the exact Worker release contract.
5. Check generated Worker bindings and typecheck the release.
6. Regenerate and verify generated output, meaning images (`verify:images`),
   vectors (`verify:vectors`) and OBJ pieces (`generate:objs`), then log the
   output digest.
7. Build the SPA and capture bundle once with the production Convex URL.
8. Verify assembled assets and reject generated-source drift.
9. Dry-run both Worker releases with their exact checked-in configurations.
10. Deploy the private game Worker first. Require its exact tagged version to be active, then verify
    its bound SQLite namespace, configuration and lack of public ingress before deploying the publisher.
11. Wait for Cloudflare's control plane to report the publisher's tagged version as the active
    deployment, reading the deployments list every ten seconds for up to twenty minutes,
    then smoke the workers.dev and `dune.zone` health endpoints. The game health request goes through
    `https://dune.zone/__play/health` and must report the merged SHA, matching tag and control-plane
    version ID with `Cache-Control: no-store`. The complete deploy job allows 120 minutes for both
    bounded active-version gates, migrations and release work.
12. Build and verify the secret-free Storybook artifact, deploy it to `storybook.dune.zone`, and
    smoke its manager, page index, preview entry, CSP, and shared public assets.
13. Read the stored Renderer revisions. If any checked-in revision is higher,
    activate all higher revisions in one mutation and schedule bounded
    regeneration scans. CI does not wait for scanning or capture.
14. Set Convex Auth `SITE_URL` to `https://dune.zone`.
15. A follow-on `dev_rebuild` job (`needs: deploy`) rebuilds the dev deployment
    from production; see
    [`dev-rebuild.yml`](../.github/workflows/dev-rebuild.yml).

The revision step rejects a checked-in value lower than production. Equal values
are a no-op. A revision activation stores the new values before scheduling scans,
so ordinary saves and later scans share the same job-coalescing behavior.

Wrangler receives only the Cloudflare deployment credentials. Its checked-in
configuration remains the deployment contract; CI only overrides `GIT_SHA` with
the merged commit SHA.

## Publication controls

`admin_settings.publicationPickupEnabled` is the sole pickup switch. Administrators
toggle it at `/__jobs`.

The Worker reads the value once at the start of each Cron invocation. Turning it
off therefore:

- prevents that and later invocations from leasing pending jobs;
- does not cancel already leased work; and
- does not prevent expired jobs from being reset to pending.

The same page shows stored Renderer revisions and paged job status. It requires
`users.isAdmin === true`; authenticated non-admin users see `Not authorized`, and
unauthenticated visitors receive no job data.

## Pull-request Cloudflare drift guard

`.github/workflows/cloudflare-live-drift.yml` compares production Cloudflare state
with trusted `main` on every pull request. It uses `pull_request_target`, checks out
only the base SHA, and never executes pull-request-authored code.

Configure `CLOUDFLARE_READ_API_TOKEN` with only:

- Workers Scripts Read;
- Queues Read; and
- Workers R2 Storage Read.

Do not reuse the write-capable deployment token. The drift script performs only
authenticated `GET` requests and checks the Worker Custom Domain, bindings, active
secret names, Cron schedule, repository-owned Queue inventory, and private R2 state
declared in `infra/cloudflare-live-contract.json` and
`workers/publisher/wrangler.jsonc`. It reports the one retired cache-token secret
while it remains installed; every other missing or unexpected secret still fails
the audit.

The same audit checks the publisher's exact `GAME_SERVICE` target and the game Worker contract in
`workers/game/wrangler.jsonc`. It compares the bound namespace ID with Cloudflare's complete namespace
inventory, requiring one `GameRoom` namespace owned by `dunezone-game` with `use_sqlite: true`. It also
rejects game secrets, schedules, Custom Domains, routes, workers.dev or preview ingress. Namespace
inventory uses Workers Scripts Read; no storage contents or secret values are read. A successful
configuration/health check proves deployment wiring, not multiplayer behavior; Stage B's real
Auth, command, projection and browser tests remain separate delivery evidence.

## Migrations on every `main` deploy

After `bun run convex:deploy`, the workflow runs `bun run migrations:deploy`. This
starts and waits for all widen migrations listed in
[`convex/migration-guards.json`](../convex/migration-guards.json).

For a breaking Convex change, follow
[`docs/convex-migrations.md`](./convex-migrations.md):

1. Widen schema and deploy compatible reads/writes.
2. Run bounded production migrations.
3. Verify zero unmigrated rows remain.
4. Narrow schema and remove temporary compatibility code later.

Release 1 of the Publication cutover intentionally does not migrate legacy
publication rows. The new tables start clean, and a later Renderer revision bump
is the one supported way to request fresh captures.

## Post-deploy observation

After a publisher release:

1. Require health smoke to report `maxItems: 20`, schedule `*/5 * * * *`, the
   current Renderer identity, and the merged full Git SHA.
2. Check a known generic public asset through its bare URL, arbitrary queries, and
   legacy `v` query. Require the same current ETag and `Cache-Control: no-cache`, then
   require `304` for `If-None-Match` with that ETag.
3. Confirm the Cloudflare dashboard shows one `*/5 * * * *` Cron.
4. Open `/__jobs` as an administrator and confirm the pickup switch has the intended
   value and no unexpected error jobs appeared.
5. Observe an `asset_publisher_cron` event. With pickup off, expect a disabled
   result after expiry recovery. With pickup on and no eligible jobs, expect an
   empty result without a Browser session.
6. If higher revisions were activated, observe the asynchronous job count grow and
   drain. CI intentionally does not wait for this work.

## Application smoke test

After each production deploy:

- Confirm the site loads and routes resolve.
- Verify OAuth login (Google and Discord).
- Verify profile bootstrap/update works.
- Verify faction and ruleset create/update flows.
- Verify FAQ create/question/answer flow.

## Generated images

`public/image/**` and `public/web/**` are generated in CI from `media/**` by
`scripts/generate-images.ts`, apart from the committed files named in
`COMMITTED_WEB_FILES` (see `src/shared/assetRules.ts` for that list and for the
per-category rules). CI restores the generated tree from a cache keyed on the
media/rules/generator/sharp digest and verifies it structurally
(`bun run verify:images`) without ever re-encoding to compare bytes. The
renderer identity in `workers/publisher/renderer-manifest.generated.ts` (schema
v2) hashes those same ingredients plus the capture code and PDF contract, with
per-component digests so a deploy log can attribute an identity change to
sources, toolchain, code, or contract. A toolchain change (e.g. a sharp bump)
intentionally triggers a visually-identical recapture wave.
