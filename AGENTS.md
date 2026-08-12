<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project Quick Context

- Start with [`docs/README.md`](docs/README.md) for architecture and workflow links.
- Stack: TanStack Router/Query, Convex, Vite, and Storybook.
- Non-obvious workflow: `bun run generate` refreshes generated game data outputs.
- `bun run app:dev` uses the configured online Convex deployment. Add `--local` for the
  disposable Docker-backed environment with local test auth and a cloned production
  snapshot; see `docs/README.md`.

## Worktree Freshness

- Before making any edits in a Codex-managed worktree, run `bun run worktree:setup`.
- This command must fetch the remote before deciding whether the checkout is current. Never treat
  an existing remote-tracking ref as proof that the selected base branch is up to date.
- If the command reports a dirty, attached, or divergent stale checkout, stop and resolve that
  state instead of building changes on the stale base.
- The checked-in `Fresh default branch` Codex local environment runs this preflight automatically
  when a new worktree is created, then installs the frozen dependency graph.

## Component taxonomy

Every component is exactly one of these. The category is the folder; the folder is the Storybook
root. Both stay flat — one level, no nesting. What a caller hands a component decides its category.

| Category | Folder | Caller hands it | It owns |
|---|---|---|---|
| **Content** | `src/app/ui/content` | data | one kind of content, rendered our way — words, a status, a link |
| **Controls** | `src/app/ui/control` | a value + onChange, or an intent | the user changing things — editing a value, committing an action — and the furniture around doing so |
| **Lists** | `src/app/ui/list` | items of one shape | the rhythm between items — sequence, dividers, gaps |
| **Layout** | `src/app/ui/layout` | slots only | where things go — never what they are |
| **Surfaces** | `src/app/ui/surface` | slots for content; words only to name itself | the pane — border, infill, blur. **Surfaces never nest** |
| **Blocks** | `src/app/ui/block` | data; at most one slot for the region it names | turning words into Content components in one fixed arrangement |

**One tree, inside the app.** Every published component lives in `src/app/ui/<category>`, reached
through the `@ui/*` alias. There is no second components directory and no "Application" category or
root. It sits under `src/app` because there is one application and the kit is not a package anyone
extracts — a top-level `src/ui` promised an independence that does not exist.

**One rule guards it: a component renders what it is given; it does not go and get things.** That is
narrower than "domain-free", deliberately. A component may know the *shape* of what it renders — a
`FactionCatalogueEntry` type says exactly that, and types are erased at compile time anyway — and it
may compose a game renderer or a pure helper. What it may not do is fetch, or decide where the reader
goes next, because either one makes it unusable in a story and unusable on a second page. So
[`.oxlintrc.json`](.oxlintrc.json) forbids, inside `src/app/ui`:

- the Convex client in any form, including the relative path to `convex/_generated`;
- **value** imports from a data module by *every* spelling — `@db/**`, `@app/db/**`, `@app/*/db`,
  and the relative forms with or without a `.ts` extension. One alias is not one path: `@db/core`
  and `@app/db/core` are the same file, and it exports a live `ConvexReactClient`.
  `allowTypeImports` keeps `import type` legal, since a type is a statement about what you render,
  not a dependency;
- the router's data and navigation surface — `useRouter` first of all, since it returns the whole
  router with `.navigate()` on it, plus `useLocation`, `useMatch(es)`, `useParams`, `useSearch`,
  `useLoaderData`, `useRouteContext`, `Navigate`, `redirect` and the rest. `Link`, `createLink`,
  `useLinkProps`, `useMatchRoute` and `renderRoot` stay allowed: pointing at a place is
  presentation, going there is a page's decision;
- `@app/shell/**`, `@app/widgets/**` and `@app/routes/**` — direction, not fetching. The shell,
  widgets and routes are built *out of* the kit; the reverse inverts the taxonomy and invites a
  cycle.

Nothing is exempt and no filename marks an escape. An earlier version of this rule banned every
`@app`/`@db`/`@game` import and needed a `*.domain.tsx` suffix to carve out the seven components that
tripped it; every one of those imports turned out to be a type, a renderer, or a pure formatter, while
the one real violation — a list that called `useNavigate` — went unnoticed because the router was not
on the list. The suffix is gone.

Outside the kit:

- **One page's composition belongs in the route file.** Not in a component folder — in the route,
  as local functions. `SignInPanel` lives inside `routes/_app/auth/login.tsx`, with its stylesheet
  as `login.module.css` beside it, because exactly one page signs anyone in. Splitting a long route
  into local functions is encouraged; exporting those pieces as feature components is not, because
  an export invites a second caller that the piece was never designed for.
  - **One page → route. Two or more pages → Widget.** That is the whole ladder for page
    composition, and it runs before any question about categories: a piece with a single caller
    cannot be vocabulary, whatever shape it has.
  - **There is no `src/app/components` at all.** It is deleted, and it should not come back: the name
    was the problem, because anything filed under it looked like a component whether or not it was
    one. What used to sit there went to the place that says what it is — `src/app/ui/<category>` when it
    was really vocabulary, the route when it was page composition, `src/app/sheet/` for the
    document-rendering glue, and `src/app/shell/` for the chrome.
- **The application shell** (`src/app/shell`) — the chrome every page sits in: `AppRoot`
  (the frame and the document-level effects), `AppHeader` (the artwork band), `AppFooter`. Organs by
  classification — nothing outside the folder imports them — but unlike other organs they **do carry
  stories**, filed under a `Shell` root, because the chrome's states are worth looking at and cannot
  be reached from any page's story. It is not a category and never will be: the six are decided by
  what a caller hands a component, and the shell is decided by position. See DD-018 in
  `docs/technical/ui-design-decisions.md` for why the header is neither a Surface nor a Layout.
- **Widgets** (`src/app/widgets/<name>`) — an assembly too domain-specific to be kit and too
  shared to be one page's JSX. Prefab: built outside the page only because two or more routes
  install the identical thing.
  - **Last resort.** A widget exists only when ≥2 routes need the same assembly. One route → it
    is page composition, not a component.
  - **Pages own the data.** A page hands a widget its value and callbacks; a widget never fetches
    and never routes. The day it does, it has become a page fragment wearing a component's name.
  - **Kit all the way down.** A widget adds no new visual vocabulary; anything novel inside gets
    extracted to the kit first.
  - **Organs allowed.** A widget may split its body into private files; nothing outside the
    widget imports them.
  - **The shelf is a metric.** Every widget is a concession. When `src/app/widgets/` grows,
    something upstream went wrong.
- **Game assets** (`src/game`) — print-faithful renderers. Own their colours, never themed. The
  document-rendering glue around them (`src/app/sheet/`, `src/app/capture/`) belongs to this
  world, not to the interface taxonomy. It has composition pieces of its own in
  `src/game/components/block`, filed under `Game Assets/Composition/Blocks`: they reuse the word
  "block" for the same shape — words in, one fixed arrangement out — but they are print vocabulary,
  governed by renderer fidelity rather than by the rules below.

Not everything in a component folder is a component. Types, the theme, and story fixtures are
support modules. **Organs exist at every level, not only inside widgets**: a file whose only
importers are its own feature's or category's machinery is an organ — "organ" *is* its
classification, it needs no story, and nothing outside may import it. The kit has organs of its
own (`BlockHeading`, the depth context); a feature may keep a one-route form as an organ of its
page.

Rules between categories:

- **Only Surfaces paint.** Everything else is transparent; Content marks nothing but its own text.
- **Surfaces never nest.**
- **Only Blocks — and a Surface naming itself — render headings.** Loudness comes from depth,
  never from a prop.
- **Receivers vs producers.** Layouts and Surfaces *receive* built content through slots. Blocks,
  Lists and Content *produce* content from data. Controls *change* data. A component doing two of
  these is two components.
- **Knowledge points one way.** Content knows the theme. Blocks know Content. Lists know their
  item shape. Layouts and Surfaces know nothing about their contents. No component fetches, and none
  navigates on its own behalf.
- **Kind is judged at the membrane.** What a caller hands a component decides its kind; its
  insides are composition, governed by the rules above.
- **Adornments are not slots.** A glyph (`icon`), an action (`action`, `tool`) and hover text stay
  `ReactNode` in every category and never count against a slot budget — they decorate the thing,
  they are not the thing. So a Block may take `icon` and `action` beside the one region it names,
  and framing furniture for a control (`ControlBlock`) is a Control, not a Block.
- **Pages compose; that is where the heavy JSX belongs.** A recurring composition earns a Block
  only when its words can travel as data.

The tells:

- A control promises change; a link promises a place — judge by the promise, not the tag.
- The look is not the contract: a component handed only data is a Block even when it renders
  something pane-like — its artwork is content, not the pane treatment.
- Main content arriving as `ReactNode` → Layout or Surface.
- A string prop becoming a heading → Block, or a Surface naming itself.
- Two components answering the same question → one dies.
- The JSDoc cannot say "callers own X; this owns Y" in one sentence → not a component.

Glyphs (`icon`) and controls (`action`) stay `ReactNode` everywhere — "data" means *the words are
data*. Every component in `src/app/ui` has stories; Mantine components used by
the app get stories too, filed by kind under our theme, indistinguishable from ours. Two kinds of
file are exempt: organs, and a component whose story lives under a sibling's name because the two
only make sense together (`SortableItem` and `SortableReorderHandle` share `SortableDnd.stories.tsx`,
which is why no `SortableDnd.tsx` exists). A rule stated alongside its own violations is not a rule,
so the three components that were missing stories when this was written now have them.

## Shared contracts

`src/shared/**` holds what more than one deploy artifact needs: the Zod schemas and tag vocabularies
the client and the Convex server both parse against, the asset rules the generators and the Worker
both read, and the publisher's diagnostics and font contracts. Import it as `@shared/*` from the app,
and relatively from `convex/` and `workers/`, which sit outside `src` and have no path aliases.

Two boundaries depend on it, and both are absolute because nothing legitimate crosses them any more:
`convex/**` may not import `src/app/**`, and `workers/**` may not either. Before this layer existed
seven convex modules reached into `src/app/*/validation` for shared Zod schemas and the publisher
Worker reached into `src/app/capture` for its diagnostics — so the "server must not import client
code" rule could only be written for one named file, and it never fired. **A rule that has to
tolerate exceptions cannot be enforced; move the exceptions out and then it can.** When you find
yourself widening a guard to fit the code, check whether the code wants hoisting instead.

Moving a file named in `RENDERER_RUNTIME_CLOSURE_PATHS` changes the renderer digest, so
`publisher:release:verify` will report a `renderer-manifest.generated.ts` diff to commit. That is
identity, not staleness: regeneration is driven by the checked-in `renderer_revisions`, which a move
does not touch.

## Validation Convention

Follow the canonical validation guidance in [`docs/data-layer.md`](docs/data-layer.md):

- Convex `v` validators for boundary shape/type checks.
- Shared Zod schemas parsed in Convex handlers (`safeParse`) for authoritative semantic/business rules.
- Client-side parsing only for UX feedback.

Type-safety and testing strategy follows
[ADR-0002 (the confidence stack)](docs/adr/0002-confidence-stack.md): every shape has one
authority and everything else derives from it; seam-level suites cover only what types cannot
express; a few happy-path e2e specs are the confidence anchor. Before adding a test, check
whether a type guarantee or an existing e2e path already covers it. Tests never assert on source
text or dictate API shape ([ADR-0001](docs/adr/0001-contracts-over-expressions.md)).

Before opening or updating any PR that changes application code, publisher code, or release
assets, run `bun run publisher:release:verify`. The publisher Worker contains the application
release, while its Renderer identity intentionally excludes application-only shell and chunk
files. A generated manifest diff must be resolved before push, not discovered by PR CI.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Image pipeline

Raster image sources live in `media/**`; everything under `public/image/**` and
`public/web/**` (except `logo.svg`) is generated output (gitignored). Run
`bun run generate:images` after changing sources or `src/shared/assetRules.ts`
(dev and Storybook need the generated files locally; CI produces the deployed
bytes). `bun run verify:images` checks the output structurally. Renderer
identity hashes the *ingredients* (media bytes + rules + generator + pinned
sharp version), never encoder output — so `publisher:release:verify` remains a
local check. Image keys such as `/image/texture/021.jpg` are opaque asset ids
stored on faction documents; resolve them via the asset resolver, do not treat
them as fetchable URLs (the canonical-name files are fallback safety nets).
