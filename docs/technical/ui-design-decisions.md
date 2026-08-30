# UI design decisions

The rules that govern UI code in this app, each with the one reason it exists. This is the current
rulebook, not a changelog: every rule here applies. Most are also stated in
[`AGENTS.md`](../../AGENTS.md) or caught by a guard; the italic line under each rule says where it
is enforced and where its canonical statement lives.

## The component boundary

### A component renders what it is given

It renders its inputs; it does not go and get things. All of a component's traffic crosses its
membrane, in both directions: a fetch brings data in that the caller never handed over, and a
navigation sends an effect out that the caller never receives. Both route around the membrane, and
either way the component stops being reusable and a screen's behaviour scatters across the tree.
What matters is the capability, not where the file sits: a ban keyed on import *aliases* once waved
through `FaqList` calling `useNavigate` while flagging harmless compile-time `import type`s, so the
rule bans the behaviour, not the location.

*Enforced by [`.oxlintrc.json`](../../.oxlintrc.json) for `src/app/ui/**`: no Convex client, no
value import from a data module (`import type` stays legal), no router navigation
(`useNavigate`/`useRouter`; `Link` stays), no reach into `shell`/`widgets`/`routes`. Canonical in
[`AGENTS.md`](../../AGENTS.md#component-taxonomy).*

### Widgets are the last resort

A widget is a shared assembly for the rare case that none of the six kit categories fit. Like any
component it renders what it is handed and never fetches, because fetching would multiply a route's
live subscriptions and scatter its authoritative shape.

*Enforced by [`.oxlintrc.json`](../../.oxlintrc.json) for `src/app/widgets/**`. Canonical in
[`AGENTS.md`](../../AGENTS.md).*

### Pickers are the one place a component may fetch

A Picker is a domain control whose whole job is to let the user choose from a list it loads itself,
so a "pick a user" control never queries every user up front. It fetches only what showing its own
options needs, read-only, through a subscription torn down when it leaves the screen; it never
mutates, never reads the page's data, and returns the chosen value through an `onPick`-style
callback. It is the deliberate exception to the fetch ban, justified by the one-query subscription
discipline below rather than by being a new category, and it renders *through* the kit as a peer of
Widgets.

*Structural: the `pickers` slot in `check:app-layout` and its deliberate absence from the fetch bans;
the lazy/read-only/never-mutate contract is convention. Canonical in [`AGENTS.md`](../../AGENTS.md).
Example: `FactionPicker` in `src/app/pickers/`.*

### Extract a component only at a real concern boundary

A component must own a behaviour or domain concept behind a small, meaningful API, not a slice of
one page's layout, and not a thin wrapper that merely renames or forwards a Mantine component.
`RulesetGroupToolbarControl` was neither: it took ~11 props, every one a mirror of the route's own
state, was used once, and handed that state straight back, so you read two files to understand one
toolbar. It was inlined. A view-only sub-view stays inline in the route, or becomes a local helper
function in the same file.

*Convention. The taxonomy's membrane test in [`AGENTS.md`](../../AGENTS.md#component-taxonomy): the
JSDoc must be able to say "callers own X; this owns Y" in one sentence.*

## Where components live

### Six categories, one home each

Once Mantine became the shared layer, recurring concerns (the pane treatment, titled regions,
heading levels) were re-spelled at every call site and drifted. The kit fixes that with six
domain-free categories under `src/app/ui`: Content, Controls, Lists, Layout, Surfaces, Blocks. Each
is decided at the membrane, by what a caller hands the component. The category is the folder and the
Storybook root; feature folders keep only organs.

*Top-level slots enforced by `check:app-layout`; category placement is convention. Canonical in
[`AGENTS.md`](../../AGENTS.md#component-taxonomy).*

### The shell is chrome, decided by position

`AppRoot`, `AppHeader`, and `AppFooter` belong to no kit category. The header is full-bleed artwork
that content sits *beside* in a shared grid row, whereas a Surface is something content sits *on*,
and a Layout is transparent while the header paints. So the shell is decided by *position*, not at the
membrane: it lives in `src/app/shell/**`, reached only through its doorway (`routes/_app.tsx` mounts
`ApplicationChrome` and `AppNotFound`), and it carries stories under the `Shell` root. Its band
height is negotiated with the page in CSS, since the page joins the grid through `display: contents`
and declares its state via `data-page-layout-*`, which `AppHeader.module.css` reads back with
`:has()`. That is why the band and the page frame stay in one place, and why `PageLayout` is the
container-query exemption below.

*Enforced by `check:app-layout` and the `data-page-layout-*` contract. Canonical in
[`AGENTS.md`](../../AGENTS.md).*

## Layout and spacing

### Layouts own spacing and lay out through named slots

Margin scattered through leaf components makes layout inconsistent and buries pages in nested
`<Stack><Group><Grid>`. Spacing belongs to a Layout: a custom component built on Mantine primitives
that arranges two or more **named compound slots**, as in
`<TriptychLayout><TriptychLayout.Left>…</TriptychLayout.Left>…</TriptychLayout>`, so composition
reads top-down and large content never rides inside a prop. A leaf never carries page margin (only
for unavoidable third-party constraints), one slot is a passthrough rather than a Layout, and Layouts
respond by **container query, not media query**, so they lay out by the room they are given.

*Exemption:* `PageLayout` uses `@media`. It is the shell's page frame, sized against the viewport in
concert with `AppHeader`, genuinely viewport-scoped rather than a container.

*Container-query half enforced by
[`containerQueries.test.ts`](../../src/app/ui/layout/containerQueries.test.ts) (`PageLayout` excepted
by name); the rest convention. Canonical in [`AGENTS.md`](../../AGENTS.md). The layouts themselves are
whatever [`src/app/ui/layout`](../../src/app/ui/layout) holds; a roster written here would go stale
the first time one is added.*

### Floating UI is small and single-layer

Popovers clip, misposition, and outgrow their anchors when they carry real editors, and a dropdown
opened inside a popover stacks pane on pane. So floating UI (popovers, menus, dropdowns) appears only
where reflow is undesirable, such as a toolbar action or a pick-one list, and it stays small: few
controls, no modes, no sub-editors. Anything with modes, a collection to manage, or sub-controls of its own
expands inline and accepts the reflow. One floating layer at a time: a floating pane never opens
another floating pane inside itself; its innards render inline (a search field with an inline
options list, not a nested dropdown). Dropdowns portal to the document, never `withinPortal: false`,
which ties positioning to whatever containment the anchor sits in. A select
that has to live inside a popover renders its options inline instead of as a dropdown, which is the
same one-layer rule rather than an exception to it (see `AssignPopover`).

*Exemption:* display-only, hover-transient UI, a tooltip or a hover preview, may appear over a
floating pane; it is glanceable, not operable.

*Convention. The faction editor carries the shapes: the Base/Pattern color editors expand inline
below their trigger cards, and [`FactionPicker`](../../src/app/pickers/FactionPicker.tsx) renders
its option list inline inside one popover (Combobox without dropdown).*

### Terminal routes mount PageLayout

A parent-owned `staticData.PageHead` bridge once split one screen into detached header and body
sub-views, duplicated the page query, and hid the whole composition across router metadata and the
shell. So every terminal `_app` route renders `PageLayout` directly and fills only the slots that
page needs, often all of `Header`/`Toolbar`/`Content`, though a page may omit the header and render
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
subscription, so a control choosing from a large set never forces those rows into the page query.
This subscription discipline is the real reason widgets don't fetch and Pickers fetch only lazily.
Mutations don't count.

*Convention, with no automated guard. (`check:convex-skip` bans `useQuery("skip")` inside
`src/app/db`, a separate, adjacent rule.) Stated here; [`AGENTS.md`](../../AGENTS.md) and
[`state-management.md`](../state-management.md) cite it.*

### State past one primitive is a local reducer

A screen whose state sits in a row of `useState` calls has no single place that says what a
transition does, and Reset is where that shows: it has to remember every setter, so the piece added
last is the one it forgets, and the repair arrives as an effect resyncing what a rebuild would have
handled. So once a component holds more than one `useState` of a primitive in one cohesive state
machine, that state becomes a `useReducer` in the file that owns it, with named events instead of
loose setters, and the events that replace state rebuild it whole rather than assigning a field at a
time.

A chapter selection and a picker's open flag are not that machine. They are their own concerns and
stay their own `useState` beside the reducer, which is why the representative file below has two of
them sitting next to one. And a single `patch` merging an author's edits into the draft is already a
named event, because every field edit means the same thing and it can reach nothing outside the
draft. The names this rule exists to force into the open are the transitions: replacing the whole
state, moving the baseline after a save, whatever a Reset or a Load performs. Those get their own
event, and never hide inside a setter or inside a patch.

The reducers this produces come out near-identical across sites, and that repetition is the design
rather than something to remove later. A generic stateful hook standing over them takes explicit
sign-off, with its costs written out: what a call site can no longer read in one file, what a new
event has to negotiate with every other caller, and what the abstraction is worth against the lines
it saves. Pure functions lifted out of a reducer are exempt, and so is a hook that owns one concern
rather than a screen's state.

*Convention, with no automated guard. The asset editors under
[`src/app/routes/_app/assets/`](../../src/app/routes/_app/assets/) each carry their own copy;
`-tokenEdit.tsx` is representative. Stated here.*

## Visual semantics

### Variants, not colours

An app UI component takes a semantic variant keyword and the theme owns what that keyword resolves
to in that component's context. A colour value crossing an app component's boundary is the
anti-pattern: it moves a decision the theme should own into a caller that cannot see the other
callers, and it names a hue where the reader needs a meaning.

The enums are per component and per prop rather than one shared union, because a badge's states and
an action's intents are different questions. They draw their words from one language so a reader
meeting a new component already knows what the words mean.

The language, each word earned by usage the survey found rather than invented:

| word | means | where |
| --- | --- | --- |
| `neutral` | recedes; the default weight | any |
| `positive` | affirms or creates | any |
| `negative` | destroys, or reports a failure | any |
| `caution` | warns without failing | any |
| `brand` | ownership and selection | any |
| `pending` | waiting to start | `StatusBadge` |
| `progress` | running | `StatusBadge` |
| `muted` | recedes behind the content it names | `Eyebrow` |
| `accent` | ties the label to the brand | `Eyebrow` |
| `inverse` | legible on dark artwork | `Eyebrow` |

The first five are context-free and belong to any component that needs them. The rest are scoped to
the component that earned them, and a component adding a word takes it from this table before
inventing one.

*Convention. Norbert ratified this on «Give the accent colour a name», where the survey that derived
it is recorded. The theme in [`theme.ts`](../../src/app/ui/theme.ts) owns resolution. Raw colour
tokens are for the theme and for renderer-owned game visuals, not for app component props.*

### One primary per toolbar, and an icon-only action says what it is

A toolbar with several competing "primary" buttons makes none of them primary, and an icon-only
control with no explicit semantics makes the reader guess. Keep exactly one clear primary per
toolbar. Use an icon-only button only for a common, recognizable action with an `aria-label`; if the
icon would be ambiguous, label it.

*Convention. The kit carries it: `IconAction` for icon-only actions and `CallToAction` for the
forward-moving primary. Which variant each takes is the section above; this one is about how many
and how labelled. (`StatusBadge`'s scale is for state, not actions.)*

### Destructive actions are held, not asked twice

A delete fires after its trigger is held for five seconds. Hovering says "hold to delete"; pressing
starts a countdown that the hover text and the glyph both show ("deletion in 4.."), and releasing
anywhere short of zero cancels with nothing fired. The keyboard holds the same way with Space or
Enter. A question-and-answer confirm asked for a second decision; the hold asks for sustained
intent, which is one interaction and cannot be clicked through on autopilot. On success the page
navigates to the deleted thing's parent, since its own address just died.

*Convention. The kit carries it in two shapes, sharing one hold:
[`ConfirmDeleteAction`](../../src/app/ui/control/ConfirmDeleteAction.tsx) for the icon triggers and
[`ConfirmDeleteButton`](../../src/app/ui/control/ConfirmDeleteButton.tsx) for the full-width one on
the account-deletion page. Every delete goes through one of them. One `window.confirm` survives, at
the asset move on the group page, which is not a delete and is pending its own treatment.*

### A tab icon is an icon, never a proof

A chapter tab carries a simple, single-colour icon and nothing else. Not a rendered artifact, not a
live preview of the content, not an image of an authored asset. Several editors had drifted into
using the tab as a second proof: the deck editor's Identity tab wore the cardback it edited, the
bundle editor's wore its container, the treachery editor's Icon tab wore the chosen vector, and the
faction editor's Identity and Forces tabs wore the faction's logo and first troop symbol. Each read
as clever in isolation and as noise in a row of tabs.

Norbert, 2026-08-20: *"tabs should contain simple single color icons, nothing else, ever."*

The rail beside the editor is where a proof belongs, and every one of those editors already has one.

*Convention. A tab icon is a lucide component or a `TopicIcon`; both render in `currentColor`. If a
chapter's concept recurs across editors it earns a `TopicIcon` topic rather than a local import.*

### One canonical icon per recurring topic

The same topic once appeared with different icons between the faction editor and the detail pages,
weakening recognition. Render recurring topic icons through `TopicIcon`; the faction editor's mapping
is authoritative. `identity`, `about` and `contents` are the chapter topics every asset editor
shares, so those come from the mapping rather than from a local import.

*Convention. The mapping is the code in [`TopicIcon.tsx`](../../src/app/ui/content/TopicIcon.tsx). A
one-off topic may keep a local icon until it recurs; renderer-owned game visuals stay isolated and
don't consume `TopicIcon`.*

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

Game-asset renderers must paint identically in a Worker, in print, and in the browser, and none of
those load the app shell. So a renderer imports no Mantine, no Radix, and nothing from `src/app`; it
is pure over its inputs. A single app import would couple print and Worker output to the browser
bundle; isolation is what lets one renderer serve three deploy targets.

*Enforced by [`rendererIsolation.test.ts`](../../src/game/rendererIsolation.test.ts). Canonical in
[`AGENTS.md`](../../AGENTS.md) (game assets).*

## Comments

### A comment is a claim, and the claim has to be earned

A comment is not helpful by existing. It earns its place one of two ways: it says what the code and
its tests cannot, or it prevents a specific future mistake. A prevention claim owes a scenario, and
the scenario owes an answer: why would someone realistically go wrong here? Three answers count.
**Precedent**: it already went wrong, in this repo or in the drafting of this very change. **Pull**:
the wrong way is shorter, more idiomatic, or what an editor or a tool proposes. **Invisible
coupling**: the reason lives in another file or another system the reader will not have open.
"Someone might think X" with none of the three attached is a worry, not a scenario. A worry does not
earn a line that every later reader must read and every later change must keep true.

Three kinds never survive. Restating the line below. Narrating what an assertion checks. Arguing
that the change is correct. The last one gets written anyway. It feels like substance, but its
audience is the reviewer, so it belongs in the pull request body, where it is read once and dies
with the review. What survives is written once, in the one place where the reader who would break it
is standing. Changing the fact then means changing one line, not hunting for three that have drifted
apart.

An export is the one case that usually deserves a JSDoc even when its body is plain, because its
reader is often not in the file at all. A hover in another file shows the JSDoc and nothing else, so
it is the one place to say what the value is for and how to use it: the expected call, the companion
it pairs with, the default worth knowing. The test stays the same; from outside the file, the code
the reader cannot see is all of it.

*Convention, with no automated guard. (`local/no-ai-tells` in
[`oxlint-local-plugin.mjs`](../../scripts/oxlint-local-plugin.mjs) and `check:prose` police how a
comment reads, never whether it earned its place.) Stated here.*
