# Documentation

Quick reference for understanding and working with the codebase.

## Entry points

**Starting a new feature?**
1. Routes: `src/app/routes/` (file-based routing; `_app` is a pathless layout)
2. Domain logic: `src/app/db/<domain>.ts` (loaders plus live query and mutation hooks)
3. Schemas: `src/shared/<domain>/` (Zod schemas, meaning the validators plus the faction contract in
   `src/shared/factions/schema.ts` with its asset-id vocabulary in `src/shared/assetIds.ts`)
4. Validation standard: [`docs/data-layer.md`](./data-layer.md) (Convex `v` + shared Zod)
5. UI: every published component lives in `src/app/ui/<category>` (alias `@ui/*`), and the component
   taxonomy in [`AGENTS.md`](../AGENTS.md#component-taxonomy) decides which category. Lint holds one
   line there: a component renders what it is given; it never fetches and never navigates itself.
   `src/app/widgets/<name>` is only for an assembly two or more routes install whole. Anything one
   page needs stays in that page's route file as local functions. Pages compose: heavy JSX at the
   route is the intended shape.

**Debugging?**
- Router: [`src/app/router.tsx`](../src/app/router.tsx)
- Root route: [`src/app/routes/__root.tsx`](../src/app/routes/__root.tsx)
- Database client: [`src/app/db/core/index.ts`](../src/app/db/core/index.ts)

**Something behaving impossibly?** [`technical/operational-traps.md`](./technical/operational-traps.md) collects the tooling behaviours that read as success while being wrong: a Storybook port that answers from another worktree, a typecheck that passes a projection the runtime validator rejects, a MERGED badge on work that never reached `main`.

## Key commands

```bash
# Development
bun run app:dev           # Port 3000, using the configured online Convex deployment
bun run app:dev --local   # Separate Convex per launch + local auth + fixture data
bun run app:dev --local --data=snapshot # The same with the anonymised, published-only production snapshot
bun run app:build         # Build for production
bun run app:preview       # Preview production build locally

# Database
bun run convex:dev       # Manual integration watcher; not for branch work
bun run convex:deploy    # Deploy Convex functions/schema
bun run migrations:run-local-required # Force local required migration catch-up

# Code quality
bun run check            # Lint and check formatting
bun run format           # Format files
bun run test             # Run tests
bun run storybook        # Storybook dev (port 6006)
bun run build-storybook  # Static Storybook → storybook-static
bun run verify:storybook-publication # Public bytes, headers, isolation, and browser runtime
bun run generate         # Regenerate the public asset catalog in src/game/data/generated.ts
bun run publisher:release:verify # Exact pre-PR publisher build, manifest, and dry-run gate
```

`bun run typecheck` uses the native TypeScript 7 compiler from `@typescript/native`. The
`typescript` 6.x development dependency remains intentionally installed because Storybook's
React Component Meta integration still imports the legacy compiler API; it is not the compiler
used by the application or publisher typecheck scripts.

The pinned Fiber patch removes its ambient Three JSX declarations from React's namespaces.
Those declarations make even a DOM `React.ElementType` enumerate Three's catalogue, which
stalls the native checker. Play's scene files opt into a route-owned
[`three-jsx` runtime](../src/app/routes/_app/play/three-jsx/jsx-runtime.ts) instead.
It exports React's unchanged runtime functions and keeps the exact Three prop types local.
The colocated typecheck fixture checks valid and invalid Three props, Mantine attributes,
and the DOM namespace together. No files are excluded from typechecking.
Replace the patch and local runtime together when Fiber provides an upstream scoped JSX entry.

The `miniflare` entry in `package.json` `overrides` moves only miniflare's own `undici` to 7.29.1,
for [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v). miniflare pins
`undici` to exactly 7.29.0, which no range can reach, and an override of `undici` everywhere would
move jsdom's 8.x copy and the Codecov analyzer's 6.x copies across majors. An override scoped to one
parent needs Bun 1.4 or later, and it makes `bun.lock` `lockfileVersion` 3, which Bun 1.3 cannot read
(see [operational traps](./technical/operational-traps.md#bun-13-rewrites-bunlock-instead-of-refusing-it)).
Remove the entry when the miniflare release in the tree, which moves with `wrangler`, pins `undici`
7.29.1 or later.

### Disposable local app development

`bun run app:dev --local` is the authenticated local environment for browser review and branch work
on Convex functions, schemas, or migrations. It requires Docker and `.env.e2e.local` credentials. It
needs no Convex login and never exports production. A worktree without the ignored credentials file
reads it from the main checkout. Set `LOCAL_DEV_ENV_FILE` to use another credentials file.

Bare `bun run app:dev` stays on the configured online deployment, which needs neither Docker nor a
credentials file. The `app-integration` entry in `.claude/launch.json` starts it that way.

Each launch creates a fresh Docker Compose project and volume, even in the same worktree. It chooses
a random four-port block and prints the application, backend, site, and dashboard addresses.
Process-level `APP_DEV_PORT` or `PORT`, `CONVEX_BACKEND_PORT`, `CONVEX_SITE_PORT`, and
`CONVEX_DASHBOARD_PORT` override those ports. Docker and Vite fail on an occupied port; retry the
command or choose another override. There is no port reservation or automatic retry.

The launcher resolves Docker from the standard system and Docker Desktop locations. Set the
absolute `LOCAL_DEV_DOCKER_PATH` when the CLI lives elsewhere.

The fixed ports in `.env.e2e.local` belong to E2E and do not override the launch's ports. Copy
`.env.e2e.local.example` when the main checkout has no credentials file.

Each start runs the `scripts/provision.ts` stages: push the checked-out functions, clear the
application tables, and run the migration guards. Once the two local accounts exist, it seeds, in
this order:

- `e2e:seedBaseline`: user A's profile and the E2E Baseline Group with its ruleset. It clears the
  application tables before it seeds, so it goes first.
- The Storybook page-story baseline from
  [`src/app/db/storybook/database.ts`](../src/app/db/storybook/database.ts): the Arrakeen Rules
  Council, the ClassicRules ruleset, House Atreides, representative assets and an FAQ.
- `playTesting:seedRealGameCatalogue` and `playTesting:seedPublicCatalogue`: a synthetic ruleset
  with both required decks and two factions, and the Recovery token.

Vite serves no `/published/` path; it answers with the application's HTML. Published artwork such as
faction tokens and leader portraits therefore shows as a missing image in a local launch.

`bun run app:dev --local --data=snapshot` loads the anonymised production snapshot instead of the
fixtures. The snapshot holds published content only: groups, factions, assets, rulesets, Rulebooks
with their Editions, and FAQ questions. It holds no accounts, profiles, sign-in accounts, emails,
drafts, FAQ answers, group memberships or deleted accounts. Every owner, author and asker in it is
one placeholder user, "Snapshot owner", the snapshot's only user and profile. It has no email and
no sign-in account, so nobody can sign in as it. `scripts/lib/snapshot-policy.ts` says what each
table keeps.

Without `--snapshot-file <zip>`, the launch downloads the newest snapshot that the `Anonymised
snapshot` workflow uploaded from `main`, using the GitHub CLI (`gh auth login` first). It ignores an
artifact of that name from any other workflow, event, branch or fork, and one from a run that did
not succeed. The download goes to the launch's private temporary directory, and the launch deletes
it as soon as the import finishes or fails. Nothing is cached between launches. The workflow keeps
each upload for one day, and uploads only while its `SNAPSHOT_UPLOAD` switch is `"true"`. With no
artifact, or when GitHub cannot be reached, the launch stops before Docker starts and points at
`--data=fixture`.

Before importing, the launch checks the file: it needs the anonymiser's manifest, no table the
policy drops, and a clean leak scan, so a raw export never loads by mistake. The check does not
apply the policy's field and row rules again. The import uses `--replace-all`, which empties every
table the snapshot leaves out, and the snapshot rebuild contract then checks that those tables are
empty and that `users` and `profiles` hold the placeholder alone. The snapshot carries no migration
state or aggregates; the migration guards that every launch runs rebuild both. The contract lives in
[`convex/lib/provisioningContract.ts`](../convex/lib/provisioningContract.ts). Pass
`--snapshot-file` to load a file you already have, such as one the anonymiser CLI wrote from a
synthetic export; the launch leaves that file where it is.

No command loads raw production data outside production. The only command that exports production
is the snapshot job's script, which `dev-rebuild` also runs. It refuses to run outside a GitHub
Actions run on `main` and needs `CONVEX_PROD_DEPLOY_KEY`, so a Convex login is never enough.

A supervised local Convex watcher pushes later function, schema, shared contract, and backend
configuration edits to this launch's stack. It never changes the worktree's
`.env.local`. Restart the command after changing `convex/migrations*.ts` or
`convex/migration-guards.json` so the launcher reruns the migration guard. Vite and the watcher stop
together.

Normal exit or startup failure removes only this launch's containers, volume, and private temporary
directory. A hard crash or `SIGKILL` can leave containers and temporary files behind; later launches
do not reclaim them. Startup prints the project, temporary directory, and a cleanup command:

```bash
bun scripts/local-dev-cleanup.ts dunezone-local-<UUID>
```

Use the printed command from a checkout with the same Docker context and `LOCAL_DEV_DOCKER_PATH`,
then delete only the printed temporary directory. It holds auth keys, and a downloaded snapshot
until that snapshot's import has run.

The backend and dashboard images are pinned to multi-platform digests in
`docker-compose.convex-local.yml`, so an existing Docker cache cannot silently select an
older runtime. When upgrading the Convex packages, update both image digests together and
verify a clean `bun run app:dev --local` start.

After the two configured local password users sign in, every faction and group, whether seeded or
from the snapshot, is handed to user A (user B becomes an active member of every group) so
the review workflow stays "log in as A, edit anything". Assets and rulesets keep their owner, which
in a snapshot launch is the placeholder, so A can edit one only through the group it belongs to and
cannot rename or delete it. Use the two configured local accounts in `/auth/login`; no real account
is required.

`bun run e2e:local` remains the deterministic fixture-backed E2E environment; its
provision target is structurally unable to touch production (no production credentials
ever reach its commands). `bun run provision dev` is the same pipeline pointed at the
long-lived cloud dev deployment. CI rebuilds dev with
`provision dev --stage data --snapshot-file <zip>`, which checks the file as a local launch does,
clears dev, pushes main's functions, imports the snapshot, checks the snapshot rebuild
contract and runs the migration guards. It needs only `CONVEX_DEV_DEPLOY_KEY`, and it never exports
production. A bare `bun run provision local` intentionally refuses to run: the local users stage
needs the running app, so the complete local environment always comes from
`bun run app:dev --local`. With explicit `--stage` flags, its data stage clears the application
tables as the e2e target does; the snapshot load belongs to `app:dev --local` alone.

### Keeping the cloud dev deployment usable

`deploy-main` calls the `Rebuild dev deployment` workflow once production has shipped, so a
failed rebuild reddens the run without ever gating the release. Every merge pushes main's
functions to the dev deployment; the **data** is only reloaded when the deploy cannot tell which
commits it adds to production, or when those commits touch `convex/schema.ts`,
`convex/migrations*.ts`, or `convex/migration-guards.json`, the changes that can invalidate or
reshape dev's existing data, or the files that make, load and check the snapshot: the snapshot
policy and anonymiser (`scripts/lib/snapshot-*.ts`, `scripts/snapshot-*.ts`),
`scripts/anonymised-snapshot.ts`, the rebuild contract (`convex/lib/provisioningContract.ts`,
`convex/provisioningChecks.ts`) and `.github/workflows/dev-rebuild.yml`. So a tightened policy
reaches dev on the merge that makes it. `scripts/dev-rebuild-decision.ts` holds the list. Ordinary
merges leave your dev session and any dev-side experiments intact.

Dev's data is the anonymised snapshot, never raw production. A data rebuild runs the snapshot job's
own script (`scripts/anonymised-snapshot.ts`) in the same job: it exports production, deletes the
raw export once it has read it, anonymises it and scans the result. The next step loads that file
with `provision dev --stage data --snapshot-file`, holding only the dev deploy key. The rebuild does
not depend on the public artifact, and it uploads nothing. The job's step summary shows the same
table report as the snapshot job. When the export, the anonymiser or its leak scan refuses, the job
fails before dev is touched, and dev keeps the data it had; the same holds when the dev step refuses
the file, because it checks the file before it clears anything.

After a rebuild, cloud dev holds no accounts from production: `users` and `profiles` hold only the
placeholder owner, and `authAccounts` is empty. Signing in to dev therefore creates a new account
and profile, the first time and again after every data rebuild, which empties those tables once
more. That account owns nothing from the snapshot. The snapshot's content all belongs to the
placeholder "Snapshot owner", nobody can sign in as it, and its groups have no members to approve a
request to join. Create your own content to experiment with. No dev account is an administrator
until someone sets `isAdmin` on its `users` row in the dev dashboard.

The cloud dev deployment is the shared integration copy of `main`, not a feature-branch workspace.
Do not run a branch's `convex dev` against it. Use `bun run app:dev --local` when the checked-out
Convex code must run.

Run the `Rebuild dev deployment` workflow manually (Actions → Run workflow) to force a fresh
snapshot at any time. A skipped or failed rebuild cannot go unnoticed for long, and it
recovers: Convex validates existing data against every pushed schema, so stale dev data fails
the next ordinary merge's code push loudly, and a rebuild clears the target before pushing the new
schema, which is why a forced rebuild heals a deployment whose data a schema change has already made
unpushable.

## Common workflows

### Writing stories

- Keep stories colocated with the component they render. Storybook navigation is owned by the
  source entries and `titlePrefix` values in `.storybook/main.ts`.
- Prefer auto-titles. Add a relative `title` only when a filename cannot express the useful
  product-facing label; never repeat the category or `Game Assets` in story metadata.
- Stories file under their category root, one per `src/app/ui/<category>`: Blocks, Content,
  Controls, Layout, Lists, Surfaces. The sidebar does not say whether a component knows the app.
  Widget stories file under Widgets, and the application chrome files under Shell. There is no
  Application root. See the component taxonomy in [`AGENTS.md`](../AGENTS.md#component-taxonomy).
- Game Assets stories belong under Faction, Cards, Tokens, Generic, or Composition. Comparative asset
  catalogues may remain exhaustive when side-by-side inspection is the story's purpose.
- Rulebook layout stories and the route-owned Block editor previews file under one Rulebook root:
  `Layouts` and `Blocks/<Block name>`. Other Rulebook route stories remain under Pages.
- Prefer args-only stories. Use wrappers, custom rendering, or interactions only when they
  demonstrate behavior or comparison that args cannot.
- Represent controlled components with static values and noop callbacks unless interaction itself
  is the contract under test.

#### Page stories

Page stories run the real route, Convex query, and Convex mutation handlers in an isolated browser
worker. They never contact a hosted Convex deployment. Every page story must show a complete,
realistic page state using real data copied from production. Names, content and artwork must be
authentic; placeholder content cannot stand in for missing production data. Record the source of
copied fixtures and include the assets needed to render them in isolation. Copy only data suitable
for the published story; authentication secrets and private conversations do not belong in its
assets.

Complete means complete for the intended moment: a loading, refusal or access-denied story shows
that actual page state, without inventing a ready game behind it. Any content visible in that state
still uses production-copied data; an intentional loading indicator is not placeholder content.

The current canonical database supplies a connected viewer, Group, ruleset, faction, FAQ and
representative Assets. That mechanical seed alone does not establish page realism. Populate the
story's `database: db(...)` callback with the production-derived records and relationships its
complete state needs, then vary only what explains the scenario. The Groups and Profiles page
stories still show the seed's synthetic `storybook-viewer`, and the Rulesets stories attribute
their records to it. These stories need migration to this requirement.

The callback receives a fresh mutable baseline. Return `emptyDatabase()` or another database to
replace it. Helpers supply deterministic mechanical values and validate shared semantic contracts;
they do not invent replacement product content. The worker applies the actual Convex schema.
Invalid database state fails before the page renders. Identity is a separate `identity` parameter,
and route or search parameters stay in the story's router setup rather than the database parameter.

The page story runner copies the complete application route tree into a memory router. It does not
mount the application's document wrapper inside Storybook. Add a colocated page story and pass the
route URL through `StorybookPage`'s `args.path`; route and search parameters belong in that URL.

The Bun patch for `@storybook/tanstack-react@10.6.0` forwards the mocked Link's ref to
`useLinkProps`. Without it, tooltips on router-backed icon buttons cannot find their target. The
Rulebooks Owner story checks the Add and utility-menu tooltips. Remove the patch when an
upstream release passes those checks without it.

Use only variations that produce meaningfully different pages, including URL parameter cases when
they change the result. A play function may exercise the page's normal mutations and navigation;
`useStorybookDatabaseReset()` replaces the worker with the story's fresh declared state. Every story
wait shares the 10 s bound in `.storybook/storyWaits.ts`, sized to the runner's frame lag (#1248); a
per-wait `timeout` is for a transport or timer wait that needs more, not for a menu, a tooltip or
anything else that opens on a frame. Keep direct
tests for unhappy query branches and server invariants. Keep end-to-end tests for a few application
journeys instead of turning page stories into journeys.

The runtime faithfully covers registered Convex handlers, schema checks, authentication identity,
components, triggers, transactions, scheduling, HTTP handling, and query refresh. It does not cover
hosted WebSockets, identity providers, deployment configuration, or production data. External
network access and subworkers are disabled. An unregistered or unsupported path must fail instead
of returning a fixture-shaped answer.

#### Play page stories

Play has one product story set for all features. Organise it under `Pages / Play` by stage: Lobby,
Create, Drafting, Swapping, Setup, Playing and Finished. Within a stage, prefer descriptive stories
over another group. `Playing / Controls` is a story, not a folder for a lone Private bank story.
Battles earns a group under Playing because it has several meaningful page states. Add other
feature groups only when several related stories need them; do not require a stage / feature /
state hierarchy everywhere.

Six players is the default for Play page stories. Vary the count when the scenario demonstrates
count-dependent behavior, such as a vacancy, fewer players or a crowded layout. Choose those
exceptions using judgment. An observer's view retains the same game's player count. Share the
production-derived game content and build consistent states for each stage: roster, assignments,
pieces, inventories, private information and controls must agree.

Page stories own the complete page, its interactions and the viewer's permissions. Component
stories own isolated rendering variations. The BattleWheel stories already cover its visual
states; battle page stories focus on the planning controls, privacy, roles and integration with
the table instead of repeating that component matrix. Preserve required behavior checks when
consolidating stories.

Demo and Hosted stay as runtime routes, with no stories of their own, until
[#1296](https://github.com/ndelangen/dunezone/issues/1296) moves their remaining verification
consumers to real games.

### Adding a new domain

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

   There are no query keys and no cache invalidation; see
   [`state-management.md`](./state-management.md).

3. Add or update the Convex schema and functions in `convex/`.
4. Run the checked-out backend in this worktree:
   ```bash
   bun run app:dev --local
   ```

Production and the shared cloud dev integration deployment update through the post-merge workflows.

### Adding a new route

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
        <PageLayout>
          <PageLayout.Header>
            <PageTitle title="About" />
          </PageLayout.Header>
          <PageLayout.Content>
            <section aria-labelledby="about-heading">
              <h2 id="about-heading">About this application</h2>
              <p>About this application.</p>
            </section>
          </PageLayout.Content>
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
`media/**`; everything under `public/image/**` and `public/web/**` is generated output and
gitignored, apart from the committed files named in `COMMITTED_WEB_FILES`
(`src/shared/assetRules.ts`). Run `bun run generate:images` locally, and see the image pipeline
section of [`AGENTS.md`](../AGENTS.md). `scripts/generate.ts` refreshes the typed public-asset
catalog used by game schemas.

## Detailed documentation

- [Architecture](./architecture.md) - Request flow, structure, tsconfig paths
- [Hosted table](./technical/play-hosted.md) - Game addresses, the native fixture, connection lifetime, provisioning and real-game browser verification, with a ticket pointer per game mechanic
- [Hosted Play subscription](./technical/play-subscription.md) - Received views, local interactions and reconnect ownership
- [Play pointer sessions](./technical/play-pointer-session.md) - Pointer capture, drag thresholds and cancellation ownership
- [Local and hosted multiplayer load runs](./technical/play-load.md) - Bounded local probes, the workload fixture and hosted batch preparation
- [Data Layer](./data-layer.md) - Domain patterns, DB syncing, structure
- [Routing](./routing.md) - Route configuration, file-based routing
- [Authentication](./authentication.md) - Auth patterns, Convex Auth integration
- [User Data Contract](./user-data-contract.md) - What belongs in `users` vs `profiles`
- [State Management](./state-management.md) - Convex live subscriptions, the loader/`initialData` handoff
- [Membership](./membership.md) - Group membership approval flow
- [Deployment](./deployment.md) - Cloudflare Worker deployment process
- [Convex Migrations](./convex-migrations.md) - Required widen/migrate/verify/narrow runbook + CI/deploy guards
- [Stock artwork collections](./technical/stock-artwork.md) - Portrait sets, SVG categories, and adding artwork
- [UI Taxonomy & Ownership](./technical/ui-component-hierarchy.md) - Ownership rules around the canonical taxonomy in `AGENTS.md`
- [UI Design Decisions](./technical/ui-design-decisions.md) - Accepted UI semantics and consistency defaults
