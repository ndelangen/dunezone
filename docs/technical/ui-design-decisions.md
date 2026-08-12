# UI design decisions

This document records durable UI decisions for consistency across features.

## How to use this log

- Treat entries with `Status: accepted` as defaults.
- If a change needs to violate an accepted decision, get explicit user approval first.
- Add new entries instead of silently changing old ones.

## Entry template

```md
## DD-XXX: Decision title
- Status: accepted | proposed | superseded
- Context: Why this decision exists.
- Rule: The default behavior to follow.
- Examples: Concrete examples and mappings.
- Exceptions: Allowed exceptions and approval requirements.
- Changed on: YYYY-MM-DD
```

## DD-001: Reuse existing shared components first
- Status: superseded
- Context: UI drift and duplication increase when new components are created before surveying existing primitives.
- Rule: Always check `src/app/components/generic/ui`, `src/app/components/form`, `src/app/components/generic/layout`, and `src/app/components/generic/surfaces` before creating new UI components.
- Examples:
  - Extend with `props`, `className`, or composition before introducing a new shared component.
  - Keep feature-local code local unless the pattern clearly repeats.
- Exceptions:
  - New component is allowed when no existing component can satisfy requirements without awkward API growth.
  - Confirm with user before creating a new shared API if reuse options are not exhausted.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. The listed legacy presentation paths are now migration-only; discovery starts with Mantine for standard UI.

## DD-002: Component layering and dependency direction
- Status: superseded
- Context: Layer violations (`generic` importing domain code) create tight coupling and brittle reuse.
- Rule: Preserve direction `generic/ui` -> `form` -> `generic/layout|generic/surfaces` -> `features/routes`. Never import upward.
- Examples:
  - `generic/ui/**` imports only `generic/ui` and shared tokens.
  - `form/**` can import `generic/ui` and shared tokens.
  - Features/routes can import `generic/**` and `form/**`.
- Exceptions:
  - None by default; treat violations as architecture exceptions requiring explicit approval.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. The legacy generic/form/layout hierarchy is replaced by the Mantine, shared-content, domain, shell, and renderer ownership model.

## DD-003: Layout spacing uses reusable wrappers, flex + gap, and grid
- Status: superseded
- Context: Margin-led spacing in leaf components causes inconsistent layout behavior.
- Rule: Handle spacing and alignment in reusable parent layout wrappers. Prefer flexbox + `gap` for one-dimensional layout and CSS Grid for two-dimensional layout.
- Examples:
  - Use stack/row/grid-style wrappers to orchestrate spacing.
  - Keep leaf controls focused on control concerns, not page spacing.
- Exceptions:
  - Margin may be used only for unavoidable third-party constraints and should be documented in implementation notes.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. Flex, `gap`, grid, and parent-owned spacing remain useful, but new reusable legacy layout wrappers are no longer the default.

## DD-004: Avoid custom CSS and prohibit CSS composes
- Status: superseded
- Context: Excess custom CSS and cross-module style composition hide ownership and reduce maintainability.
- Rule: Prefer composing existing components and classes in TSX. Avoid custom CSS when existing primitives/wrappers solve the need. Do not use CSS `composes`.
- Examples:
  - Apply multiple classes with `clsx` in component code rather than style inheritance.
  - Keep CSS module ownership local to the component that owns it.
- Exceptions:
  - Custom CSS can be added when composition cannot satisfy requirements and the exception is explicitly approved.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. Mantine APIs are the standard-UI default; CSS Modules remain valid for domain, shell, and justified page-specific ownership, while `composes` remains prohibited.

## DD-005: Icon-only buttons are for established actions with explicit semantics
- Status: accepted
- Context: Icon-only actions are harder to parse and can become ambiguous without consistent semantics.
- Rule: Use icon-only buttons for common, recognizable actions and pair them with clear intent/variant selection.
- Examples:
  - Primary positive toolbar action should use confirm semantics where applicable.
  - Destructive icon-only actions should use danger/critical semantics.
  - Use accessible labeling (for example `aria-label`) so meaning is explicit.
- Exceptions:
  - If icon meaning is ambiguous for the context, prefer text-labeled button or composite control.
- Changed on: 2026-03-25

## DD-006: Toolbar primary-action hierarchy
- Status: accepted
- Context: Toolbars become noisy when multiple actions compete as primary.
- Rule: In a multi-action toolbar, keep one clear primary positive action; style it with confirm semantics unless product direction says otherwise.
- Examples:
  - `Create`, `Start`, `Add`, `Save`, `Confirm` default to confirm/primary positive styling.
  - Secondary and utility actions use secondary/nav styles.
- Exceptions:
  - Non-confirm primary action is allowed only with explicit product/user direction.
- Changed on: 2026-03-25

## DD-007: Button color intent mapping
- Status: accepted
- Context: Inconsistent color semantics make actions unpredictable and increase user error risk.
- Rule: Choose variant by semantic intent first, then visual style.
- Examples:
  - Positive primary actions: `confirm` (or primary where confirm is not available).
  - Neutral/auxiliary actions: `secondary` or `nav`.
  - Destructive/irreversible actions: `critical` or `danger`.
- Exceptions:
  - Product-directed visual overrides are allowed with explicit instruction.
- Changed on: 2026-03-25

## DD-008: Generic components require Storybook stories
- Status: superseded
- Context: Stories document usage, prevent regressions, and improve AI discoverability of intended APIs.
- Rule: Every new generic component must include `*.stories.tsx` in the same area.
- Examples:
  - Include default state, key variants, relevant interaction states, and a composition example in a reusable layout wrapper.
- Exceptions:
  - No default exceptions; missing stories should block completion for new generic components.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. Installed Mantine components and route-local compositions are exempt from local duplication; locally owned shared and domain components still require representative coverage.

## DD-009: Prefer small composable components over large monoliths
- Status: accepted
- Context: Very large components are harder to reuse, test, and reason about.
- Rule: Split UI into small, focused components when responsibilities or API surface grows.
- Examples:
  - Extract repeated sub-structures into composable subcomponents.
  - Keep each component focused on a single concern.
- Exceptions:
  - Short-lived feature-local components may stay combined temporarily if extraction adds noise; revisit if reuse emerges.
- Changed on: 2026-03-25

## DD-010: Component placement is generic-first but domain-honest
- Status: superseded
- Context: Shared components were difficult to discover and domain-specific code was occasionally exposed as generic API.
- Rule: Place reusable controls under `src/app/components/form/**`, reusable primitives/layout/surfaces under `src/app/components/generic/**`, and domain-coupled components under domain folders (`factions`, `faq`, `profile`, `auth`, etc).
- Examples:
  - Reusable controls belong to `form`; primitives/layout/surfaces belong to `generic/ui`, `generic/layout`, `generic/surfaces`.
  - Faction editor widgets stay under `factions/editor` and are imported directly from that domain.
- Exceptions:
  - None by default. Duplicate wrappers and parallel import paths for the same shared component are not allowed.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. Standard presentation is Mantine-owned, while domain behavior and identity-rich visuals remain locally owned.

## DD-011: One shared component, one canonical path
- Status: superseded
- Context: Parallel paths (`components/ui` plus `components/generic/ui`) made shared components hard to discover and caused duplicate usage patterns.
- Rule: Shared components must use one canonical path: controls via `@app/components/form/...`, other shared primitives via `@app/components/generic/...`.
- Examples:
  - `UIButton` and `IconButton` live in `generic/ui`.
  - `TextField` lives in `form`.
  - `Card` and `Block` live in `generic/surfaces`.
  - Product-specific `AppShell` and `PageLayout` live in `components/shell`.
- Exceptions:
  - None by default.
- Changed on: 2026-03-25
- Superseded on: 2026-07-19 by DD-015. One canonical owner remains required, but the standard-UI owner is Mantine and the named legacy paths are migration-only.

## DD-012: Components are concern boundaries, not sub-views
- Status: accepted
- Context: Extracting chunks of JSX into \"helper\" components without a clear responsibility boundary leads to prop bloat, indirection, and harder reasoning, while providing little reuse. We observed this with `RulesetGroupToolbarControl`, which was just a fragment of the ruleset detail toolbar and required many props mirroring route-local state.
- Rule: Only extract a component when it represents a real concern boundary (behavior or domain concept), not merely a sub-section of a single page's layout. Keep view-only sub-views inline in the route or feature component.
- Examples:
  - Good: `GroupAssignPopover` owns assignment picking and search UX over server-derived `assignableGroups`, with a small semantic API (`disabled`, `assignableGroups`, `onAssignGroup`, and optional text props). Faction and ruleset routes wrap it with thin adapters.
  - Good: A reusable search box component that manages debounced navigation and accessible labeling.
  - Bad: A `*ToolbarControl` component that only renders one page's toolbar row and needs many props like `rulesetId`, `rulesetName`, `groupId`, `groupSlug`, `groupName`, `isOwner`, `membershipStatus`, `canRequestMembership`, `onRequestMembership`, `canEditGroup`, `onChangeGroup`.
  - Bad: Moving a long JSX block out of a route into a separate file without reducing responsibility or API surface, just to \"make it shorter\".
- Exceptions:
  - Very large routes can still be split for readability, but the extracted pieces should either:
    - Form real concern-boundary components (as above), or
    - Be kept as local helper functions in the same file, not exported feature components.
  - If in doubt, prefer inlining and only extract when a clear responsibility and small prop surface emerge.
- Changed on: 2026-04-01

## DD-013: One Convex page query plus optional profile
- Status: accepted
- Context: Mounting several `useQuery` hooks on the same route (page data plus nested component queries) multiplies subscriptions, complicates loading states, and scatters the authoritative shape of a screen across Convex functions.
- Rule: Each route should subscribe to **at most one Convex query for page data**, plus **`useCurrentProfile` when needed** for auth-aware UI. Derive UI-ready fields in that page query; avoid child hooks that issue additional Convex queries for the same screen unless an explicit exception is approved.
- Examples:
  - Bundle data the page needs into one query (e.g. ruleset `detailPageBySlug` including FAQ, viewer access, owner, and assignable Group summaries).
  - Pass server-derived collections into controls such as `GroupAssignPopover` via `assignableGroups` instead of exposing raw membership transport or adding a child subscription.
- Exceptions:
  - Mutations are not counted against this limit.
  - Intentional lazy loading or rare technical constraints require explicit call-out in review.
- Changed on: 2026-04-04

## DD-014: Leaf routes own page composition
- Status: accepted
- Context: A parent-owned `staticData.PageHead` bridge split one screen into detached header and body sub-views, duplicated page subscriptions, and hid the complete page composition across router metadata and the app shell.
- Rule: Every terminal `_app` route renders `PageLayout` directly and supplies its `header` and optional `toolbar` slots alongside its content. Nested route parents are outlet-only. `AppShell` owns only persistent application chrome and document effects.
- Examples:
  - A detail route reads its page query once, then passes query-backed identity to `header`, actions to `toolbar`, and feature components as children.
  - Loading, error, empty, and authorization states still render through `PageLayout` so page chrome stays consistent.
  - The faction-sheet preview intentionally omits `AppShell` and `PageLayout` because it is a document-rendering surface.
- Exceptions:
  - Auth hand-off/redirect routes and document-only render targets may use a purpose-built layout.
  - Do not reintroduce router metadata, context registration, or portals solely to move page header content into a parent shell.
- Changed on: 2026-07-18

## DD-015: Mantine owns standard application-content UI
- Status: superseded
- Context: The home-grown generic primitive, form-presentation, layout, and surface layers duplicated maintained library concerns and encouraged new work to deepen a parallel component system. The application still needs clear ownership for product-specific composition, distinctive Dune Zone visuals, and precision-rendered game and document output.
- Rule:
  - Use Mantine directly for standard application controls, surfaces, layout, feedback, overlays, and typography.
  - Use the free Mantine UI catalogue as the preferred page-composition reference. Adapt patterns route-locally first; extract locally owned shared content only after repeated product semantics or repeated composition are demonstrated.
  - Do not create local wrappers that merely rename or lightly forward Mantine components.
  - Keep Dune Zone behavior and identity-rich visuals in domain components. `FactionListItem`, leader/troop/planet showcases, and similar visuals may remain custom while composing Mantine around their domain-specific core.
  - Keep game, sheet, print, capture, and publishing renderers isolated. No Mantine dependency, provider, theme, stylesheet, styling assumption, or internal restyling may enter those renderers.
  - Treat `src/app/components/generic/ui/**`, `generic/layout/**`, `generic/surfaces/**`, and current `form/**` presentation primitives as migration-only. Do not add consumers or expand their presentation APIs; migrate and remove them as consumers move. This does not deprecate domain behavior, TanStack Form state, or validation contracts.
  - Preserve route-owned `PageLayout` composition and the one-page-query rule from DD-013 and DD-014.
  - Preserve semantic action hierarchy from DD-005 through DD-007 and focused concern boundaries from DD-009 and DD-012.
  - Installed Mantine components and route-local Mantine compositions do not require duplicate local Storybook stories. New or materially changed locally owned shared content and domain components require representative stories for meaningful variants and interactions.
  - Prefer Mantine APIs and theme facilities for standard styling. CSS Modules remain valid for domain visuals, shell ownership, and page-specific composition Mantine cannot express clearly; CSS `composes` and cross-owned CSS module imports remain prohibited.
- Examples:
  - Compose Mantine `Button`, `ActionIcon`, `Group`, `Stack`, `Paper`, `Text`, and `Title` directly in a terminal route instead of adding another application button, card, or stack wrapper.
  - Keep a faction tile's identity-rich art and game renderer intact while using Mantine for its surrounding page section, heading, actions, and responsive layout.
  - Use Mantine's root-rendering integration with TanStack Router's typed `Link` at call sites; extract a routing adapter only if repeated usage proves it preserves typed `to`, `params`, and `search` without recreating the legacy broad button API.
- Exceptions:
  - `AppShell` and `PageLayout` remain application-owned; Mantine adoption does not authorize redesigning persistent shell appearance.
  - A locally owned shared composition is allowed when it expresses stable product semantics or demonstrated repeated composition, not merely repeated JSX.
  - A domain-specific component may use custom CSS and visuals when standard Mantine UI would erase product meaning or renderer fidelity.
  - Before the Mantine foundation dependency lands, do not add Mantine imports prematurely and do not deepen the legacy primitive system; coordinate the work with the foundation or migration scope.
- Changed on: 2026-07-19
- Superseded on: 2026-08-12 by DD-017. Mantine remains the base library, but a domain-free
  interface kit (`src/ui`) now owns the concerns the app repeats; renderer isolation and the
  no-thin-wrappers rule carry forward.

## DD-016: Recurring topics use one canonical icon mapping
- Status: accepted
- Context: The same topic appeared with different icons between the faction editor and application detail pages, weakening visual recognition.
- Rule: Render recurring topic icons through `TopicIcon`; the faction editor's established mapping is authoritative.
- Examples:
  - Identity: eye; background: image; hero: Caesar; leaders: traitor.
  - Alliance and alliance decals: alliance; troops: Atreides troop.
  - Rules: balance; advantages: Kwisatz Haderach.
- Exceptions:
  - One-off topics without a canonical mapping may keep a locally selected icon until they recur or receive product direction.
  - Renderer-owned game visuals remain isolated and do not consume the application component.
- Changed on: 2026-07-20

## DD-017: The component taxonomy governs all interface components
- Status: accepted
- Context: DD-015 made Mantine the only sanctioned shared layer, so recurring concerns (the pane
  treatment, titled regions, heading levels) were re-spelled at every call site and drifted. A
  domain-free kit was rebuilt deliberately, category by category, with a rule for what may live
  in each.
- Rule: The taxonomy in [`AGENTS.md`](../../AGENTS.md#component-taxonomy) is canonical. Six kit
  categories under `src/ui` — Content, Controls, Lists, Layout, Surfaces, Blocks — each defined
  by what a caller hands the component. Application components keep the same kinds with domain
  knowledge, filed by feature. Widgets (`src/app/widgets`) are the last-resort shared assemblies
  with their own rules. The category is the folder; the folder is the Storybook root.
- Examples:
  - `Surface` owns the pane; surfaces never nest.
  - `Section` (a Block) takes words and owns the heading; loudness derives from depth.
  - `FactionEditor` is a Widget: two routes install it whole; pages own its data.
  - Mantine components the app uses get stories under our theme, filed by kind.
- Exceptions:
  - Thin wrappers that merely rename a Mantine component remain prohibited (carried from DD-015).
  - Game, sheet, print, capture, and publishing renderers stay outside the kit and Mantine.
- Changed on: 2026-08-12
