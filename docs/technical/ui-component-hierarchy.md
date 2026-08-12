# UI component taxonomy and ownership

The component taxonomy in [`AGENTS.md`](../../AGENTS.md#component-taxonomy) is canonical: six kit
categories under `src/ui` (Content, Controls, Lists, Layout, Surfaces, Blocks), plus Application
components filed by feature, Widgets as the last-resort shared assemblies, and isolated game
renderers. The category is the folder; the folder is the Storybook root. This document holds only
what the taxonomy does not: ownership rules that sit around it.

## Ownership

| Owner | Location | Rule |
|---|---|---|
| Interface kit | `src/ui/**` | Domain-free; lint forbids `@app/@db/@game/@data` imports. Composes Mantine under `appContentTheme`. |
| Mantine | `@mantine/core` | The base library. Used directly where no kit component owns the concern; kit components used where one does. Mantine components the app uses get stories, filed by kind. |
| Application components | `src/app/components/<feature>` | The taxonomy's kinds with domain knowledge baked in. |
| Widgets | `src/app/widgets/<name>` | Shared assemblies; see the widget rules in `AGENTS.md`. |
| Application shell | `src/app/components/shell/**` | `AppShell` owns persistent chrome; terminal routes compose `PageLayout` slots directly. |
| Game and document renderers | `src/game/**`, sheet/print/capture/publishing entry points | Independent of Mantine and the kit; exact rendering output preserved. |

## Route and data ownership

- Every terminal visual `_app` route renders `PageLayout` and supplies `header`, optional
  `toolbar`, and content together. Nested parent routes remain outlet-only.
- Each route subscribes to at most one Convex query for page data, plus `useCurrentProfile` when
  needed. Pass query-derived data down; do not create nested subscriptions for the same screen.
- Pages compose — heavy JSX at the page level is the intended shape. Widgets receive data and
  callbacks from their page and never fetch or route.
- Document-only render targets and non-visual auth handoffs are the intentional route-layout
  exceptions.

## Styling ownership

- The kit owns the pane treatment (`Surface`), heading levels (depth-derived), and typography
  defaults (`src/ui/theme.ts`). Pages do not restate them.
- CSS Modules are valid for domain visuals, shell ownership, and page-specific composition; a
  component's TSX owner is the only importer of its stylesheet. No CSS `composes`.
- Placement (`className`) may be passed into kit components; appearance may not.
- TanStack Router's typed `Link` owns navigation; Mantine and kit components reach it through
  `renderRoot` at the call site.

## Renderer isolation checklist

- No Mantine or `@ui` imports under `src/game/**`.
- No Mantine provider, theme, styles, or component imports in sheet, print, capture, or
  publishing renderer entry points.
- Embedded game visuals may be positioned by application-page layout, but their internals and
  output remain unchanged.
