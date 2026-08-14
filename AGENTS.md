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

## Language

The technical vocabulary for this codebase's structure — the words for *how the code is built*.
Product vocabulary (Groups, factions, the catalogue) lives in [`CONTEXT.md`](CONTEXT.md). A term
earns an entry here when it carries an obligation you can check; say the words in prose and
reviews, because a term nobody uses stops retrieving its concept.

**Kit**:
The six-category component vocabulary under `src/app/ui`, reached through `@ui/*`. Domain-free,
story-covered, and never extracted into a package.
_Avoid_: design system, component library — they promise an independence the kit does not have.

**Membrane**:
The surface where a component meets its caller — a bi-directional contract, selectively permeable
both ways: data, slots and values flow in; chosen values and intents flow out through callbacks
(`onChange`, `onPick`). In either direction what crosses is data, never effects — a component may
report "the user picked X," not go and do X. Two rules follow. What passes decides the component's
category: kind is judged at the membrane, and the insides are composition. And there is no traffic
*around* it: a fetch brings data in that the caller never handed over, a navigation sends an effect
out that the caller never receives — both route around the membrane, which is why both are banned.
The Picker is the one
documented fetch exception, and that is why a Picker is domain, never kit, whatever its membrane
resembles.
_Avoid_: interface, API — one-way words that say how to call the thing, but not what flows back
out, or what may never cross at all.

**Organ**:
A file whose only importers are its own feature's or category's machinery. Two obligations, no
exceptions: nothing outside may import it, and it carries no story. A file that gains an outside
importer or a story is no longer an organ — it is vocabulary that needs a proper home.
_Avoid_: internal, private, helper — visibility without the obligations.

**Doorway**:
The one sanctioned import path to something otherwise off-limits. `src/app/db` is the Convex
doorway; `ApplicationChrome` and `AppNotFound` are the shell's. Reach the thing through its doorway
or not at all.
_Avoid_: wrapper, gateway.

**Seam**:
A joint where one implementation can be swapped for another, and therefore where tests attach —
[`src/app/db/core/live.ts`](src/app/db/core/live.ts) is the app–Convex seam, and
[ADR-0002](docs/adr/0002-confidence-stack.md)'s suites are seam suites. Not a synonym for membrane:
a membrane classifies a component by what crosses it; a seam exists to be swapped.

**Chrome**:
The persistent frame `_app` pages sit in (`src/app/shell`); bare renderer and auth routes go
without. Classified by *position* rather than at the membrane — so it is not a kit category — and
its stories and doorway audience are what keep it from being a set of organs.

## Component taxonomy

Every component is exactly one of these. The category is the folder; the folder is the Storybook
root. Both stay flat — one level, no nesting. What crosses a component's membrane — what a caller
hands it — decides its category.

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
    was really vocabulary, the route when it was page composition, `src/app/print/` for the
    document-rendering glue, and `src/app/shell/` for the chrome.
- **The application shell** (`src/app/shell`) — the chrome every page sits in: `AppRoot`
  (the frame and the document-level effects), `AppHeader` (the artwork band), `AppFooter`, and the
  organs behind them (`SiteNavigation`). The shell is chrome, not a set of organs: it has a
  doorway — `routes/_app.tsx` mounts `ApplicationChrome` and `AppNotFound`, and nothing else
  outside the folder imports from it — and its chrome (`AppRoot`, `AppHeader`, `AppFooter`)
  **carries stories**, filed under a `Shell` root, because those states are worth looking at and
  cannot be reached from any page's story. An outside importer or a story alone ends organ-hood,
  which is why only `SiteNavigation` qualifies as one here. The shell is not a category and never
  will be: the six are decided at the membrane, and the shell is decided by position. See *The
  shell is chrome* in
  [`docs/technical/ui-design-decisions.md`](docs/technical/ui-design-decisions.md#the-shell-is-chrome-decided-by-position)
  for why the header is neither a Surface nor a Layout.
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
- **Pickers** (`src/app/pickers/<Name>Picker.tsx`) — the one place a component may fetch, and the
  reason "a widget never fetches" is a rule about *where fetching lives* rather than a blanket ban.
  A Picker is a domain control whose whole job is to let the user choose from a list it loads
  itself — the factions you can load, the users you can assign — and it loads them **lazily and
  read-only**, so a page that renders a "pick a user" control never queries every user up front
  just in case the control is opened. That laziness is the entire justification (the *one Convex query
  per route* subscription discipline: hold no subscription you are not using); a Picker that fetched
  eagerly, or fetched page
  data, or *mutated*, would just be a widget breaking the rule.
  - **The contract.** A Picker fetches only what presenting its own options needs, through reads that
    are torn down when it leaves the screen; it never mutates and never reads the page's data; the
    chosen value leaves through an `onPick`-style callback, and the caller (a route, through a
    widget) decides what happens next — including any mutation.
  - **When it subscribes.** Two shapes. Wrapped in a container that already gates mounting — a
    popover mounted only while open — a Picker subscribes the moment it mounts, because being mounted
    already means the reader signalled intent (`FactionPicker` inside `FactionLoadPopover` is this
    case). Rendered inline with no such gate, a Picker instead defers its subscription to its own
    control's open, since its trigger must stay mounted to be clickable while its options must not
    load until wanted. The inline shape has no instance yet; it lands with its first consumer rather
    than as an unused code path.
  - **Domain, not kit.** A Picker knows *what* it fetches, so it can never live in the domain-free
    kit; it renders *through* the kit (a `Select`, an `AssignPopover`). It is a peer of Widgets, not
    a seventh kit category.
- **Game assets** (`src/game`) — print-faithful renderers. Own their colours, never themed. The
  glue that turns them into documents lives in **`src/app/print/`** and belongs to this world, not
  to the interface taxonomy: `print/sheet/` is the bridge a `Faction` row crosses to reach the sheet
  renderer — it exists because `src/game` may not import `@db`, so something has to do that parse —
  and `print/capture/` is the standalone page the publisher screenshots. The dependency runs one
  way, capture into sheet, which is why the sheet is not filed under capture. It has composition
  pieces of its own in
  `src/game/components/block`, filed under `Game Assets/Composition/Blocks`: they reuse the word
  "block" for the same shape — words in, one fixed arrangement out — but they are print vocabulary,
  governed by renderer fidelity rather than by the rules below.

**A plain module follows the same ladder as a component.** A function, a hook or a type is not
exempt from "one caller → beside that caller; two or more → a home named for its concern" just
because the six categories never claimed it. This is the rule that was missing while `src/app` was
filed by domain, and its absence is what left `access/`, `factions/`, `faq/`, `utils/`, `hooks/` and
`lib/` standing after the data modules moved to `src/app/db` and the validators to `src/shared` —
folders named for a noun or for a file type, holding a formatter here and a one-line type there.
Where they went, and why: `catalogue.ts` and `faqEditingSession.ts` had one route each, so they sit
beside it; `dnd-sortable-ids.ts` had two files in one widget, so it is that widget's organ; the date
formatters and the publishing copy turn data into words, which is Content's job, so they are support
modules in the kit.

**`src/app`'s top level is a closed set**, one entry per role: `db`, `pickers`, `print`, `routes`,
`shell`, `styles`, `ui`, `widgets`, plus `router.tsx` and the generated route tree.
`bun run check:app-layout` fails on anything else, because folders outlive the scheme that created
them and the ones above sat empty-but-alive for months. Adding a role means documenting it here
first. Inside `routes/`, a co-located non-route file takes TanStack's `-` prefix (`-catalogue.ts`) —
without it the router scans the file and warns.

Not everything in a component folder is a component. Types, the theme, and story fixtures are
support modules. **Organs exist at every level, not only inside widgets**: a file whose only
importers are its own feature's or category's machinery is an organ — "organ" *is* its
classification, it carries no story, and nothing outside may import it; gaining either an outside
importer or a story ends the classification. The kit has organs of its
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
- **Layouts own spacing and lay out through named slots.** A Layout arranges its slots; a leaf never
  carries page margin/padding. Every Layout is a custom component built on Mantine primitives that
  takes **named compound slots** (`<TriptychLayout><TriptychLayout.Left>…</TriptychLayout.Left>…`),
  never fewer than two, and is responsive **by container query, not media query** — so it lays out by
  the room it is given. `PageLayout` is the one exemption from the container-query rule: it is the
  shell's page frame, viewport-scoped in concert with `AppHeader` (see *Layouts own spacing* and *The
  shell is chrome* in `docs/technical/ui-design-decisions.md`). `containerQueries.test.ts` guards it.
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
- A wrapper that only renames or lightly forwards a Mantine component → not a component. Use Mantine
  directly, and extract only when there is a concern to own.

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
and relatively from `convex/` and `workers/`. Use relative imports there deliberately, not because
aliases are unavailable: `workers/` has its own tsconfig with no `paths`, so it genuinely cannot
resolve `@shared`; `convex/` has no tsconfig of its own and falls under the root one, so it *does*
resolve `@shared` (and `@game`) today — but Convex's generated `convex/tsconfig.json` template
carries no `paths`, so the day `convex codegen` writes that file every alias in `convex/` breaks at
once. Relative paths are the spelling that survives that, and keeping both artifacts on the same
convention keeps the rule simple.

Three boundaries keep the browser app out of the shared layer, all absolute because nothing
legitimate crosses them. Two guard it from outside: `convex/**` may not import `src/app/**`, and
`workers/**` may not either. The third guards it from inside: `src/shared/**` may not import the
browser app (`@app`/`@ui`/`@db`, or a relative `../app/…`). That last one is the positive counterpart — if a shared file needed something
from `src/app`, that thing would not actually be shared — and its lint pattern is written for the
spelling a file *inside* `src` uses to reach the app (`../app`), not the `../src/app` spelling the
outside artifacts use; copying the outside pattern verbatim would have matched nothing and passed
silently. Before this layer existed seven convex modules reached into `src/app/*/validation` for
shared Zod schemas and the publisher Worker reached into the app's capture folder for its
diagnostics — so the "server must not import client code" rule could only be written for one named
file, and it never fired. **A rule that has to tolerate exceptions cannot be enforced; move the
exceptions out and then it can.** When you find yourself widening a guard to fit the code, check
whether the code wants hoisting instead.

And the boundary runs the other way too: `convex/**`, `workers/**` and `src/shared/**` may not
import `src/game` (`@game`, or a relative reach). The renderers are browser-only; nothing the server
or the shared layer needs lives among them. This became enforceable only once the faction contract —
a Zod schema five Convex modules parse against — moved out of `src/game/schema/` to
`src/shared/factions/schema.ts`, taking its generated asset-id vocabulary (`src/shared/assetIds.ts`)
and its shared test fixture (`src/shared/factions/fixtures/`) with it. Before that move a universal
contract sat in a folder named for renderers, and the `.oxlintrc.json` message already claimed
"a Zod schema … belongs in `src/shared/`" while the code did not; the move made the claim true and
the ban possible, with zero exceptions. The shared side of the ban is written `**/game/**` (the
`../../game` spelling a file inside `src` uses), not `**/src/game/**` (the outside spelling) — the
same vacuous-pattern trap as the app ban.

`src/game` also has its own inward fence, `src/game/rendererIsolation.test.ts`, which forbids
Mantine, Radix, and any reach into the app — by alias or by relative climb. It is a test rather than
a lint override because it also bans framework packages a `no-restricted-imports` group would not
naturally express.

## The Convex doorway

`src/app/db` is the only place in `src/**` that may import Convex — the generated API, the types
under `convex/lib`, and the `convex` package itself. Everything else takes what it needs from the
domain module that owns it, which re-exports the Convex shapes the app uses (`AssignedGroupSummary`
from `@db/groups`, `PublicAssetPublishingStatus` from `@db/factions`).

The rule is mostly about keeping one import path, but one of the two modules that had opened a
second one showed the sharper cost. Each page query narrows its access type per kind —
`Extract<CollaborativeAccess, { kind: 'faction' }>` — and `src/app/access/viewerActions.ts` reached
past that to `convex/lib` for the *wide* `CollaborativeAccess`, took it as possibly-`undefined` with
a `subjectGroupId: unknown` beside it, and re-narrowed at runtime with a `kind !== 'group'` check its
three callers had already settled statically. The other module imported two string-literal unions
and cost nothing but the second path. `no-restricted-imports` enforces this for all of `src/**`
except `src/app/db/**`.

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
