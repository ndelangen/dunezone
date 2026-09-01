# Dune UI design memory

This file is the source of truth for the Dune **aesthetic**: the palette, the glass, the borders,
the rhythm. Future changes should preserve this language unless explicitly asked to diverge.

It is not the source of truth for **structure**. Which component a concern belongs to, and which
folder it lives in, is the component taxonomy in [`AGENTS.md`](AGENTS.md#component-taxonomy), with the
decision log in [`docs/technical/ui-design-decisions.md`](docs/technical/ui-design-decisions.md).

## Core aesthetic

- Compact and concise over spacious.
- Glass surfaces with subtle blur on interactive containers.
- Strong `2px` borders as a primary visual motif.
- Controls should stand out clearly over glass surfaces with strong contrast.
- Warm sand palette aligned with `public/web/page.jpg` and `public/web/head.png`.
- Icon-only action controls as the default, with clear tooltip labels.

## Design tokens

Global tokens live in `src/app/styles/tokens.css` and are imported by `src/app/routes/__root.tsx`.

### Color roles

- `--color-text`: primary text
- `--color-muted`: secondary/help text
- `--color-link`: links
- `--color-error`: destructive/error states
- `--color-brand`, `--color-brand-strong`: highlights and active emphasis
- `--color-focus-ring`: focus outlines

### Button semantics

- `Toggle` (`--button-toggle-*`): the only button family a component reads. Its one reader is `SortableDnd`'s reorder handle, which takes the background, hover background and foreground. No `aria-pressed` control reads it, and `--button-toggle-active-bg` has no reader at all; it is kept because a real toggle would need it, not because something paints with it today.
- `--button-neutral-*` still exists, but it is not a family to reach for: it is where `--button-toggle-*` gets its light and dark values from, and the dark block redefines neutral rather than toggle.

A button's intent is said with a variant word rather than a colour family; see the variant language in `docs/technical/ui-design-decisions.md`. The `Confirm`, `Add`, `Danger` and disabled families this section used to list were removed once nothing read them.

### Glass + Surface

- `--glass-surface-0`, `--glass-surface-1`, `--glass-surface-2`
- `--glass-input`, `--glass-overlay`
- `--glass-blur-sm`, `--glass-blur-md`

### Shared form foundations

- `--panel-bg`, `--panel-border`, `--panel-shadow`, `--panel-radius`
- `--input-bg`, `--input-border`
- `--border-strong` (canonical 2px border)
- `--input-border-strong`, `--field-shadow` for high-contrast controls

### Radius, spacing, sizing

- `--radius-sm`, `--radius-md`, `--radius-pill`
- `--space-xs` through `--space-xl`, the one spacing scale, responsive at 48em and 62em
- `--control-h-sm`, `--control-h-md`
- `--control-px-sm`, `--control-px-md`
- `--icon-sm`, `--icon-md`

## Controls

Controls come from `src/ui/control` and from Mantine under `appContentTheme`; the home-grown
`components/form` layer they replaced is gone. `ControlBlock` carries label, hint, and error
semantics; `IconAction` carries an icon-only action and its accessible name; `CallToAction` carries
the forward-moving primary. Reach for Mantine's `TextInput`, `Textarea`, `Select`, and `ColorInput`
directly rather than wrapping them; they are storied under our theme, filed by kind.

The aesthetic those controls must keep:

- Icon-only action controls are the default, with the action's name always available as hover text.
- Buttons are solid colour, borderless, and shadowless in base/hover/active states.
- Focus indicators may use ring shadows for accessibility; drop shadows are otherwise reserved for
  panes, which are `Surface`'s business.
- Prefer a popover for a lightweight preview or contextual configuration over a new page region.

## Accessibility requirements

- Icon-only actions must include `aria-label`.
- Inputs with errors should set `aria-invalid` and expose error text through `aria-describedby`.
- Tooltips are additive, not the only source of critical information.
- Focus indicators must remain clearly visible on glass backgrounds.
- Keep keyboard workflows first-class for combobox/select/popover interactions.

## Faction editor UX patterns

The editor is a Widget, `src/app/widgets/faction-editor`, and owns its own spacing through its CSS
modules; the shared `formRow` / `arrayCardGrid` / `formRowActions` classes it once used are gone.

- Keep accordion sections dense but scannable.
- Keep tiny asset previews near pickers and popovers.
- For destructive actions, use danger styling plus a trash icon and hover text.
- For additive actions, use a plus icon and hover text, with no visible text label.
- In the editor toolbar, `Reset` and `Close` are destructive intents and use danger styling.
- For stateful toggles that add or remove optional content, the icon may change by state to make the
  active state obvious (`Rotate3d` marks the reversible-troop toggle).

## Do / Don't

- Do reuse tokens before introducing literals.
- Do keep border thickness and blur consistent with form primitives.
- Do keep control surfaces (buttons/inputs/selects) flat; reserve drop shadow for panel-like containers.
- Do use compact spacing unless content readability suffers.
- Don't introduce bright saturated colors that clash with the desert palette.
- Don't use text-heavy button bars where icons are sufficient.
- Don't add new one-off styling systems outside the token layer.

## Checklist for a new page

1. Source controls from `src/ui/control` and Mantine; add nothing that merely renames a Mantine
   component. If a concern repeats and no kit component owns it, extract to the right category first.
2. Reuse the tokens below before introducing a literal.
3. Give every icon-only action an accessible name (`IconAction`'s `label` is both).
4. Add popovers where previews or contextual controls improve speed.
5. Verify keyboard navigation and visible focus states.
6. Confirm visuals match glass + 2px border + compact rhythm.
7. Compose through `PageLayout`, and let `Surface` own any pane; surfaces never nest.
