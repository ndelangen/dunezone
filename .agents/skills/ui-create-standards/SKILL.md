---
name: ui-create-standards
description: Design and implement application UI in Dune Zone's kit-first taxonomy, where six kit categories under src/app/ui, widgets, pickers, the shell and isolated game renderers are all composed from Mantine under the app theme. Use when adding or refactoring UI, deciding where a component lives, choosing layout, spacing, breakpoints or variants, or checking a change against the repository's UI rules.
---

# Kit-first UI standards

## Quick start

1. Read the component taxonomy in [`AGENTS.md`](../../../AGENTS.md#component-taxonomy), the
   rulebook in [UI design decisions](../../../docs/technical/ui-design-decisions.md), the ownership
   table in [UI component hierarchy](../../../docs/technical/ui-component-hierarchy.md), and the
   aesthetic in [`design.md`](../../../design.md).
2. Place the concern before writing it: page composition, kit vocabulary, widget, Picker, shell,
   print glue, or renderer. The tables below decide.
3. Build with Mantine under `appContentTheme` and the kit. Extract only at a real concern boundary.
4. Run the guards listed at the end before opening or updating the PR.

## Where it lives

The ladder runs before any question about categories. One page: the route file, as local
functions. Two or more pages: a Widget. Domain-free vocabulary whose words travel as data: the kit.
`src/app`'s top level is a closed set (`db`, `pickers`, `print`, `routes`, `shell`, `styles`, `ui`,
`widgets`), held by `bun run check:app-layout`, and there is no `src/app/components`.

| Concern | Lives in | Rule |
|---|---|---|
| One page's own JSX | its route file (`index.tsx` or `*.route.tsx`), stylesheet named for the route's stem | Split into local functions; never export them as feature components |
| Vocabulary any page may use | `src/app/ui/<category>`, reached as `@ui/*` | Renders what it is given: no Convex client, no `@db` value imports, no router navigation, no reach into `shell`, `widgets` or `routes`; lint holds every one of these |
| An assembly two or more routes install whole | `src/app/widgets/<name>` | Takes its value and callbacks from the page; never fetches, never routes; derives from the draft rather than mirroring it; kit all the way down |
| A control that loads its own options | `src/app/pickers` | The one sanctioned fetch: lazy, read-only, torn down on unmount, the choice leaving through `onPick`; a peer of Widgets, never a seventh category |
| Persistent chrome | `src/app/shell` | Decided by position, not at the membrane; mounted only through `ApplicationChrome` and `AppNotFound`; storied under `Shell` |
| Document-rendering glue | `src/app/print/sheet`, `src/app/print/capture` | Not published and not storied; capture depends on sheet, never the reverse |
| Game assets and renderers | `src/game` | No Mantine, no Radix, nothing from `src/app`; print-faithful output that is never themed |
| A file only its own feature imports | beside that feature, as an organ | No story and no outside importer; gaining either ends the classification |

The six kit categories are decided at the membrane, by what a caller hands the component:

| Category | Folder | Caller hands it | It owns |
|---|---|---|---|
| Content | `ui/content` | data | one kind of content, rendered our way |
| Controls | `ui/control` | a value plus `onChange`, or an intent | the user changing things, and the furniture around doing so |
| Lists | `ui/list` | items of one shape | the rhythm between items |
| Layout | `ui/layout` | slots only | where things go, never what they are |
| Surfaces | `ui/surface` | slots; words only to name itself | the pane: border, infill, blur; Surfaces never nest |
| Blocks | `ui/block` | data, and at most one slot for the region it names | turning words into Content in one fixed arrangement |

The tells, from `AGENTS.md`: main content arriving as `ReactNode` is a Layout or a Surface; a
string prop becoming a heading is a Block; a component that receives, produces and changes is two
components; a wrapper that only renames or lightly forwards a Mantine component is not a component.

## Building it

- **Mantine directly, under the theme.** Reach for `Button`, `ActionIcon`, `TextInput`, `Select`
  and the rest at the call site. A kit component exists where the kit owns a concern: `Surface` for
  a pane (never `Paper`), `IconAction` for an icon-only action, `CallToAction` for the one primary,
  `ControlBlock` for label, hint and error furniture. No rename-only wrappers.
- **Only Surfaces paint, and Surfaces never nest.** Only Blocks, and a Surface naming itself, render
  headings; loudness comes from depth, never from a prop. One page-title Block per page, mounted by
  the route.
- **Terminal routes mount `PageLayout`** and fill only the slots the page needs; parent routes stay
  outlet-only. `PageLayout.architecture.test.ts` fails a terminal route that omits it.
- **Layouts lay out through named compound slots**, never fewer than two, and respond by container
  query. `PageLayout` is the one `@media` exemption.
- **Spacing is the scale.** `xs sm md lg xl`, written `var(--space-md)` in CSS and `gap="md"` in
  TSX, never a raw length in a spacing property. Choose the step by what the gap separates, and take
  the smaller one when two seem right.
- **Breakpoints are one ladder**: 30rem, 48rem and 62rem, written `width < step` or
  `width >= step`. `@media` belongs to the window chrome alone; everything inside a page asks its
  container. `bun run check:breakpoints` holds the media half.
- **Variants, not colours.** An app component takes a semantic word (`positive`, `negative`,
  `neutral`, `caution`, `brand`, `selected`, plus the scoped words the decisions doc tables) and the
  theme resolves it. A colour value never crosses an app component's boundary.
- **Floating UI is small and single-layer.** Popovers and menus only where reflow is undesirable,
  with few controls and no sub-editors; dropdowns portal to the document; a floating pane never
  opens another.
- **State past one primitive is a local reducer** in the file that owns it, with named events. A
  widget holds no state whose correctness depends on the draft its caller owns.
- **One Convex page query per route**, plus `useCurrentProfile` when the UI is auth-aware. Derive
  inside that query and pass data down; a widget never adds a subscription.
- **Actions and icons.** One primary per toolbar; every icon-only action carries a label; a delete
  goes through `ConfirmDeleteAction` or `ConfirmDeleteButton`; a recurring topic renders through
  `TopicIcon`; a tab icon is single-colour and never a preview; a published image arrives through
  `PublishedImage`.
- **Stylesheets have one owner.** Exactly one TSX file imports each `.module.css`, there is no
  `composes`, and placement (`className`) may be passed in while appearance may not.
  `check:css-orphans` holds every class to a use, and `check:css-vars` every custom property read to
  a definition.
- **Comments earn their place**, written as block comments with one sentence per line and no AI
  tells; the last section of the decisions doc says what earns one.

## Stories

Every kit component carries stories, and so does every Mantine component the app uses, filed by
kind under the category root. Widget stories file under `Widgets`, chrome under `Shell`, pages
under `Pages`, and organs carry none. A new directory needs a `titlePrefix` entry in
[`.storybook/main.ts`](../../../.storybook/main.ts) or its stories never load. A page story runs the
real route against production-derived data; see *Page stories* in
[`docs/README.md`](../../../docs/README.md#page-stories).

## Guards to run

```bash
bun run lint && bun run format:check
bun run check:css-orphans && bun run check:css-vars && bun run check:breakpoints
bun run check:app-layout && bun run check:prose
bun run typecheck && bun run test && bun run storybook:test
bun run publisher:release:verify   # before any PR that changes application code
```

## Final checklist

- [ ] The concern was placed on the ladder before it was built: route, kit category, widget,
      Picker, shell, print glue, or renderer.
- [ ] Mantine is composed directly under the theme; no rename-only wrapper, no `Paper` for a pane.
- [ ] The component renders what it is given: no fetch, no navigation, no reach into the app.
- [ ] Spacing comes from the scale, and any width query sits on the ladder in the right at-rule.
- [ ] Intent is said with a variant word; no colour crosses a component boundary.
- [ ] Headings come from Blocks only; Surfaces never nest; only Surfaces paint.
- [ ] Stories exist for every new kit or widget component, and their directory is registered.
- [ ] Renderers under `src/game` and the print entry points took no Mantine or app import.
- [ ] The guards above pass.
