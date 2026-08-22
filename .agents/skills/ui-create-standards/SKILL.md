---
name: ui-create-standards
description: Design and implement application UI with Mantine-first ownership, domain-visual exceptions, and strict renderer isolation. Use when adding or refactoring UI, creating shared components, choosing layout or styling approaches, or checking consistency with repository UI patterns.
---

# Mantine-First UI Standards

## Quick start

1. Read [UI design decisions](../../../docs/technical/ui-design-decisions.md) and [UI component hierarchy](../../../docs/technical/ui-component-hierarchy.md).
2. Identify the surface: standard application UI, shared content composition, domain UI, application shell, or isolated renderer.
3. For standard application UI, discover a Mantine component first and use Mantine UI as the preferred composition-reference catalogue.
4. Compose Mantine directly at the route or owning component before considering a local wrapper.
5. Preserve domain visuals and renderer boundaries; add locally owned shared components only for proven product semantics.

Mantine is the adopted direction even before the foundation dependency lands. Until it is installed, do not extend the legacy primitive system or add Mantine imports prematurely; keep the change scoped to the appropriate foundation or migration work.

## Ownership decision

Classify every UI concern before implementation:

| Concern | Default owner |
|---|---|
| Standard controls, surfaces, layout, feedback, overlays, and typography | Mantine components, used directly |
| Page-level composition references | Mantine UI patterns, adapted route-locally first |
| Repeated product semantics or repeated content composition | A locally owned shared content component |
| Dune Zone identity, behavior, or data-rich visuals | A domain component |
| Persistent product chrome and route slots | Existing `AppShell` and `PageLayout` |
| Game assets, sheets, print, capture, and publishing output | Isolated renderer code with no Mantine dependency or styling |

`FactionListItem`, leader/troop/planet showcases, and similar identity-rich components are valid domain visuals. This exception does not justify new generic buttons, cards, fields, toolbars, accordions, description lists, or layout stacks.

## Discovery workflow

### Standard application UI

1. Check Mantine for a maintained component that matches the interaction and accessibility semantics.
2. Check the free Mantine UI catalogue for a composition pattern.
3. Adapt the composition in the route or owning component, keeping `PageLayout` ownership at the terminal route.
4. Extract a shared composition only after repeated product semantics or repeated composition are demonstrated.

Prefer direct `Button`, `ActionIcon`, `Stack`, `Group`, `Grid`, `Text`, `Title`, `Tooltip`, field, and overlay composition. A pane comes from the kit's `Surface`, never from a Mantine `Paper`. Do not create wrappers whose only purpose is renaming or lightly forwarding Mantine APIs. For navigation controls, use Mantine's router integration at the call site; extract an adapter only when repeated use proves it can preserve TanStack Router's typed contract.

### Domain UI

Search relevant domain folders and nearby routes for existing behavior and identity-rich visuals. Keep domain components domain-honest and let them compose Mantine around their specific core. Preserve small concern boundaries; do not extract a component merely to move a page fragment into another file.

### Legacy migration paths

The following are migration-only compatibility code, not discovery targets for new UI:

- `src/app/components/generic/ui/**`
- `src/app/components/generic/layout/**`
- `src/app/components/generic/surfaces/**`
- presentation primitives under `src/app/components/form/**`

Do not add new consumers or expand these APIs. Existing domain behavior that happens to compose them is not blanket-deprecated; migrate its standard presentation when that consumer is in scope. TanStack Form, shared validation, and domain behavior remain authoritative.

## Composition and styling

- Prefer Mantine component, layout, and semantic props for ordinary application UI.
- Use Mantine theme variables and Styles API for system-level customization.
- Keep CSS Modules for domain visuals, existing shell ownership, and page-specific composition Mantine cannot express clearly.
- Keep CSS module ownership local to its TSX owner. Do not import another component's CSS module.
- Never use CSS `composes`; combine owned classes and component APIs in TSX.
- Keep routine spacing in the parent composition. Prefer flex plus `gap` for one-dimensional layouts and grid for two-dimensional layouts when custom layout is justified.
- Do not globally target Mantine internal selectors for routine styling.

Ask for user direction when a proposed exception would establish a new system-level visual rule, create a broad shared API without demonstrated reuse, or change a domain visual's identity. Minor route-local composition choices do not require a pause.

## Hard rendering boundary

Do not add Mantine imports, theme dependencies, CSS, provider usage, or styling assumptions to:

- `src/game/**`;
- faction sheet or other document renderers;
- print styles;
- capture entry points under `src/app/print/capture/**`;
- publishing renderer entry points.

Mantine may arrange an embedded game visual in an application page, but it must not style the visual's internals or change its rendered output.

## Data and route composition

- Terminal visual routes render `PageLayout` and own their header, toolbar, loading, error, empty, and authorization states.
- Nested parent routes remain outlet-only; document renderers and non-visual auth callbacks are intentional exceptions.
- Each route uses at most one Convex page-data query plus `useCurrentProfile` when needed. Pass prefetched data into child controls instead of adding subscriptions.

## Accessibility and action semantics

- Keep one clear primary positive toolbar action; map visual treatment from semantic intent.
- Use destructive treatment for destructive or irreversible actions and neutral treatment for utility actions.
- Use icon-only actions only for established, recognizable actions. Always provide an accessible name, and add explanatory tooltip text when the icon may need reinforcement.

## Storybook requirements

Installed Mantine components and route-local Mantine compositions do not need duplicate local stories. Add representative colocated stories for new or materially changed locally owned shared content and domain components when visual states or reusable usage need documentation. Cover the meaningful variants and interaction states of the owned behavior.

## Final checklist

- [ ] Surface ownership was classified before implementation.
- [ ] Standard UI started with Mantine and Mantine UI discovery.
- [ ] Mantine APIs are composed directly; no rename-only wrapper was introduced.
- [ ] No new consumer or API was added to migration-only legacy presentation paths.
- [ ] Domain visuals retain their behavior and identity.
- [ ] Game, sheet, print, capture, and publishing renderers have no Mantine dependency or styling.
- [ ] Terminal routes own `PageLayout` composition and follow the one-page-query rule.
- [ ] Action semantics and icon-only accessibility are explicit.
- [ ] Locally owned shared components have representative stories; Mantine itself is not duplicated in Storybook.
- [ ] CSS ownership is local and no CSS `composes` was introduced.
