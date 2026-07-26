# Documentation

Quick reference for understanding and working with the codebase.

## Entry Points

**Starting a new feature?**
1. Routes: `src/app/routes/` (file-based routing)
2. Domain logic: `src/app/<domain>/db.ts` (data access hooks)
3. Schemas: `src/app/<domain>/validation.ts` and `src/game/schema/` (Zod schemas)
4. Validation standard: [`docs/data-layer.md`](./data-layer.md) (Convex `v` + shared Zod)

**Debugging?**
- Router: [`src/app/router.tsx`](../src/app/router.tsx)
- Root route: [`src/app/routes/__root.tsx`](../src/app/routes/__root.tsx)
- Database client: [`src/app/db/core/index.ts`](../src/app/db/core/index.ts)

## Key Commands

```bash
# Development
bun run app:dev           # Dev server on port 3000, using the configured online Convex deployment
bun run app:dev --local   # Disposable local Convex + local auth + production faction copy
bun run app:build         # Build for production
bun run app:preview       # Preview production build locally

# Database
bun run convex:dev       # Strict Convex dev start: migration sync + Convex runtime
bun run convex:deploy    # Deploy Convex functions/schema
bun run migrations:run-local-required # Force local required migration catch-up

# Code quality
bun run biome:check      # Lint and format
bun run test             # Run tests
bun run storybook        # Storybook dev (port 6006)
bun run build-storybook  # Static Storybook → storybook-static
bun run generate         # Regenerate the public asset catalog in src/game/data/generated.ts
bun run publisher:release:verify # Exact pre-PR publisher build, manifest, and dry-run gate
```

### Disposable local app development

`bun run app:dev --local` is the opt-in authenticated local environment for browser review.
It requires Docker and the existing `.env.e2e.local` credentials (copy
`.env.e2e.local.example` when needed). Each start resets the local Convex volume, creates
the two configured local password users, and copies active production factions plus their
directly referenced groups through a read-only production query.

The local mapping is intentionally simple: user A owns every copied faction and group,
while user B is an active member of every copied group. Production users, profiles,
sessions, publisher state, rulesets, and operational tables are not copied. Use the two
configured local accounts in `/auth/login`; no real account is required.

`bun run e2e:local` remains the deterministic fixture-backed E2E environment and does not
perform this production copy.

## Common Workflows

### Writing Stories

- Stories should render the component the story file is for.
- Avoid wrappers unless required to demonstrate that component's own capability.
- Prefer args-only stories over custom `render` functions.
- For controlled components in this repo, use non-interactive args-only examples with static values and noop callbacks.

### Adding a New Domain

1. Create Zod schema in `src/app/domain-name/validation.ts` (or `src/game/schema/` for game-domain types):
   ```typescript
   import { z } from 'zod';
   export const schema = z.object({ ... });
   ```

2. Create domain db file in `src/app/domain-name/db.ts`:
   - Types (wrap DB types)
   - Query keys (hierarchical structure)
   - Query hooks (`useDomain...`)
   - Mutation hooks (`useCreateDomain`, `useUpdateDomain`, etc.)

3. Add/update Convex schema & functions in `convex/`.
4. Run/deploy Convex:
   ```bash
   npm run convex:dev
   npm run convex:deploy
   ```

### Adding a New Route

1. Create file in `src/app/routes/`:
   - `_app/index.tsx` → `/`
   - `_app/about.tsx` → `/about`
   - `_app/users/$userId/index.tsx` → `/users/:userId`

2. Use a loader for data and compose every terminal visual route with `PageLayout`:
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
   [Mantine-first UI ownership model](./technical/ui-component-hierarchy.md); do not introduce new
   legacy generic cards or layout wrappers.

3. Route tree auto-generates from file structure.

## Game assets (`src/game`, `public/`)

Dune card/faction rendering and Storybook stories live in `src/game`; source artwork lives in `public/`. `scripts/generate.ts` refreshes the typed public-asset catalog used by game schemas.

## Detailed Documentation

- [Architecture](./architecture.md) - Request flow, structure, tsconfig paths
- [Data Layer](./data-layer.md) - Domain patterns, DB syncing, structure
- [Routing](./routing.md) - Route configuration, file-based routing
- [Authentication](./authentication.md) - Auth patterns, Convex Auth integration
- [User Data Contract](./user-data-contract.md) - What belongs in `users` vs `profiles`
- [State Management](./state-management.md) - TanStack Query, cache patterns
- [Membership](./membership.md) - Group membership approval flow
- [Deployment](./deployment.md) - Cloudflare Worker deployment process
- [Convex Migrations](./convex-migrations.md) - Required widen/migrate/verify/narrow runbook + CI/deploy guards
- [UI Component Hierarchy](./technical/ui-component-hierarchy.md) - Composition layers, dependency direction, CSS ownership
- [UI Design Decisions](./technical/ui-design-decisions.md) - Accepted UI semantics and consistency defaults
- [UI Content Migration](./technical/ui-content-migration.md) - Settled Mantine pilot conventions, remaining routes, and legacy retirement waves
