# UI design decisions

The rules that govern UI code in this app, each with the one reason it exists. This is the current
rulebook, not a changelog — every rule here applies. Most are also stated in
[`AGENTS.md`](../../AGENTS.md) or caught by a guard; the italic line under each rule says where it is
enforced and where its canonical statement lives.

## The component boundary

### A component renders what it is given

It renders its inputs; it does not go and get things. All of a component's traffic crosses its
membrane, in both directions: a fetch brings data in that the caller never handed over, and a
navigation sends an effect out that the caller never receives — both route around the membrane,
and either way the component stops being reusable and a screen's behaviour scatters across the
tree. What matters is the capability, not where the file sits: a ban keyed on import *aliases* once
waved through `FaqList` calling `useNavigate` while flagging harmless compile-time `import type`s —
so the rule bans the behaviour, not the location.

*Enforced by [`.oxlintrc.json`](../../.oxlintrc.json) for `src/app/ui/**` — no Convex client, no
value import from a data module (`import type` stays legal), no router navigation
(`useNavigate`/`useRouter`; `Link` stays), no reach into `shell`/`widgets`/`routes`. Canonical in
[`AGENTS.md`](../../AGENTS.md#component-taxonomy).*

### Widgets are the last resort

A widget is a shared assembly for the rare case that none of the six kit categories fit. Like any
component it renders what it is handed and never fetches — fetching would multiply a route's live
subscriptions and scatter its authoritative shape.

*Enforced by [`.oxlintrc.json`](../../.oxlintrc.json) for `src/app/widgets/**`. Canonical in
[`AGENTS.md`](../../AGENTS.md).*

### Pickers are the one place a component may fetch

A Picker is a domain control whose whole job is to let the user choose from a list it loads itself —
so a "pick a user" control never queries every user up front. It fetches only what showing its own
options needs, read-only, through a subscription torn down when it leaves the screen; it never
mutates, never reads the page's data, and returns the chosen value through an `onPick`-style
callback. It is the deliberate exception to the fetch ban — justified by the one-query subscription
discipline below, not by being a new category — and renders *through* the kit as a peer of Widgets.

*Structural: the `pickers` slot in `check:app-layout` and its deliberate absence from the fetch bans;
the lazy/read-only/never-mutate contract is convention. Canonical in [`AGENTS.md`](../../AGENTS.md).
Example: `FactionPicker` in `src/app/pickers/`.*

### Extract a component only at a real concern boundary

A component must own a behaviour or domain concept behind a small, meaningful API — not a slice of
one page's layout, and not a thin wrapper that merely renames or forwards a Mantine component.
`RulesetGroupToolbarControl` was neither: it took ~11 props, every one a mirror of the route's own
state, was used once, and handed that state straight back — so you read two files to understand one
toolbar. It was inlined. A view-only sub-view stays inline in the route, or becomes a local helper
function in the same file.

*Convention — the taxonomy's membrane test in [`AGENTS.md`](../../AGENTS.md#component-taxonomy): the
JSDoc must be able to say "callers own X; this owns Y" in one sentence.*

## Where components live

### Six categories, one home each

Once Mantine became the shared layer, recurring concerns — the pane treatment, titled regions,
heading levels — were re-spelled at every call site and drifted. The kit fixes that: six domain-free
categories under `src/app/ui` — Content, Controls, Lists, Layout, Surfaces, Blocks — each decided
at the membrane, by what a caller hands the component. The category is the folder and the Storybook
root; feature folders keep only organs.

*Top-level slots enforced by `check:app-layout`; category placement is convention. Canonical in
[`AGENTS.md`](../../AGENTS.md#component-taxonomy).*

### The shell is chrome, decided by position

`AppRoot`, `AppHeader`, and `AppFooter` belong to no kit category. The header is full-bleed artwork
that content sits *beside* in a shared grid row — where a Surface is something content sits *on*, and
a Layout is transparent while the header paints. So the shell is decided by *position*, not at the
membrane: it lives in `src/app/shell/**`, reached only through its doorway (`routes/_app.tsx` mounts
`ApplicationChrome` and `AppNotFound`), and it carries stories under the `Shell` root. Its band
height is negotiated with the page in CSS — the page joins the grid through `display: contents` and
declares its state via `data-page-layout-*`, which
`AppHeader.module.css` reads back with `:has()` — which is why the band and the page frame stay in
one place, and why `PageLayout` is the container-query exemption below.

*Enforced by `check:app-layout` and the `data-page-layout-*` contract. Canonical in
[`AGENTS.md`](../../AGENTS.md).*

## Layout and spacing

### Layouts own spacing and lay out through named slots

Margin scattered through leaf components makes layout inconsistent and buries pages in nested
`<Stack><Group><Grid>`. Spacing belongs to a Layout: a custom component built on Mantine primitives
that arranges two or more **named compound slots** —
`<TriptychLayout><TriptychLayout.Left>…</TriptychLayout.Left>…</TriptychLayout>` — so composition
reads top-down and large content never rides inside a prop. A leaf never carries page margin (only
for unavoidable third-party constraints), one slot is a passthrough rather than a Layout, and Layouts
respond by **container query, not media query**, so they lay out by the room they are given.

*Exemption:* `PageLayout` uses `@media` — it is the shell's page frame, sized against the viewport in
concert with `AppHeader`, genuinely viewport-scoped rather than a container.

*Container-query half enforced by
[`containerQueries.test.ts`](../../src/app/ui/layout/containerQueries.test.ts) (`PageLayout` excepted
by name); the rest convention. Canonical in [`AGENTS.md`](../../AGENTS.md). Layouts today:
`PageLayout`, `TriptychLayout`, `AtlasLayout`, `AsymmetricSplitLayout`.*

### Floating UI is small and single-layer

Popovers clip, misposition, and outgrow their anchors when they carry real editors, and a dropdown
opened inside a popover stacks pane on pane. So floating UI (popovers, menus, dropdowns) appears only
where reflow is undesirable — a toolbar action, a pick-one list — and it stays small: few controls,
no modes, no sub-editors. Anything with modes, a collection to manage, or sub-controls of its own
expands inline and accepts the reflow. One floating layer at a time: a floating pane never opens
another floating pane inside itself; its innards render inline (a search field with an inline
options list, not a nested dropdown). Dropdowns portal to the document — never
`withinPortal: false`, which ties positioning to whatever containment the anchor sits in — with one
exception: a select that must live inside a popover keeps `withinPortal: false`, because a portalled
option renders outside the popover's DOM and picking it reads as click-outside, closing the pane
mid-selection (see `AssignPopover`).

*Exemption:* display-only, hover-transient UI — a tooltip, a hover preview — may appear over a
floating pane; it is glanceable, not operable.

*Convention — the faction editor carries the shapes: the Base/Pattern color editors expand inline
below their trigger cards, and [`FactionPicker`](../../src/app/pickers/FactionPicker.tsx) renders its
option list inline inside one popover (Combobox without dropdown).*

### Terminal routes mount PageLayout

A parent-owned `staticData.PageHead` bridge once split one screen into detached header and body
sub-views, duplicated the page query, and hid the whole composition across router metadata and the
shell. So every terminal `_app` route renders `PageLayout` directly and fills only the slots that
page needs — often all of `Header`/`Toolbar`/`Content`, but a page may omit the header and render
`Content` alone, which marks it compact. Route parents are outlet-only, and `AppRoot` owns only
persistent chrome and document effects.

*Enforced by
[`PageLayout.architecture.test.ts`](../../src/app/ui/layout/PageLayout.architecture.test.ts) (every
terminal route mounts it). Canonical in [`AGENTS.md`](../../AGENTS.md).*

## Data

### One Convex query per route

Mounting several `useQuery` hooks on a route multiplies live subscriptions, complicates loading
states, and scatters a screen's authoritative shape across Convex functions. Each route subscribes to
**at most one Convex query for page data**, plus `useCurrentProfile` when the UI is auth-aware;
derive UI-ready fields inside that query, and pass small server-derived collections into controls
through it rather than adding child subscriptions. The one documented exception is a lazily-mounted
[Picker](#pickers-are-the-one-place-a-component-may-fetch), which may hold its own read-only options
subscription — so a control choosing from a large set never forces those rows into the page query.
The second is the editors' name-conflict probe: a debounced, conditionally-mounted read of
`assets.slugTaken` that warns about a colliding name while the author types, which cannot ride the
page query because the candidate slug changes with every settled keystroke.
This subscription discipline is the real reason widgets don't fetch and Pickers fetch only lazily.
Mutations don't count.

*Convention — no automated guard. (`check:convex-skip` bans `useQuery("skip")` inside `src/app/db`, a
separate, adjacent rule.) Stated here; [`AGENTS.md`](../../AGENTS.md) and
[`state-management.md`](../state-management.md) cite it.*

## Visual semantics

### Action semantics: colour by intent, one primary

Actions get unpredictable when meaning rides on hue, when a toolbar has several competing "primary"
buttons, or when an icon-only control has no explicit semantics. So colour by intent, then style: a
positive primary takes the `confirm` colour, a destructive action takes `red` (the Dune danger
tuple), and neutral or auxiliary actions keep the default colour and vary by Mantine `variant`, never
by hue. Keep exactly one clear primary per toolbar. Use an icon-only button only for a common,
recognizable action with an `aria-label`; if the icon would be ambiguous, label it.

*Convention — the kit carries it: `IconAction` for icon-only actions, `CallToAction` for the
forward-moving primary, and the colour tuples in [`theme.ts`](../../src/app/ui/theme.ts).
(`StatusBadge`'s tone scale is for state, not actions.)*

### Destructive actions are held, not asked twice

A delete fires after its trigger is held for five seconds. Hovering says "hold to delete"; pressing
starts a countdown that the hover text and the glyph both show ("deletion in 4.."), and releasing
anywhere short of zero cancels with nothing fired. The keyboard holds the same way with Space or
Enter. A question-and-answer confirm asked for a second decision; the hold asks for sustained
intent, which is one interaction and cannot be clicked through on autopilot. On success the page
navigates to the deleted thing's parent, since its own address just died.

*Convention. The kit carries it: `ConfirmDeleteAction` in
[`src/app/ui/control`](../../src/app/ui/control/ConfirmDeleteAction.tsx). Every delete goes through
it; `window.confirm` remains only at non-delete confirmations (removing a member, moving an asset
between groups) pending their own treatment.*

### A tab icon is an icon, never a proof

A chapter tab carries a simple, single-colour icon and nothing else. Not a rendered artifact, not a
live preview of the content, not an image of an authored asset. Several editors had drifted into
using the tab as a second proof: the deck editor's Identity tab wore the cardback it edited, the
bundle editor's wore its container, the treachery editor's Icon tab wore the chosen vector, and the
faction editor's Identity and Forces tabs wore the faction's logo and first troop symbol. Each read
as clever in isolation and as noise in a row of tabs.

Norbert, 2026-08-20: *"tabs should contain simple single color icons, nothing else, ever."*

The rail beside the editor is where a proof belongs, and every one of those editors already has one.

*Convention — a tab icon is a lucide component or a `TopicIcon`; both render in `currentColor`. If a
chapter's concept recurs across editors it earns a `TopicIcon` topic rather than a local import.*

### One canonical icon per recurring topic

The same topic once appeared with different icons between the faction editor and the detail pages,
weakening recognition. Render recurring topic icons through `TopicIcon`; the faction editor's mapping
is authoritative. `identity`, `about` and `contents` are the chapter topics every asset editor
shares, so those come from the mapping rather than from a local import.

*Convention — the mapping is the code in
[`TopicIcon.tsx`](../../src/app/ui/content/TopicIcon.tsx). A one-off topic may keep a local icon
until it recurs; renderer-owned game visuals stay isolated and don't consume `TopicIcon`.*

## Styling and renderers

### One owner per stylesheet, no `composes`

CSS `composes` pulls declarations across module boundaries, so the stylesheet a rule actually comes
from stops being greppable and two files quietly co-own one class. Ownership you cannot grep drifts.
Exactly one TSX component imports each `.module.css`; share through the component, not the stylesheet.

*`check:css-orphans`
([`assert-no-orphan-css-classes.mjs`](../../scripts/assert-no-orphan-css-classes.mjs)) catches
orphaned or unimported stylesheets, not `composes` itself; the one-owner rule is convention.
Canonical in [`ui-component-hierarchy.md`](./ui-component-hierarchy.md) (Styling).*

### Renderers stay isolated

Game-asset renderers must paint identically in a Worker, in print, and in the browser — and none of
those load the app shell. So a renderer imports no Mantine, no Radix, and nothing from `src/app`; it
is pure over its inputs. A single app import would couple print and Worker output to the browser
bundle; isolation is what lets one renderer serve three deploy targets.

*Enforced by [`rendererIsolation.test.ts`](../../src/game/rendererIsolation.test.ts). Canonical in
[`AGENTS.md`](../../AGENTS.md) (game assets).*
