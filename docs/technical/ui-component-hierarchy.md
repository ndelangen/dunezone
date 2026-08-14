# UI component taxonomy and ownership

The component taxonomy in [`AGENTS.md`](../../AGENTS.md#component-taxonomy) is canonical: six
categories under `src/app/ui` (Content, Controls, Lists, Layout, Surfaces, Blocks) holding **every**
published component. Widgets are the
last-resort shared assemblies, game renderers stay isolated, and only organs are filed by feature. The
category is the folder; the folder is the Storybook root. This document holds only what the taxonomy
does not: ownership rules that sit around it.

## Ownership

| Owner | Location | Rule |
|---|---|---|
| Components | `src/app/ui/**` (alias `@ui/*`) | Every published component, filed by category. One rule: it renders what it is given — no Convex client, no `@db` values (types are fine), no router data hooks. Composes Mantine under `appContentTheme`. |
| Mantine | `@mantine/core` | The base library. Used directly where no kit component owns the concern; kit components used where one does. Mantine components the app uses get stories, filed by kind. |
| Page composition | the route file itself | One page's own JSX, split into local functions when the route grows. Never exported as a feature component: one page → route, two or more pages → Widget. |
| Document-rendering glue | `src/app/print/` | `print/sheet/` bridges a `Faction` row to the sheet renderer; `print/capture/` is the page the publisher screenshots. Not published, not storied. |
| Widgets | `src/app/widgets/<name>` | Shared assemblies; see the widget rules in `AGENTS.md`. |
| Application shell | `src/app/shell/**` | `AppRoot` owns the persistent frame and document effects, `AppHeader` the artwork band, `AppFooter` the closing waypoints. Chrome, not kit — storied under the `Shell` Storybook root, mounted through its doorway (`ApplicationChrome`, `AppNotFound`). See [*The shell is chrome*](ui-design-decisions.md#the-shell-is-chrome-decided-by-position). |
| Page frame | `src/app/ui/layout/PageLayout.tsx` | Terminal routes compose its slots directly; import from `@ui/layout/PageLayout`. Domain-free, but its `data-page-layout-*` contract is read by the shell (see [*The shell is chrome*](ui-design-decisions.md#the-shell-is-chrome-decided-by-position)). |
| Game and document renderers | `src/game/**`, sheet/print/capture/publishing entry points | Independent of Mantine and the kit; exact rendering output preserved. |

## Route and data ownership

- Every terminal visual `_app` route renders `PageLayout` and supplies the slots it needs —
  `content`, usually a `header` (omit it for a compact page), and an optional `toolbar`. Nested
  parent routes remain outlet-only.
- Each route subscribes to at most one Convex query for page data, plus `useCurrentProfile` when
  needed. Pass query-derived data down; do not create nested subscriptions for the same screen.
- Pages compose — heavy JSX at the page level is the intended shape. Widgets receive data and
  callbacks from their page and never fetch or route.
- Document-only render targets and non-visual auth handoffs are the intentional route-layout
  exceptions.

## Styling ownership

- The kit owns the pane treatment (`Surface`), heading levels (depth-derived), and typography
  defaults (`src/app/ui/theme.ts`). Pages do not restate them.
- CSS Modules are valid for domain visuals, shell ownership, and page-specific composition; a
  component's TSX owner is the only importer of its stylesheet. No CSS `composes`.
- Every class a module defines must be used, and every class a component reaches for must exist:
  `bun run check:css-orphans` enforces both across `src/app` (which contains the kit)
  ([`scripts/assert-no-orphan-css-classes.mjs`](../../scripts/assert-no-orphan-css-classes.mjs)).
  `src/game` is out of scope there, by design.
- Placement (`className`) may be passed into kit components; appearance may not.
- TanStack Router's typed `Link` owns navigation; Mantine and kit components reach it through
  `renderRoot` at the call site.

## Renderer isolation checklist

- No Mantine or `@ui` imports under `src/game/**`.
- No Mantine provider, theme, styles, or component imports in sheet, print, capture, or
  publishing renderer entry points.
- Embedded game visuals may be positioned by application-page layout, but their internals and
  output remain unchanged.
