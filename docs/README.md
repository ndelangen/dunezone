# Documentation

Quick reference for understanding and working with the codebase.

## TypeScript source

Maintained scripts, tests, mocks and Convex generated modules use TypeScript. `convex.json`
selects TypeScript code generation. The pinned Convex patch replaces the generator's explicit
`any` annotations with function-kind unions and preserves its generated API casts through
`unknown`. Keep the patch aligned with Convex upgrades and regenerate with `convex codegen`.

Storybook compiles `workers/storybook/story-images.sw.ts` during development and builds, then
serves it at `/story-images.sw.js`. The source has a separate strict WebWorker type check in
`bun run typecheck`. Both Storybook runners resolve the package mocks to their `.ts` sources.

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

**Code-health reports?** [`technical/code-health.md`](./technical/code-health.md) explains the automatic source, mutation, repository-security and dependency checks, where their findings appear, and the free configuration.

## Key commands

Node is pinned in [`.nvmrc`](../.nvmrc).
Run `nvm use` before installing dependencies; CI reads the same pin.

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
bun run test             # Unit, seam and script tests; the Worker suites run through game:test and publisher:test
bun run test:browser-launch # The script tests that launch Chromium, named in browser-launch-tests.ts; CI runs them in browser_checks
bun run storybook:test:shard <shard> # One CI shard of the story suite, named in .storybook/shards.json
bun run storybook        # Storybook dev (port 6006)
bun run build-storybook  # Static Storybook → storybook-static
bun run verify:storybook-publication # Public bytes, headers, isolation, and browser runtime
bun run generate         # Regenerate the asset-id vocabulary and normalized vector crops
bun run publisher:release:verify # Exact pre-PR publisher build, manifest, and dry-run gate
```

`bun run typecheck` uses the native TypeScript 7 compiler from `@typescript/native`. The
`typescript` 6.x development dependency remains intentionally installed because Storybook's
React Component Meta integration still imports the legacy compiler API; it is not the compiler
used by the application or publisher typecheck scripts.

Raster sources are recorded in `media/raster.lock.json`, and the app imports the colour map
derived from it, `src/shared/media/map.generated.ts`. Both are committed; run `bun run media:sync`
after adding or changing a raster under `media/`. `bun run media:lock` only rewrites the map after an
encoder or rules change, and refuses new or changed originals.

The pinned Fiber patch removes its ambient Three JSX declarations from React's namespaces.
Those declarations make even a DOM `React.ElementType` enumerate Three's catalogue, which
stalls the native checker. Play's scene files opt into a tabletop-owned
[`three-jsx` runtime](../src/app/widgets/tabletop/three-jsx/jsx-runtime.ts) instead.
It exports React's unchanged runtime functions and keeps the exact Three prop types local.
The colocated typecheck fixture checks valid and invalid Three props, Mantine attributes,
and the DOM namespace together. No files are excluded from typechecking.
Replace the patch and local runtime together when Fiber provides an upstream scoped JSX entry.

The Bun patch for `three@0.186.1` releases renderer resources when the Play table rebuilds pieces.
The patch keeps renderer-owned disposal listeners from retaining old renderers, follows geometry
replacement, and releases cached vertex arrays when the WebGL2 fallback destroys their buffer.
It also removes OrbitControls keyboard listeners from the document that originally received them.
Three 0.186 now removes destroyed bind groups itself, so that part of the old patch is gone.
The patch covers `build/three.webgpu.js`,
`build/three.webgpu.nodes.js` and the matching `src/` files.

The Storybook React 10.6.1 patch uses an asynchronous `act` callback when unmounting a story.
Its test environment flag then stays enabled until React drains the cleanup work. A synchronous
callback restores the flag before the awaited cleanup finishes, so Fiber reports an unsupported
act environment during later stories. The two-story Play table loop reproduces the warning.
Remove the patch when Storybook uses an asynchronous unmount callback itself.

The Floating UI 1.8.0 patch coalesces positions requested by `ResizeObserver` into the next
animation frame. Updating a portalled tooltip inside resize delivery can change its wrapping and
leave undelivered notifications in the same browser cycle. Initial placement and scroll updates
still run immediately. Cleanup cancels both pending resize updates and floating-element
reobservation. The installed-package regression checks scheduling, coalescing and disposal; the
Faction Special Rule and board editor stories cover the original browser failures. Remove the
patch when Floating UI provides the same resize scheduling and cleanup.

The `miniflare` entry in `package.json` `overrides` moves only miniflare's own `undici` to 7.30.0,
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
table keeps. Without a draft a Rulebook's editor cannot open, so the load gives every Rulebook a draft
that holds its current Edition as the public reader shows it, saved by the placeholder owner.
Both the snapshot and the seeded draft use that Edition's settings and Contents together. An
Edition without stored settings uses the A4 illustrated defaults, never private draft settings.

Without `--snapshot-file <zip>`, the launch downloads the newest snapshot that the `Anonymised
snapshot` workflow uploaded from `main`, using the GitHub CLI (`gh auth login` first). It ignores an
artifact of that name from any other workflow, event, branch or fork, and one from a run that did
not succeed. The download goes to the launch's private temporary directory, and the launch deletes
it as soon as the import finishes or fails. Nothing is cached between launches. The workflow runs weekly and
keeps each upload for eight days, so the newest is usually under a week old (after a failed Monday run the previous upload lasts about one more day, then none is left until the next Monday's run or a manual dispatch), and it uploads only while its `SNAPSHOT_UPLOAD` switch is `"true"`. With no
artifact, or when GitHub cannot be reached, the launch stops before Docker starts and points at
`--data=fixture`.

Before Docker starts, and again before importing, the launch checks the file. It needs the
anonymiser's manifest and, in every table, the row count the manifest records. It needs rows in
`factions` and the placeholder owner's row alone in `users` and `profiles`, refuses any other table
the policy does not keep, and needs a clean leak scan. So a raw export never loads by mistake, and
neither does a file the snapshot rebuild contract would reject after the import. The check does not
apply the policy's field and row rules to the kept tables again. The import uses `--replace-all`, which empties every table the
snapshot leaves out. The load then seeds the Rulebook drafts, and the snapshot rebuild contract checks
that those tables are empty, that every live Rulebook has its draft, and that `users` and `profiles`
hold the placeholder alone. The seed runs only while the placeholder is the deployment's one account,
so production, which holds real accounts, refuses it. The snapshot carries no migration
state or aggregates; the migration guards that every launch runs rebuild both. The contract lives in
[`convex/lib/provisioningContract.ts`](../convex/lib/provisioningContract.ts). Pass
`--snapshot-file` to load a file you already have, such as one the anonymiser CLI wrote from a
synthetic export; the launch leaves that file where it is.

No command loads raw production data outside production. The only command that exports production
is the weekly snapshot job's script. It refuses to run outside a GitHub
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
clears dev, pushes main's functions, imports the snapshot, seeds the Rulebook drafts, checks the
snapshot rebuild contract and runs the migration guards. It needs only `CONVEX_DEV_DEPLOY_KEY`, and it never exports
production. A bare `bun run provision local` intentionally refuses to run: the local users stage
needs the running app, so the complete local environment always comes from
`bun run app:dev --local`. With explicit `--stage` flags, its data stage clears the application
tables as the e2e target does; the snapshot load belongs to `app:dev --local` alone.

### Keeping the cloud dev deployment usable

`deploy-main` calls `Sync dev deployment` after production ships. Each release pushes main's
functions and runs outstanding migrations against dev's existing data. Completed migrations keep
their progress and are skipped. A failed push or migration fails the job without clearing data or
exporting production. Schema changes follow the same widen, migrate, verify and narrow sequence
as production. If dev missed a prerequisite release, recover it explicitly before narrowing.

Every Monday at 05:17 UTC, `Anonymised snapshot` exports production once, anonymises and scans it,
uploads the published-only snapshot for local development, then refreshes cloud dev from that same
file. The refresh verifies the snapshot before clearing dev, pushes the selected release, imports the snapshot,
seeds Rulebook drafts, checks the rebuild contract and rebuilds derived data through the migration
guards. It holds only the dev deploy key; the export step alone holds the production key. The snapshot pins the last successful production release and requires both Workers to report that
commit. It shares the production deployment lock for the whole export and refresh, which also covers its called dev sync. The queue retains waiting runs. A failed production release must
be completed before a snapshot refresh can start.

The weekly refresh replaces dev-side experiments and sign-in accounts. To recover dev sooner, run
`Anonymised snapshot` manually from main. It performs the same export and refresh. Retry a failed dev sync job from its `Deploy production` run to retry code and outstanding migrations.
A stale run refuses to overwrite dev after production has advanced. A failed snapshot
verification leaves dev's data intact; a failure after the reset remains visible for recovery.

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

## Common workflows

### Reviewing visual changes

[Chromatic](https://www.chromatic.com/builds?appId=6adb5f9c3d9925e3217df200) captures the Storybook
stories on pushes to `main` and on pull requests that are ready for review, once when a draft is
marked ready and again on each later push. Drafts get no Chromatic build, because every build bills
snapshots. On a pull request the build starts only after every other PR CI job has passed, so a
failing run is never captured. Manual runs from GitHub Actions are supported. The workflow generates
the media, builds and verifies the public Storybook, then uploads that artifact with the pinned
Chromatic CLI. The `CHROMATIC_PROJECT_TOKEN` repository secret is available only to the token
check and upload steps. Keep it out of source files and command-line arguments.

Review and accept intended visual changes in Chromatic. Visual differences leave the workflow
green so an expected UI change does not fail the upload job; rendering and interaction failures
still fail it. No branch automatically accepts changes. Chromatic runs separately from the
required `ci_ok` check, and its visual review checks report through the GitHub integration.
Fork pull requests do not receive this repository's token and get no Chromatic build.

Stories come in two kinds. A presentation story shows a state, and Chromatic captures it. A testing
story drives behaviour: it clicks, types or delivers, or its play runs for seconds. Its file builds its
meta from `testingPreview` (exported by `.storybook/preview.tsx`) instead of the default preview. That
preview turns Chromatic snapshots off for the whole file. Its plays still run in
the Vitest story shards on every pull request, and the stories stay in Storybook. Each CSF file renders
with the preview its meta came from, so a file holds stories of one kind only.

A file that has stories of both kinds is split into a pair: `name.stories.tsx` keeps the presentation
stories and `name.testing.stories.tsx` holds the testing ones under the same `title`, so both appear in
one Storybook entry and keep their story ids. Helpers both files use live in `name.stories.fixture.ts(x)`.
A handful of stories under review still carry a per-story `parameters.chromatic.disableSnapshot: true`.
A new capture failure still fails the workflow. A play that outruns Chromatic belongs in a testing file.

For a local upload, generate the media as described below, set `CHROMATIC_PROJECT_TOKEN` in your
environment, and run `bun run chromatic`. To upload an existing verified build instead, run
`bun run chromatic --storybook-build-dir=storybook-static --zip`.

TurboSnap is configured with `onlyChanged: true`. Storybook builds emit `preview-stats.json`,
and the upload workflow requires that dependency graph. Once Chromatic unlocks TurboSnap after
ten completed CI builds, it captures affected stories and copies unchanged snapshots from their
baselines. Before that, Chromatic falls back to full captures. The account's snapshot allowance
still applies.

Changes to static assets, media-generation inputs, build configuration and helpers, dependencies,
and either Storybook worker force full captures. The Convex worker builds separately, so its
backend and shared source inputs also force full captures. Keep the `externals` list in
`chromatic.config.json` aligned with those inputs. No dependencies are excluded from tracing
with `untraced`.

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
- Rulebook stories have three homes: `Document` for whole books, sizes and styles; `Page` for layouts,
  covers, Page details and compositions of several Blocks; `Blocks/<subject>` for one authored Block
  kind. A subject keeps its `Rendered` and `Editing` examples together, with one story file owning
  each leaf. Error states stay beside the subject they affect. Do not create feature-batch groups.
- Isolated Rulebook editors use `rulebook*Edit.stories.tsx` beside the editing route. Their explicit
  registration places them under Rulebook and excludes that filename convention from Pages.
  Full application route stories remain under Pages. Renderer stories stay in `src/game/rulebook`;
  sidebar proximity never requires a renderer to import app code.
- Prefer args-only stories. Use wrappers, custom rendering, or interactions only when they
  demonstrate behavior or comparison that args cannot.
- CI runs the story suite as four shards, balanced by measured file time and defined as prefix
  rules in [`.storybook/shards.json`](../.storybook/shards.json): a story file belongs to the first
  shard whose prefix matches it, and the last rule is a catch-all, so a new file lands in a shard
  without a list edit. `bun run storybook:test:shard <shard>` runs one shard locally, and
  `scripts/storybook-shard.test.ts` fails when a file matches no shard or a shard owns nothing.
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

The Bun patch for `@storybook/tanstack-react@10.6.1` forwards the mocked Link's ref to
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
over another group. `Playing / Controls` is a story, not a folder for a lone Spice story.
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

2. Create the domain data module `src/app/db/<domain>.ts`, reached as `@db/<domain>`:
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
   - `_app/about.route.tsx` → `/about`
   - `_app/users/$userId/index.tsx` → `/users/:userId`

   Only `index.tsx` and a file whose last dot-segment is `route` are routes; every other file in a
   route folder is a co-located module. See [Routing](./routing.md#which-files-are-routes).

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
`media/**`: vectors are in git, raster originals are in R2 and listed in `media/raster.lock.json`
(#1888). `bun run media:sync` downloads them into `media/` and uploads new or changed ones.
Everything under `public/m/**`, `public/image/**` and `public/web/**` is generated output and
gitignored, apart from the committed files named in `COMMITTED_WEB_FILES`
(`src/shared/assetRules.ts`). Run `bun run generate:images` locally, and see the image pipeline
section of [`AGENTS.md`](../AGENTS.md) and the [media runbooks](./technical/media-runbooks.md). `scripts/generate.ts` refreshes `src/shared/assetIds.ts`,
the typed public-asset catalog used by game schemas, and `src/shared/media/vectorCrops.generated.ts`,
the geometry used to fit illustrations after square normalization.

Persistent authoring reviews can keep local data, auth and publishing artifacts across restarts. See [Persistent local review](./technical/persistent-local-review.md) for the explicit launcher flags and reset scope.

## Detailed documentation

- [Architecture](./architecture.md) - Request flow, structure, tsconfig paths
- [Hosted table](./technical/play-hosted.md) - Game addresses, the native fixture, connection lifetime, provisioning and real-game browser verification, with a ticket pointer per game mechanic
- [Play operations](./technical/play-operations.md) - What Play monitoring watches, where alerts go, and what to check and do for each failure
- [Hosted Play subscription](./technical/play-subscription.md) - Received views, local interactions and reconnect ownership
- [Play pointer sessions](./technical/play-pointer-session.md) - Pointer capture, drag thresholds and cancellation ownership
- [Local and hosted multiplayer load runs](./technical/play-load.md) - Bounded local probes, the workload fixture and hosted batch preparation
- [Data Layer](./data-layer.md) - Domain patterns, DB syncing, structure
- [Routing](./routing.md) - Route configuration, file-based routing
- [Authentication](./authentication.md) - Auth patterns, Convex Auth integration
- [Content security policy](./content-security-policy.md) - Browser resource origins, inline scripts and cached HTML delivery
- [User Data Contract](./user-data-contract.md) - What belongs in `users` vs `profiles`
- [State Management](./state-management.md) - Convex live subscriptions, the loader/`initialData` handoff
- [Membership](./membership.md) - Group membership approval flow
- [Deployment](./deployment.md) - Cloudflare Worker deployment process
- [Convex Migrations](./convex-migrations.md) - Required widen/migrate/verify/narrow runbook + CI/deploy guards
- [Stock artwork collections](./technical/stock-artwork.md) - Portrait sets, SVG categories, and adding artwork
- [Media runbooks](./technical/media-runbooks.md) - A deploy that stops on a variant conflict, forward recovery from bad art or a bad release, and losing the upload token
- [UI Taxonomy & Ownership](./technical/ui-component-hierarchy.md) - Ownership rules around the canonical taxonomy in `AGENTS.md`
- [UI Design Decisions](./technical/ui-design-decisions.md) - Accepted UI semantics and consistency defaults
