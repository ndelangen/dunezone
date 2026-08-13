# UI design decisions

This log records durable UI decisions and, more importantly, **why they exist**. The rules
are canonical in [`AGENTS.md`](../../AGENTS.md), in a guard, or in the code that carries them; this
log is the reasoning behind them — the incidents that earned each rule.

## How to use this log

- **One rule, one home.** Every live rule has exactly one *normative* home — usually `AGENTS.md` or a
  guard, sometimes the code that carries it (`theme.ts`, `TopicIcon.tsx`), and for the few not yet
  lifted into `AGENTS.md` (action semantics, the one-query rule) this log *is* that home. An entry
  here records the *why*; where it names the rule, it is a one-line pointer tagged with the canonical
  home (`Rule (stated in AGENTS.md): …`), never a second authority you could edit in isolation. Two
  editable copies of one rule is the thing this forbids.
- **The war story survives.** When entries merge, or a rule moves to `AGENTS.md`, the incident that
  motivated it is kept. A rule without its story loses its strength — a reader who cannot see what
  went wrong cannot tell whether the rule still applies.
- **`Status: superseded` entries are history, not instructions.** They are kept to explain how the
  current rules came to be, and they still name paths and components since deleted (`generic/ui`,
  `form/**`, `UIButton`, `Block`, `*.domain.tsx`). Do not follow them; read the entry that replaced
  them. History lives at the bottom.
- **Numbers are permanent anchors.** Entries are cross-referenced by number; a merged or superseded
  entry keeps a stub so its number still resolves.
- Renames are applied throughout so a symbol stays searchable; substance is never quietly rewritten.
  `AppShell` → `AppRoot`; the header it owns is `AppHeader` (DD-018).

## What applies now

The live rules at a glance, each pointing at its canonical home and its guard. Nothing here restates
a rule; it indexes them. `[M]` machine-enforced · `[D]` documented-only · `[C]` code contract.

| Live rule | Canonical home | Guard | Why (DD) |
|-----------|----------------|-------|----------|
| A component renders what it is given — no Convex, no `@db` value, no router-nav, no shell·widgets·routes | `AGENTS.md` component taxonomy | `[M]` `.oxlintrc.json` `src/app/ui/**` | DD-020 |
| A widget never fetches | `AGENTS.md` (Widgets) | `[M]` `.oxlintrc.json` `src/app/widgets/**` | DD-020, DD-021 |
| Pickers — the one place a component may fetch: its own options, lazy, read-only | `AGENTS.md` (Pickers) | `[C]` structural (`check:app-layout` slot; absence from the ui/widget bans) | DD-021, DD-013 |
| Six-category taxonomy; folder = category = Storybook root | `AGENTS.md` component taxonomy | `[M]` `check:app-layout` (top slot only); rest `[D]` | DD-017 |
| The shell is chrome, not a category | `AGENTS.md` (application shell) | `[M]` `check:app-layout` + the `data-page-layout-*` contract | DD-018 |
| Layouts own spacing; named compound slots; container queries not media; ≥2 slots | `AGENTS.md` (Rules between categories) | `[M]` `containerQueries.test.ts` (the container-query half) | DD-003 |
| Every terminal `_app` route mounts `PageLayout`; the leaf owns composition | `AGENTS.md` (routes) | `[M]` `PageLayout.architecture.test.ts` (mount check) | DD-014 |
| At most one Convex page query per route, plus `useCurrentProfile` when auth-aware | this log (`AGENTS.md` cites it by name) | `[D]` (`check:convex-skip` is an *adjacent* rule, not this one) | DD-013 |
| Action semantics — icon-only buttons, one styled toolbar primary, colour by intent | this log | `[D]` (the kit carries it: `IconAction`, `CallToAction`, the theme tuples) | DD-005 |
| Recurring topics use one canonical icon mapping | this log (`TopicIcon.tsx` is the code home) | `[D]` | DD-016 |
| Extract a component only at a real concern boundary | `AGENTS.md` (the membrane tells) | `[D]` | DD-009 |
| No CSS `composes`; one TSX owner per stylesheet | `docs/technical/ui-component-hierarchy.md` (Styling) | `[M]` `check:css-orphans` (orphans/unimported only) | DD-004 |
| Renderers stay isolated (no Mantine/Radix/app reach) | `AGENTS.md` (game assets) | `[M]` `rendererIsolation.test.ts` | DD-015 |

---

## Active decisions

### DD-003: Layout components own spacing, and lay out through named slots
- Status: accepted
- Context: Margin-led spacing scattered through leaf components produces inconsistent layout and
  buries every page in nested `<Stack><Group><Grid>…`. The original rule — parent-owned spacing,
  flex+`gap`/grid — was only half-retired by DD-015: DD-015 replaced the specific legacy
  `generic/layout` *wrappers* with Mantine's `Stack`/`Group`/`Grid`, but stated in the same breath
  that "parent-owned spacing remains useful". This entry reinstates that surviving principle and
  strengthens it into a Layout-component discipline, because the kit had already grown custom
  layouts (`PageLayout`, `TriptychLayout`, `AtlasLayout`, `AsymmetricSplitLayout`) with no rule
  written down for them.
- Rule:
  - **Spacing is owned by the Layout, not the leaf.** A leaf control never carries page
    margin/padding; a Layout arranges its slots. Margin only for unavoidable third-party constraints.
  - **Layout components are custom, built on Mantine primitives.** A recurring layout situation
    becomes a named component so a page composes `<TriptychLayout>` instead of re-nesting flex/grid
    at the call site.
  - **Responsive by container query, not media query.** A Layout lays out by the room it is given,
    so it stays context-independent. Guarded by
    [`containerQueries.test.ts`](../../src/app/ui/layout/containerQueries.test.ts).
  - **Every Layout lays out through named slots**, as compound children —
    `<TriptychLayout><TriptychLayout.Left>…</TriptychLayout.Left>…</TriptychLayout>` — so the
    composition reads top-down and large content never rides inside a prop value.
  - **No single-slot Layout.** One slot is a passthrough, not a layout; a Layout earns its existence
    by arranging two or more.
- Examples:
  - `PageLayout` (`.Header`/`.Toolbar`/`.Content`), `TriptychLayout` (`.Left`/`.Center`/`.Right`),
    `AtlasLayout` (`.Sidebar`/`.Content`), `AsymmetricSplitLayout` (`.Wide`/`.Narrow`).
- Exceptions:
  - **`PageLayout` uses `@media`, not a container query, and it is the one exemption.** It is the
    shell's page frame — its children join `AppHeader`'s grid through `display: contents`, and it is
    sized against the viewport in concert with the shell through the `data-page-layout-*` bridge
    (DD-018). It is genuinely viewport-scoped, not a container. The guard excepts it by name.
- Changed on: 2026-08-13

### DD-004: One owner per stylesheet — no CSS `composes`
- Status: accepted in part — DD-004's first half ("avoid custom CSS") is superseded by DD-015; this
  live remnant keeps its why. The rule lives in the Styling section of
  [`ui-component-hierarchy.md`](./ui-component-hierarchy.md).
- Context: `composes` pulls declarations across module boundaries, so the stylesheet a rule actually
  comes from stops being greppable and two files quietly co-own one class. The original "avoid custom
  CSS, prohibit `composes`" rule lost its first half when Mantine became the default (DD-015); the
  second half survived on its own merit.
- Rule (stated in `ui-component-hierarchy.md`): no CSS `composes`; exactly one TSX component owns each
  `.module.css`. Share through the component, not the stylesheet.
- Why (the derivation worth keeping): ownership you cannot grep is ownership that drifts — the same
  failure the kit boundary (DD-020) and the taxonomy (DD-017) guard against, applied to styles. A
  reader must be able to open one TSX file and see every rule that styles it.
- Provenance: **pre-emptive** — a discipline, no incident. `check:css-orphans`
  ([`assert-no-orphan-css-classes.mjs`](../../scripts/assert-no-orphan-css-classes.mjs)) catches
  orphaned/unimported stylesheets only; the one-owner rule itself is documented.
- Changed on: 2026-08-13

### DD-005: Action semantics — icon-only buttons, one toolbar primary, colour by intent
- Status: accepted (absorbs DD-006 and DD-007)
- Context: Actions become unpredictable when their meaning is carried by hue rather than intent, when
  a toolbar has several competing "primary" buttons, or when an icon-only control has no explicit
  semantics. Three earlier entries (DD-005/006/007) each stated part of this and overlapped on
  "confirm-colour for the positive primary"; they are one concern and are combined here so the rule
  is stated once.
- Rule:
  - **Colour by intent, then style.** Positive primary actions take the `confirm` colour; destructive
    actions take `red` (the Dune danger tuple); neutral/auxiliary actions stay the default colour and
    vary by Mantine `variant`, never by hue. The map is the code, in
    [`theme.ts`](../../src/app/ui/theme.ts) — do not re-type it here.
  - **One primary per toolbar.** A multi-action toolbar keeps exactly one clear positive primary,
    styled `confirm`; secondary and utility actions drop to `default`/`subtle`.
  - **Icon-only for established actions only.** Use an icon-only button for a common, recognizable
    action with explicit intent and an accessible label (`aria-label`); if the icon would be
    ambiguous, use a text-labelled control.
- Examples:
  - The kit carries this at the call site: `IconAction` for icon-only actions, `CallToAction` for the
    forward-moving primary. `StatusBadge` has its own tone scale (including `critical`) for *state* —
    that is not an action vocabulary.
- Exceptions:
  - A non-`confirm` primary, or a product-directed visual override, is allowed only with explicit
    product/user direction.
- Changed on: 2026-08-13 (combined from DD-005/006/007, originally 2026-03-25)

### DD-009: Extract a component only at a real concern boundary
- Status: accepted (absorbs DD-012)
- Context: Splitting JSX into "helper" components without a clear responsibility boundary produces
  prop bloat, indirection, and harder reasoning for no reuse. **The war story:**
  `RulesetGroupToolbarControl` was extracted from the ruleset detail page's toolbar row — but it was
  a slice of one page's layout, not a component. To render anything it needed ~11 props, every one a
  mirror of the route's own state (`rulesetId`, `rulesetName`, `groupId`, `groupSlug`, `groupName`,
  `isOwner`, `membershipStatus`, `canRequestMembership`, `onRequestMembership`, `canEditGroup`,
  `onChangeGroup`). The route computed all of it and threaded it down; the "component" handed it
  straight back. No encapsulation, one caller, and to understand one toolbar you now read two files.
  It was inlined. (DD-012's rule and this incident; DD-009's earlier "prefer small components" folds
  in here — one is the generic form of the other.)
- Rule: Extract a component only when it is a real **concern boundary** — a behaviour or domain
  concept with a small, meaningful API — not merely a sub-section of one page's layout. A view-only
  sub-view stays inline in the route, or becomes a **local helper function** in the same file, never
  an exported feature component. This is the same test the taxonomy states at the membrane in
  `AGENTS.md`: *the JSDoc must be able to say "callers own X; this owns Y" in one sentence.*
- Examples:
  - Good: a picker that owns pick-and-search over `assignableGroups` behind a small API
    (`disabled`, `options`, `onAssign`) — it owns a concern.
  - Bad: a `*ToolbarControl` that renders one page's toolbar row and needs a dozen props mirroring
    route state; or a long JSX block moved to a file without reducing responsibility or API surface.
- Changed on: 2026-08-13 (combined DD-009 + DD-012, originally 2026-04-01)

### DD-013: One Convex page query per route, plus optional profile
- Status: accepted
- Context: Mounting several `useQuery` hooks on one route multiplies live subscriptions, complicates
  loading states, and scatters the authoritative shape of a screen across Convex functions. This
  session reaffirmed it as the *real* reason a widget does not fetch and a Picker fetches only its
  own options lazily (DD-020, DD-021): the principle protected is **subscription discipline** — hold
  no subscription you are not using, keep one authoritative shape per screen.
- Rule: Each route subscribes to **at most one Convex query for page data**, plus **`useCurrentProfile`
  when the UI is auth-aware**. Derive UI-ready fields inside that query rather than adding child
  subscriptions. `AGENTS.md` and the state-management doc point at this entry by name for the *why*.
- Examples:
  - Bundle what a page needs into one query (a ruleset `detailPageBySlug` carrying FAQ, viewer
    access, owner, and assignable-group summaries).
  - Pass server-derived collections into controls (e.g. a Picker's options) instead of a child
    subscription.
- Exceptions:
  - Mutations do not count. Intentional lazy loading — a Picker's own options — requires the explicit
    call-out its docstring provides. See DD-021.
- Provenance note: **`check:convex-skip` does not enforce this rule.** That guard bans `useQuery("skip")`
  inside `src/app/db` — an adjacent, narrower concern whose own header states a *preference* and names
  no incident. The one-query rule has no guard — it is documented-only. (`check:convex-skip` is pre-emptive as its own, separate rule.)
- Changed on: 2026-04-04

### DD-014: Leaf routes own page composition
- Status: accepted — rule now in `AGENTS.md` (routes); this entry keeps the why
- Context: A parent-owned `staticData.PageHead` bridge split one screen into detached header and
  body sub-views, duplicated the page subscription, and hid the whole composition across router
  metadata and the app shell. **That incident is why the rule exists.**
- Rule (stated in `AGENTS.md`): every terminal `_app` route renders `PageLayout` directly, supplying
  its `Header`/`Toolbar`/`Content` slots (DD-003) alongside its content; nested route parents are
  outlet-only; `AppRoot` owns only persistent chrome and document effects. Do not reintroduce router
  metadata or a parent shell to move header content upward.
- Provenance: **earned** — by the `PageHead` bridge above. Enforced by
  [`PageLayout.architecture.test.ts`](../../src/app/ui/layout/PageLayout.architecture.test.ts), whose
  surviving assertion (every terminal route mounts `PageLayout`) is a structural check in the ADR-0001
  style: it forecloses the earned incident but names no incident of its own.
- Changed on: 2026-07-18

### DD-015: Renderers stay isolated
- Status: accepted in part — DD-015's pivot (Mantine owns standard content) is itself superseded by
  DD-017; the renderer-isolation remnant is live and keeps its why. The rule lives in
  [`AGENTS.md`](../../AGENTS.md) (game assets).
- Context: When the generic UI system was retired, game-asset renderers were deliberately walled off
  from it. A renderer that reaches into Mantine, Radix, or app code stops being portable — the same
  asset must paint identically in a worker, in print, and in the browser, and none of those load the
  app shell.
- Rule (stated in `AGENTS.md`): renderers import no Mantine, no Radix, no `src/app`; they are pure
  over their inputs, with no thin wrappers around app UI leaking in.
- Why (the derivation worth keeping): isolation is what lets one renderer serve three deploy targets;
  a single app import would couple print and worker output to the browser bundle.
- Provenance: **earned** — by the coupling the generic system caused. Enforced by
  [`rendererIsolation.test.ts`](../../src/game/rendererIsolation.test.ts).
- Changed on: 2026-08-13

### DD-016: Recurring topics use one canonical icon mapping
- Status: accepted
- Context: The same topic appeared with different icons between the faction editor and the detail
  pages, weakening recognition.
- Rule: Render recurring topic icons through `TopicIcon`; the faction editor's mapping is
  authoritative and lives in the code, [`TopicIcon.tsx`](../../src/app/ui/content/TopicIcon.tsx) —
  read it there rather than trusting a copy here.
- Exceptions:
  - A one-off topic without a canonical mapping may keep a local icon until it recurs or gets product
    direction. Renderer-owned game visuals stay isolated and do not consume `TopicIcon`.
- Changed on: 2026-07-20

### DD-017: The component taxonomy governs all interface components
- Status: accepted — rule now in `AGENTS.md`; this entry keeps the why
- Context: DD-015 made Mantine the only sanctioned shared layer, so recurring concerns (the pane
  treatment, titled regions, heading levels) were re-spelled at every call site and drifted. **That
  drift is why** a domain-free kit was rebuilt deliberately, category by category, with a rule for
  what may live in each.
- Rule (canonical in [`AGENTS.md`](../../AGENTS.md#component-taxonomy)): six categories under
  `src/app/ui` — Content, Controls, Lists, Layout, Surfaces, Blocks — each decided by what a caller
  hands the component; the category is the folder and the Storybook root; feature folders keep only
  organs; Widgets are the last-resort shared assemblies; Pickers (DD-021) are the one fetching peer.
- Changed on: 2026-08-12

### DD-018: The application shell is chrome, not a category
- Status: accepted — rule now in `AGENTS.md`; this entry keeps the derivation
- Context: The header had no component and no story — four lines of JSX inside `AppShell` whose height
  was negotiated in CSS with whatever page mounted. Asking which category it belonged to exposed that
  it belongs to none.
- Why (the derivation worth keeping): `Surface` is one specific treatment, a pane content sits *on*
  (border, translucent infill, blur); the header is full-bleed artwork that content sits *beside* in a
  shared grid row, overlapping only by `z-index`. It is not a Layout either — Layouts are transparent
  and it paints. So the shell is decided by *position*, not by what a caller hands it, and lives in
  `src/app/shell/**` as named organs.
  - The band's height is not a prop: `AppRoot` renders whatever the router hands it and cannot pass a
    height down; `PageLayout` cannot report upward. They meet in CSS — the page joins the grid through
    `display: contents`, claims the `hero` row, and declares its state through `data-page-layout-*`,
    which `AppHeader.module.css` reads back with `:has()`. Keeping the band and that frame in one file
    is deliberate: split across a published Layout and an organ, the negotiation becomes unobservable,
    because a CSS Module can only target a class from the module that owns it and a kit Layout may not
    import a shell organ. This is also why `PageLayout` is DD-003's container-query exemption.
- Rule (in `AGENTS.md`): `AppRoot`/`AppHeader`/`AppFooter` live in `src/app/shell/**`; nothing outside
  imports them; they carry stories under the `Shell` root. A component with exactly one possible caller
  is not kit vocabulary.
- Changed on: 2026-08-12

### DD-020: A component renders what it is given
- Status: accepted — rule now in `AGENTS.md` + oxlint; this entry keeps the why (absorbs DD-019)
- Context: An earlier version of the kit boundary (DD-019) banned every `@app`/`@db`/`@game` import
  and carved out the seven components that tripped it with a `*.domain.tsx` suffix. **The war story:**
  reading what those seven actually imported settled it — *every single `@db` import was `import type`*,
  erased at compile time, and the rest were game renderers, a date formatter, and a tag-label map. Not
  one component fetched anything. Meanwhile the one real violation went unnoticed: `FaqList` called
  `useNavigate` and decided where the reader went next, because the router was not on the ban list. The
  rule had been policing the *alias in the import specifier* — a proxy for the property that matters —
  and the proxy was both too strict and too loose.
- Why the suffix (DD-019) is gone: the two-tree split it enforced bought a machine-checkable boundary,
  but the property that matters is behaviour, not location. There is one product and no second consumer
  of the kit, so a directory (extractable in a way a filename suffix is not) bought nothing — the one
  argument for two trees was ruled out when this was decided.
- Rule (canonical in `AGENTS.md`, enforced by `.oxlintrc.json` `src/app/ui/**`): a component renders
  what it is given; it does not go and get things. Banned — the Convex client in any form; **value**
  imports from a data module by every spelling (`import type` stays legal); the router's data and
  navigation surface (`useRouter`, `useNavigate`, … — `Link`/`createLink`/`renderRoot` stay allowed);
  and `@app/shell`/`@app/widgets`/`@app/routes`. Nothing is exempt and no filename marks an escape.
- Provenance: **earned** — the `FaqList`/`useNavigate` miss above. The rule was hardened by probing it
  with throwaway files rather than reading the config, closing each hole (`@app/db/core` via the other
  alias; the relative `db.ts` spelling; `useRouter` returning an object with `.navigate()` on it).
- Changed on: 2026-08-12

### DD-021: Pickers — the one place a component may fetch
- Status: accepted
- Context: The rule "a widget never fetches" looked like it made the faction load popover a violation.
  It is not: that popover is a control that fetches *its own options* lazily, so a page rendering a
  "pick a user" control never queries every user up front. The two stated reasons for the fetch ban
  (can't be storied, destroys reuse) did not survive scrutiny — Storybook already mocks Convex, and the
  fetching control was reused on *more* routes than the props-only one. The real reason is DD-013
  subscription discipline. That gave the missing classification a home.
- Rule (canonical in `AGENTS.md`, Pickers): a Picker is a domain control whose whole job is to let the
  user choose from a list it loads itself. It fetches only what presenting its own options needs, read
  only, through a subscription torn down when it leaves the screen; it never mutates and never reads the
  page's data; the chosen value leaves through an `onPick`-style callback and the route decides what
  happens next. It is domain-specific (so it lives outside the kit) and renders *through* the kit — a
  peer of Widgets, not a seventh category.
- Examples: `FactionPicker` (`src/app/pickers/`), mounted only while the load popover is open, so it
  subscribes on mount because the container already gated it.
- Provenance: **structural** — the `pickers` slot in `check:app-layout` and the deliberate *absence*
  of Pickers from the `ui/**` and `widgets/**` fetch bans. The lazy/read-only/never-mutate contract is
  documented-only.
- Cross-links: DD-013 (the subscription discipline it applies), DD-020 (the fetch ban it is the
  deliberate exemption to).
- Changed on: 2026-08-13

---

## Provenance of the guards

Verified against each entry's text and the guard, not assumed — two claims came back different from
how the log read.

| Rule (DD) | Guard | Provenance | Incident |
|-----------|-------|----------------------|----------|
| Renders what it is given (DD-020) | `.oxlintrc.json` `src/app/ui/**` | **earned** | `FaqList` called `useNavigate`, slipped the alias ban |
| Closed `src/app` top level (DD-017) | `check:app-layout` | **earned** | folders "empty-but-alive for months" after the domain scheme was dismantled |
| The Convex doorway | `.oxlintrc.json` `src/**` | **earned** | `viewerActions.ts`/`assetPublishingStatus.ts` reached `convex/lib` for a wide union |
| `shared` ↛ app/convex/game | `.oxlintrc.json` `src/shared/**` | **earned** | 7 convex modules reached `src/app/*/validation`; the faction schema lived under a renderer folder |
| `convex`/`workers` ↛ app/game | `.oxlintrc.json` overrides | **earned** | publisher Worker reached the app's capture folder |
| Renderer isolation (DD-015) | `rendererIsolation.test.ts` | **earned** | `/app/components/content/` stopped existing, so the test "passed for the wrong reason" |
| No orphan CSS classes | `check:css-orphans` | **earned** | `.rulesetHeadCover` etc. shipped three times in one refactor |
| Layout container queries (DD-003) | `containerQueries.test.ts` | **pre-emptive** | design-derived; no violation preceded it |
| Leaf routes mount `PageLayout` (DD-014) | `PageLayout.architecture.test.ts` | **earned rule, structural guard** | the `staticData.PageHead` bridge earned the rule; the surviving assertion names no incident of its own |
| Shell is chrome (DD-018) | `check:app-layout` slot + `data-page-layout-*` | **borrowed** | the slot is earned by the empty-folders incident, not by any shell violation |
| One query per route (DD-013) | — | **documented-only** | `check:convex-skip` is a *different*, adjacent rule; it does not enforce this |

---

## History

The generic component system, its retirement, and the taxonomy that replaced it. These entries are
kept only so their numbers resolve and their reasoning is not lost; do not follow their rules.

**The arc (2026-03 → superseded 2026-07-19 by DD-015 → DD-017):** DuneZone began with a home-grown
generic primitive / form / layout / surface system (`src/app/components/generic/**`, `form/**`).
DD-001–004, 008, 010, 011 codified how to work inside it: reuse first, layer direction, parent-owned
spacing, avoid custom CSS, stories for generics, generic-first placement, one canonical path. DD-015
retired that whole system in favour of Mantine for standard UI, keeping only distinctive visuals and
the isolated renderers. DD-017 then rebuilt a domain-free *kit* on top of Mantine; DD-020 replaced
DD-019's two-tree/`*.domain.tsx` boundary with the behavioural import rule.

- **DD-001** Reuse existing shared components first — *superseded by DD-015.* Discovery now starts with Mantine, then the kit.
- **DD-002** Component layering / dependency direction — *superseded by DD-015.* Its lasting lesson, cited by DD-019/020: `generic/**` twice decayed by absorbing domain knowledge, which is why the kit boundary is behavioural.
- **DD-004** Avoid custom CSS, prohibit `composes` — *"avoid CSS" superseded by DD-015.* The no-`composes` / one-owner-per-stylesheet half is live and now carries its own why at **DD-004 above**.
- **DD-006, DD-007** Toolbar primary / colour intent — *folded into DD-005 (Action semantics).*
- **DD-008** Generic components require stories — *superseded by DD-015.* Live story expectation is in `AGENTS.md`; installed Mantine and route-local composition are exempt.
- **DD-010** Placement generic-first but domain-honest — *superseded by DD-015 → DD-017.* Placement is the taxonomy's job; domain-honesty is the DD-020 boundary.
- **DD-011** One shared component, one canonical path — *superseded by DD-015 → DD-017.* "One canonical path" became "one tree, inside the app".
- **DD-012** Concern boundaries, not sub-views — *folded into DD-009,* which carries its `RulesetGroupToolbarControl` war story.
- **DD-015** Mantine owns standard application-content UI — *superseded by DD-017.* The pivot that retired the generic system; the migration finished and the named legacy paths are deleted. Its live renderer-isolation remnant carries its own why at **DD-015 above**.
- **DD-019** One components tree, domain boundary in the filename — *superseded by DD-020.* Collapsing to one tree was right; the alias deny-list and the `*.domain.tsx` suffix were not — its one-tree rationale is folded into DD-020.
