# Documentation

Quick reference for understanding and working with the codebase.

## Entry Points

**Starting a new feature?**
1. Routes: `src/app/routes/` (file-based routing; `_app` is a pathless layout)
2. Domain logic: `src/app/db/<domain>.ts` (loaders plus live query and mutation hooks)
3. Schemas: `src/shared/<domain>/` (Zod schemas — the validators, and the faction contract in
   `src/shared/factions/schema.ts` with its asset-id vocabulary in `src/shared/assetIds.ts`)
4. Validation standard: [`docs/data-layer.md`](./data-layer.md) (Convex `v` + shared Zod)
5. UI: every published component lives in `src/app/ui/<category>` (alias `@ui/*`), and the component
   taxonomy in [`AGENTS.md`](../AGENTS.md#component-taxonomy) decides which category. Lint holds one
   line there: a component renders what it is given — it never fetches and never navigates itself.
   `src/app/widgets/<name>` is only for an assembly two or more routes install whole. Anything one
   page needs stays in that page's route file as local functions. Pages compose: heavy JSX at the
   route is the intended shape.

**Debugging?**
- Router: [`src/app/router.tsx`](../src/app/router.tsx)
- Root route: [`src/app/routes/__root.tsx`](../src/app/routes/__root.tsx)
- Database client: [`src/app/db/core/index.ts`](../src/app/db/core/index.ts)

## Key Commands

```bash
# Development
bun run app:dev           # Dev server on port 3000, using the configured online Convex deployment
bun run app:dev --local   # Disposable local Convex + local auth + production data clone
bun run app:build         # Build for production
bun run app:preview       # Preview production build locally

# Database
bun run convex:dev       # Strict Convex dev start: migration sync + Convex runtime
bun run convex:deploy    # Deploy Convex functions/schema
bun run migrations:run-local-required # Force local required migration catch-up

# Code quality
bun run check            # Lint and check formatting
bun run format           # Format files
bun run test             # Run tests
bun run storybook        # Storybook dev (port 6006)
bun run build-storybook  # Static Storybook → storybook-static
bun run generate         # Regenerate the public asset catalog in src/game/data/generated.ts
bun run publisher:release:verify # Exact pre-PR publisher build, manifest, and dry-run gate
```

`bun run typecheck` uses the native TypeScript 7 compiler from `@typescript/native`. The
`typescript` 6.x development dependency remains intentionally installed because Storybook's
`react-docgen-typescript` integration still imports the legacy compiler API; it is not the compiler
used by the application or publisher typecheck scripts.

### Disposable local app development

`bun run app:dev --local` is the opt-in authenticated local environment for browser review.
It requires Docker, the existing `.env.e2e.local` credentials (copy
`.env.e2e.local.example` when needed), and a Convex CLI login able to export from production.
Each start runs the unified provision pipeline (`scripts/provision.ts`): reset the local
Convex volume, push the checked-out functions, atomically import a point-in-time
production snapshot, clear the tables the clone never keeps (auth session/token tables
and the publication queue), then assert the rebuild contract. The cleared and required
table lists live in [`convex/lib/provisioningContract.ts`](../convex/lib/provisioningContract.ts)
so the pipeline and the `provisioningChecks:assertRebuildContract` query cannot drift
apart, and a table rename becomes a compile error rather than a silently skipped cleanup.

The backend and dashboard images are pinned to multi-platform digests in
`docker-compose.convex-local.yml`, so an existing Docker cache cannot silently select an
older runtime. When upgrading the Convex packages, update both image digests together and
verify a clean `bun run app:dev --local` start.

After the two configured local password users sign in, every cloned faction and group is
handed to user A (user B becomes an active member of every group) so the review workflow
stays "log in as A, edit anything". Use the two configured local accounts in
`/auth/login`; no real account is required.

`bun run e2e:local` remains the deterministic fixture-backed E2E environment; its
provision target is structurally unable to touch production (no production credentials
ever reach its commands). `bun run provision dev` is the same pipeline pointed at the
long-lived cloud dev deployment, used by CI to rebuild it as a production replica after
each deploy. It requires `CONVEX_DEV_DEPLOY_KEY`; the prod snapshot export uses
`CONVEX_PROD_DEPLOY_KEY` when set and otherwise falls back to the ambient
`CONVEX_DEPLOY_KEY` (the repo's deploy secret is the prod key). A bare
`bun run provision local` intentionally refuses to run — the local users stage needs the
running app, so the complete local environment always comes from `bun run app:dev --local`.

### Keeping the cloud dev deployment usable

`deploy-main` calls the `Rebuild dev deployment` workflow once production has shipped, so a
failed rebuild reddens the run without ever gating the release. Every merge pushes main's
functions to the dev deployment; the **data** is only re-cloned when the merge touches
`convex/schema.ts`, `convex/migrations*.ts`, or `convex/migration-guards.json` — the changes
that can invalidate or reshape dev's existing data. Ordinary merges therefore leave your dev
session and any dev-side experiments intact.

Run the `Rebuild dev deployment` workflow manually (Actions → Run workflow) to force fresh
production data at any time. A skipped or failed rebuild cannot go unnoticed for long, and it
recovers: Convex validates existing data against every pushed schema, so stale dev data fails
the next ordinary merge's code push loudly, and a rebuild clears the target before pushing the
new schema — which is why a forced rebuild heals a deployment whose data a schema change has
already made unpushable.

## Common Workflows

### Writing Stories

- Keep stories colocated with the component they render. Storybook navigation is owned by the
  source entries and `titlePrefix` values in `.storybook/main.ts`.
- Prefer auto-titles. Add a relative `title` only when a filename cannot express the useful
  product-facing label; never repeat the category or `Game Assets` in story metadata.
- Stories file under their category root — Blocks, Content, Controls, Layout, Lists, Surfaces — one
  root per `src/app/ui/<category>`; the sidebar does not say whether a component knows the app. Widget stories file under Widgets, and the application chrome files under
  Shell. There is no Application root. See the component taxonomy in
  [`AGENTS.md`](../AGENTS.md#component-taxonomy).
- Game Assets stories belong under Faction, Cards, Tokens, or Composition. Comparative asset
  catalogues may remain exhaustive when side-by-side inspection is the story's purpose.
- Rulebook stories are intentionally not indexed while their redesign is pending.
- Prefer args-only stories. Use wrappers, custom rendering, or interactions only when they
  demonstrate behavior or comparison that args cannot.
- Represent controlled components with static values and noop callbacks unless interaction itself
  is the contract under test.

### Adding a New Domain

1. Create Zod schema in `src/shared/<domain>/validation.ts` (a cross-artifact contract both the app
   and Convex parse against):
   ```typescript
   import { z } from 'zod';
   export const schema = z.object({ ... });
   ```

2. Create domain db file in `src/app/domain-name/db.ts`:
   - Types (wrap Convex `Doc<'table'>` types)
   - Loaders (`loadDomain...`, via `db.query`) for route first paint
   - Live query hooks (`useDomain...`, via Convex `useQuery` + `toLiveQueryResult`)
   - Mutation hooks (`useCreateDomain`, `useUpdateDomain`, etc., via `useLiveMutation`)

   There are no query keys and no cache invalidation — see
   [`state-management.md`](./state-management.md).

3. Add/update Convex schema & functions in `convex/`.
4. Run/deploy Convex:
   ```bash
   bun run convex:dev
   ```
   ```bash
   bun run convex:deploy
   ```

### Adding a New Route

1. Create file in `src/app/routes/`:
   - `_app/index.tsx` → `/`
   - `_app/about.tsx` → `/about`
   - `_app/users/$userId/index.tsx` → `/users/:userId`

2. Use a loader for data and compose every terminal visual route with `PageLayout`, imported from
   `@ui/layout/PageLayout`:
   ```typescript
   export const Route = createFileRoute('/path')({
      loader: async () => { ... },
      component: AboutPage,
    });

    function AboutPage() {
      return (
        <PageLayout header={<h1>About</h1>}>
          <section aria-labelledby="about-heading">
            <h2 id="about-heading">About this application</h2>
            <p>About this application.</p>
          </section>
        </PageLayout>
      );
    }
   ```

   Keep nested parent routes outlet-only. The printable faction-sheet route and non-visual auth
   callbacks are the intentional layout exceptions. For styled application content, follow the
   [component taxonomy](../AGENTS.md#component-taxonomy) and the
   [ownership rules](./technical/ui-component-hierarchy.md) around it.

3. Route tree auto-generates from file structure.

## Game assets (`src/game`, `media/`)

Dune card/faction rendering and Storybook stories live in `src/game`. **Source** artwork lives in
`media/**`; everything under `public/image/**` and `public/web/**` except `logo.svg` is generated
output and gitignored — run `bun run generate:images` locally, and see the image pipeline section of
[`AGENTS.md`](../AGENTS.md). `scripts/generate.ts` refreshes the typed public-asset catalog used by
game schemas.

## Detailed Documentation

- [Architecture](./architecture.md) - Request flow, structure, tsconfig paths
- [Data Layer](./data-layer.md) - Domain patterns, DB syncing, structure
- [Routing](./routing.md) - Route configuration, file-based routing
- [Authentication](./authentication.md) - Auth patterns, Convex Auth integration
- [User Data Contract](./user-data-contract.md) - What belongs in `users` vs `profiles`
- [State Management](./state-management.md) - Convex live subscriptions, the loader/`initialData` handoff
- [Membership](./membership.md) - Group membership approval flow
- [Deployment](./deployment.md) - Cloudflare Worker deployment process
- [Convex Migrations](./convex-migrations.md) - Required widen/migrate/verify/narrow runbook + CI/deploy guards
- [UI Taxonomy & Ownership](./technical/ui-component-hierarchy.md) - Ownership rules around the canonical taxonomy in `AGENTS.md`
- [UI Design Decisions](./technical/ui-design-decisions.md) - Accepted UI semantics and consistency defaults
