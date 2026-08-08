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

This builds `dist/client`, builds the isolated capture bundle, and assembles both
into `workers/publisher/dist`. The assembly copies TanStack's `_shell.html` to the
`index.html` Cloudflare Static Assets requires for SPA fallback and fails if the
final bundle violates Workers asset-count or per-file limits.

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
| `/published` and `/published/*` | Stable public generated-asset delivery |
| `/__asset-publisher` and `/__asset-publisher/*` | Health and operational endpoints |
| `/publisher-capture`, `/publisher-capture.html`, `/publisher-capture/*` | Protected capture document and bundle |
| Everything else, including `/factions/*` | Static asset lookup, then SPA fallback |

The faction-sheet delivery path is
`/published/factions/<Convex faction id>/sheet.pdf`. The `/published` prefix avoids
collision with the user-facing `/factions/<slug>` SPA route.

## Environment variables

Set as secrets on the GitHub `production` environment (deployment branch policy:
`main` only, so no other ref can receive them):

- `CONVEX_DEPLOY_KEY`
- `CLOUDFLARE_API_TOKEN`
- `ASSET_PUBLISHER_ACTIVATION_SECRET`

Set as GitHub `production` environment variables (public identifiers, not secrets):

- `CLOUDFLARE_ACCOUNT_ID`
- `CONVEX_DEPLOYMENT`
- `VITE_CONVEX_URL`

Set as GitHub repository secrets (used outside the `production` environment):

- `CLOUDFLARE_READ_API_TOKEN` (Cloudflare live-drift audit)
- `CODECOV_TOKEN` (coverage uploads in PR CI)

Auth values (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_DISCORD_ID` /
`AUTH_DISCORD_SECRET`, `JWT_PRIVATE_KEY` / `JWKS`) live on the Convex deployment
itself, not in GitHub.

The Worker secrets `ASSET_PUBLISHER_EXECUTOR_SECRET` and
`ASSET_PUBLISHER_CACHE_TOKEN_SECRET` remain installed directly in Cloudflare. CI
validates their names but never reads, rotates, or reinstalls their values.

## GitHub Action

**Workflow**: [`.github/workflows/deploy-main.yml`](../.github/workflows/deploy-main.yml)

On every push to `main`:

1. Install dependencies.
2. Deploy Convex and run required migrations.
3. Create `admin_settings` when absent, with pickup disabled and the checked-in
   Renderer revision map. Existing settings are unchanged.
4. Validate the exact Worker release contract.
5. Check generated Worker bindings and typecheck the release.
6. Build the SPA and capture bundle once with the production Convex URL.
7. Verify assembled assets and reject generated-source drift.
8. Dry-run, then deploy the Worker with the full merged Git SHA.
9. Smoke the workers.dev and `dune.zone` health endpoints.
10. Read the stored Renderer revisions. If any checked-in revision is higher,
    activate all higher revisions in one mutation and schedule bounded
    regeneration scans. CI does not wait for scanning or capture.
11. Set Convex Auth `SITE_URL` to `https://dune.zone`.

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
authenticated `GET` requests and checks the Worker Custom Domain, bindings, secret
names, Cron schedule, repository-owned Queue inventory, and private R2 state
declared in `infra/cloudflare-live-contract.json` and
`workers/publisher/wrangler.jsonc`.

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
2. Confirm the Cloudflare dashboard shows one `*/5 * * * *` Cron.
3. Open `/__jobs` as an administrator and confirm the pickup switch has the intended
   value and no unexpected error jobs appeared.
4. Observe an `asset_publisher_cron` event. With pickup off, expect a disabled
   result after expiry recovery. With pickup on and no eligible jobs, expect an
   empty result without a Browser session.
5. If higher revisions were activated, observe the asynchronous job count grow and
   drain. CI intentionally does not wait for this work.

## Application smoke test

After each production deploy:

- Confirm the site loads and routes resolve.
- Verify OAuth login (Google and Discord).
- Verify profile bootstrap/update works.
- Verify faction and ruleset create/update flows.
- Verify FAQ create/question/answer flow.

## Generated images

`public/image/**` and `public/web/**` (except `logo.svg`) are generated in CI
from `media/**` by `scripts/generate-images.ts` (see `src/shared/assetRules.ts`
for the per-category rules). CI restores the generated tree from a cache keyed
on the media/rules/generator/sharp digest and verifies it structurally
(`bun run verify:images`) — it never re-encodes to compare bytes. The renderer
identity in `workers/publisher/renderer-manifest.generated.ts` (schema v2)
hashes those same ingredients plus the capture code and PDF contract, with
per-component digests so a deploy log can attribute an identity change to
sources, toolchain, code, or contract. A toolchain change (e.g. a sharp bump)
intentionally triggers a visually-identical recapture wave.
