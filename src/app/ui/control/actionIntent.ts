/*
 * The action language IconAction and LabeledAction share: what an action means (intent), how loudly it sits (emphasis), and the tinted tile a standard action wears.
 * One table, so a glyph-only Delete and a worded Delete are the same red.
 */
import type { ButtonVariant } from '@mantine/core';

/**
 * What the action means to the reader, independent of the palette that renders it.
 * Drawn from the variant language, so the same word means the same thing here as it does on a badge or a picker.
 */
export type ActionIntent = 'neutral' | 'positive' | 'negative' | 'publish' | 'export';

/*
 * The component owns the resolution, so a call site states the meaning and never a hue.
 * Each hue names what happens to the reader's work (Norbert, 2026-09-29):
 * `neutral` changes nothing (go, look, arrange, share, change access), `positive` creates or keeps, `publish` makes it public for good, `export` hands the reader a file to take away, and `negative` loses something for good.
 * Red is kept for what cannot be undone in one step, so removing a Group or logging out is `neutral`.
 */
export const INTENT_COLOR = {
  neutral: 'gray',
  positive: 'confirm',
  negative: 'red',
  publish: 'violet',
  export: 'cyan',
} as const satisfies Record<ActionIntent, string>;

/*
 * A standard tile takes its colours from the tokens rather than Mantine's light variant, which in dark mode paints every glyph near-white and so makes a red Delete look like Back.
 * A pressed toggle keeps its tile: it wears the app's selected look, never a stronger fill, so being on never reads as another colour.
 */
const TILE = {
  neutral: ['var(--action-neutral-bg)', 'var(--action-neutral-hover-bg)', 'var(--action-neutral-fg)'],
  positive: [
    'rgb(from var(--action-positive-bg) r g b / var(--action-positive-bg-alpha))',
    'rgb(from var(--action-positive-hover-bg) r g b / var(--action-positive-hover-bg-alpha))',
    'var(--action-positive-fg)',
  ],
  negative: [
    'rgb(from var(--action-negative-bg) r g b / var(--action-negative-bg-alpha))',
    'rgb(from var(--action-negative-hover-bg) r g b / var(--action-negative-hover-bg-alpha))',
    'var(--action-negative-fg)',
  ],
  publish: [
    'rgb(from var(--action-publish-bg) r g b / var(--action-publish-bg-alpha))',
    'rgb(from var(--action-publish-hover-bg) r g b / var(--action-publish-hover-bg-alpha))',
    'var(--action-publish-fg)',
  ],
  export: [
    'rgb(from var(--action-export-bg) r g b / var(--action-export-bg-alpha))',
    'rgb(from var(--action-export-hover-bg) r g b / var(--action-export-hover-bg-alpha))',
    'var(--action-export-fg)',
  ],
} as const satisfies Record<ActionIntent, readonly [string, string, string]>;

const PRESSED_TILE = [
  'var(--button-toggle-active-bg)',
  'var(--button-toggle-active-bg)',
  'var(--button-toggle-fg)',
] as const;

/** The tinted tile as Mantine CSS variables, under the prefix of the component wearing it: `ai` for `ActionIcon`, `button` for `Button`. */
export function tileVars(intent: ActionIntent, pressed: boolean, prefix: 'ai' | 'button' = 'ai') {
  const [background, hover, color] = pressed ? PRESSED_TILE : TILE[intent];
  return { root: { [`--${prefix}-bg`]: background, [`--${prefix}-hover`]: hover, [`--${prefix}-color`]: color } };
}

/**
 * How loudly the action sits on the page: silent draws no chrome at all even when hovered, quiet blends in until hovered, standard wears a tinted tile, strong is fully filled.
 * The kit's words rather than Mantine's, so the vendor's variant enum never crosses this membrane.
 */
export type ActionEmphasis = 'silent' | 'quiet' | 'standard' | 'strong';

export const EMPHASIS_VARIANT = {
  silent: 'transparent',
  quiet: 'subtle',
  standard: 'light',
  strong: 'filled',
} as const satisfies Record<ActionEmphasis, ButtonVariant>;
