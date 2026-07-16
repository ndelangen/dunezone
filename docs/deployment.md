# Deployment

## Current production and planned Worker cutover

Production currently deploys to Netlify as a Single Page Application (SPA). The repository is being
prepared to move the application, public generated assets, capture surface, and publisher into one
Cloudflare Worker release unit. This source preparation does not provision or deploy that Worker,
change `SITE_URL`, or activate publishing.

At the approved cutover, the Cloudflare Worker becomes the only canonical application host. Keep
the last known-good Netlify release only as rollback infrastructure; do not run Netlify and
Cloudflare as competing routine production deployers.

## Build Process

**Config**: [`netlify.toml`](../netlify.toml)
- **Default build command**: `bun run app:build`
- **Production override** (`[context.production]`): `bun run convex:deploy && bun run app:build` (legacy fallback when building directly in Netlify)
- **Publish directory**: `dist/client`

**Build configuration**: [`vite.config.ts`](../vite.config.ts)
- SPA mode enabled: `spa: { enabled: true }`
- Assets directory: `public`
- Public directory: `public`

**Unified Worker release build**:

```bash
VITE_CONVEX_URL=https://example.convex.cloud bun run publisher:assets
```

This builds `dist/client`, builds the isolated publisher capture bundle, and assembles both into
`workers/publisher/dist`. The assembly omits Netlify-only `_redirects`, copies TanStack's
`_shell.html` to the `index.html` required by Cloudflare SPA fallback, and fails when the Workers
Free 20,000-file limit or 25 MiB per-file limit is exceeded.

## Routing and ownership

**Redirects file**: [`public/_redirects`](../public/_redirects)

Netlify rewrites missing routes to TanStack's SPA shell for client-side routing:

```
/*    /_shell.html   200
```

This ensures TanStack Router handles all routes on the client side.

Cloudflare Static Assets uses `not_found_handling: "single-page-application"`. Requests are
asset-first by default, so ordinary navigation and hashed static files avoid a Worker invocation.
Only these namespaces are Worker-first:

| Namespace | Owner |
| --- | --- |
| `/published` and `/published/*` | Stable public generated-asset delivery; malformed paths fail closed. |
| `/__asset-publisher` and `/__asset-publisher/*` | Health and capability-gated operational routes. |
| `/publisher-capture`, `/publisher-capture.html`, `/publisher-capture/*` | Capability-gated capture document and bundle. |
| Everything else, including `/factions/*` | Static asset lookup, then SPA `index.html` fallback. |

The faction-sheet delivery path is
`/published/factions/<Convex faction id>/sheet.pdf`. The `/published` prefix prevents collision with
the user-facing `/factions/<slug>` SPA route.

## Environment Variables

Set in **GitHub repository secrets** for CI:

- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `VITE_CONVEX_URL` - Convex deployment URL
- `CONVEX_DEPLOY_KEY` - Convex deploy key for `convex deploy`
- `CONVEX_DEPLOYMENT` - Convex production deployment slug/name
- `SITE_URL` - Public app URL used for OAuth redirects (Convex env)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth credentials (Convex env)
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` - Discord OAuth credentials (Convex env)
- `JWT_PRIVATE_KEY` / `JWKS` - JWT signing and discovery settings (Convex env)

Keep the same values in Netlify only if you still plan to run manual Netlify builds.

**Note**: Vite requires `VITE_` prefix for client-side environment variables.

## GitHub Action

**Workflow**: [`.github/workflows/deploy-main.yml`](../.github/workflows/deploy-main.yml)

On every push to `main`:
1. `bun install --frozen-lockfile`
2. `bun run convex:deploy`
3. `bun run migrations:deploy` (auto-run + await required Convex migrations)
4. `bun run app:build`
5. Deploy `dist/client` to Netlify with **`deploy --no-build --prod`** (token + site id). **`--no-build`** is required so the CLI does not run `netlify.toml`’s `build.command` via `@netlify/build`; that path can finish as a **draft** deploy and skip updating the production URL even when `--prod` is present.

The Netlify publish step runs only if Convex deploy, migration verification, and build succeed.
The reusable verification workflow also builds and dry-runs the unified Worker release without
deploying it.

The future approved cutover keeps the same release authority and order: verify → tolerant Convex
deploy → required migrations → unified Worker build → infrastructure/readiness checks → Worker
deploy → smoke tests → separately guarded activation. Only after that cutover should routine
Netlify publication be removed; retain its last known-good release for rollback.

## Netlify One-Time Setup

Production traffic should come **only** from GitHub Actions (`netlify deploy --prod` with a fresh build). The repo’s [`netlify.toml`](../netlify.toml) sets **`ignore`** so pushes to **`main` skip Netlify’s Git hook build** (exit `0` = cancel). That stops duplicate deploys where Netlify shows a preview and you had to click “Publish deploy” for production.

In Netlify UI, still verify:

1. **Site configuration → Build & deploy → Branches and deploy contexts**
   - **Production branch** = `main` (so any Netlify-side behavior stays aligned with Git).
2. **Site configuration → Build & deploy → Continuous Deployment**
   - You can leave the repo connected for Deploy Previews on non-`main` branches; `main` builds are ignored in favor of Actions.
3. Keep redirects from [`public/_redirects`](../public/_redirects) so SPA routes continue working.

If you prefer **no** Netlify Git builds at all (Actions only), disconnect the repo or set `[build] ignore = "exit 0"` and rely solely on the workflow.

## Migrations on every `main` deploy

On push to `main`, [`.github/workflows/deploy-main.yml`](../.github/workflows/deploy-main.yml) runs **`bun run migrations:deploy`** after **`bun run convex:deploy`**. That starts and waits for all widen migrations in [`convex/migration-guards.json`](../convex/migration-guards.json) (including `profiles_from_users_v1`). No separate manual migration step is required when this workflow succeeds.

## Current deployment flow

```mermaid
flowchart LR
    Git[Push main] --> GHA[GitHub Actions]
    GHA --> ConvexDeploy[Run convex deploy]
    ConvexDeploy --> Build[Run app build]
    Build --> NetlifyDeploy[Deploy dist/client]
    NetlifyDeploy --> Live[Live Site]
```

No checked-in workflow currently provisions Cloudflare resources, installs publisher secrets,
deploys the Worker, changes `SITE_URL`, or activates Cron/Convex publishing.

## Convex Breaking Migrations (Required)

For any migration that can invalidate existing Convex documents, follow the required runbook:

- [`docs/convex-migrations.md`](./convex-migrations.md)

Required high-level sequence:

1. Widen schema and deploy compatibility reads/writes.
2. Auto-run bounded production backfill in deploy workflow.
3. Verify zero unmigrated rows remain (CI/deploy guard).
4. Narrow schema and remove temporary fallback/migration code.

Do not deploy the narrowing schema before verification is complete.

## Go-Live Smoke Test

After each production deploy:
- Confirm site loads and routes resolve.
- Verify OAuth login (Google and Discord).
- Verify profile bootstrap/update works.
- Verify create/update flow for factions and rulesets.
- Verify FAQ create/question/answer flow.
