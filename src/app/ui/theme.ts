import { Checkbox, Radio, Switch, Tabs, createTheme, defaultVariantColorsResolver } from '@mantine/core';
import type { MantineColorsTuple } from '@mantine/core';

import styles from './theme.module.css';

/*
 * Color values live in styles/tokens.css, the single source of truth, with dark overrides under
 * `:root[data-mantine-color-scheme='dark']`. Slots whose values flow to the DOM verbatim reference
 * them via var() and flip with the scheme for free.
 *
 * The color tuples below are the exception: Mantine parses tuple hex to bake hover and light-variant
 * derivations, so they stay literal. They are Mantine-internal ramps, not mirrors of tokens.css.
 * `white`/`black` are scheme-invariant inks by Mantine's contract (filled-component text in both
 * schemes); they bind to the non-flipping --color-paper/--color-ink tokens, never to ones that
 * flip. Never combine `autoContrast` or `color="white"/"black"/"bright"` with var()-valued slots:
 * Mantine's luminance check reads every var() string as dark.
 */

const dune: MantineColorsTuple = [
  '#fff8ed',
  '#fee7c0',
  '#f8dca5',
  '#f4cf8b',
  '#f8af40',
  '#e39a38',
  '#c78346',
  '#a75b2b',
  '#84220c',
  '#5d1708',
];

const warmGray: MantineColorsTuple = [
  '#fffaf2',
  '#f7f1e7',
  '#ece6dc',
  '#ddd5c8',
  '#c4b9a8',
  '#a09280',
  '#735c47',
  '#57483b',
  '#403631',
  '#2e2927',
];

const confirm: MantineColorsTuple = [
  '#f4f8f0',
  '#e1ebd9',
  '#c8d6bc',
  '#aac196',
  '#8dac74',
  '#7f9e66',
  '#6f8e57',
  '#607c49',
  '#50683e',
  '#3f542f',
];

const danger: MantineColorsTuple = [
  '#fff3ee',
  '#f6ddd4',
  '#e5c2b7',
  '#d99582',
  '#c76349',
  '#b5533b',
  '#9f4530',
  '#873824',
  '#6d2b1b',
  '#531f13',
];

/*
 * In dark mode Mantine derives text, body, borders, dimmed, and disabled from the `dark` tuple,
 * not from our tokens, so the stock cool-gray ramp is replaced with the Twilight warm-navy ramp.
 */
const twilightNavy: MantineColorsTuple = [
  '#ece7dc',
  '#c6c9d4',
  '#9aa2b4',
  '#6b7690',
  '#43536e',
  '#2b3648',
  '#1d2635',
  '#141c2b',
  '#0f1622',
  '#0a0f1a',
];

const contentFontFamily = '"C_Candara", Candara, sans-serif';

/**
 * The engraved face the wordmark uses.
 * `styles/fonts.css` already sets it on every bare `h1` through `h6`;
 * naming it here too is what stops a heading's face depending on whether its author reached for `<h2>` or `<Title order={2}>`.
 */
const headingFontFamily = '"C_Copperplate_Gothic", sans-serif';

const glassSurface = {
  backgroundColor: 'var(--glass-surface-1)',
  borderColor: 'var(--panel-border)',
  boxShadow: 'var(--panel-shadow)',
  backdropFilter: 'blur(8px)',
};

export const appContentTheme = createTheme({
  fontFamily: contentFontFamily,
  headings: {
    fontFamily: headingFontFamily,
    fontWeight: '700',
  },
  white: 'var(--color-paper)',
  black: 'var(--color-ink)',
  colors: {
    dune,
    /* Selection uses the neutral Twilight ramp; ownership keeps the dune palette. */
    selected: twilightNavy,
    gray: warmGray,
    dark: twilightNavy,
    confirm,
    red: danger,
  },
  primaryColor: 'dune',
  primaryShade: { light: 8, dark: 8 },
  variantColorResolver: (input) => {
    const resolved = defaultVariantColorsResolver(input);
    if (input.color !== 'selected') {
      return resolved;
    }
    if (input.variant === 'filled' || input.variant === 'light') {
      return {
        ...resolved,
        background: 'var(--button-toggle-active-bg)',
        hover: 'var(--button-toggle-hover-bg)',
        color: 'var(--button-toggle-fg)',
      };
    }
    if (input.variant === 'subtle' || input.variant === 'outline' || input.variant === 'transparent') {
      return {
        ...resolved,
        border: input.variant === 'outline' ? '1px solid var(--selection-border)' : resolved.border,
        color: 'var(--button-toggle-fg)',
        hover: input.variant === 'transparent' ? 'transparent' : 'var(--button-toggle-hover-bg)',
      };
    }
    return resolved;
  },
  defaultRadius: 'sm',
  /*
   * Spacing joins the slots that flow to the DOM verbatim, so `gap="md"` and `var(--space-md)` are
   * the same number and both shrink at the breakpoints tokens.css sets.
   * Mantine assigns these strings straight into --mantine-spacing-*, so the var() survives; a
   * numeric prop such as gap={4} is baked instead and cannot follow the scale.
   */
  spacing: {
    xs: 'var(--space-xs)',
    sm: 'var(--space-sm)',
    md: 'var(--space-md)',
    lg: 'var(--space-lg)',
    xl: 'var(--space-xl)',
  },
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  shadows: {
    xs: '0 2px 8px rgba(38, 24, 11, 0.12)',
    sm: 'var(--panel-shadow)',
    md: '0 8px 24px rgba(38, 24, 11, 0.22)',
    lg: '0 12px 36px rgba(38, 24, 11, 0.26)',
    xl: '0 18px 48px rgba(38, 24, 11, 0.3)',
  },
  components: {
    Combobox: { classNames: { option: styles.selectedOption } },
    Select: { classNames: { option: styles.selectedOption } },
    MultiSelect: { classNames: { option: styles.selectedOption } },
    Autocomplete: { classNames: { option: styles.selectedOption } },
    TagsInput: { classNames: { option: styles.selectedOption } },
    Chip: { defaultProps: { color: 'selected' } },
    NavLink: { defaultProps: { color: 'selected' } },
    Checkbox: Checkbox.extend({
      defaultProps: { color: 'selected' },
      vars: (_, { color, iconColor, variant }) => ({
        root:
          color === 'selected'
            ? {
                '--checkbox-color':
                  variant === 'outline' ? 'var(--button-toggle-fg)' : 'var(--button-toggle-active-bg)',
                '--checkbox-icon-color': iconColor ? undefined : 'var(--button-toggle-fg)',
              }
            : {},
      }),
    }),
    Radio: Radio.extend({
      defaultProps: { color: 'selected' },
      vars: (_, { color, iconColor, variant }) => ({
        root:
          color === 'selected'
            ? {
                '--radio-color': variant === 'outline' ? 'var(--button-toggle-fg)' : 'var(--button-toggle-active-bg)',
                '--radio-icon-color': iconColor ? undefined : 'var(--button-toggle-fg)',
              }
            : {},
      }),
    }),
    Switch: Switch.extend({
      defaultProps: { color: 'selected' },
      classNames: (_, { color }) => ({ track: color === 'selected' ? styles.selectedSwitch : undefined }),
      vars: (_, { color }) => ({
        root: color === 'selected' ? { '--switch-color': 'var(--button-toggle-active-bg)' } : {},
      }),
    }),
    Tabs: Tabs.extend({
      defaultProps: { color: 'selected' },
      vars: (_, { color, variant }) => ({
        root:
          color === 'selected'
            ? {
                '--tabs-color': variant === 'pills' ? 'var(--button-toggle-active-bg)' : 'var(--selection-border)',
                '--tabs-text-color': 'var(--button-toggle-fg)',
              }
            : {},
      }),
    }),
    Popover: {
      styles: {
        dropdown: {
          ...glassSurface,
          backgroundColor: 'var(--glass-overlay)',
        },
      },
    },
    /* A menu's dropdown is the same pane as a popover's; without this it renders unthemed beside one. */
    Menu: {
      styles: {
        dropdown: {
          ...glassSurface,
          backgroundColor: 'var(--glass-overlay)',
        },
      },
    },
    /*
     * A drawer is a floating pane like the two above, and it used to get this treatment by accident:
     * Mantine renders a drawer's content as a `Paper`, so the Paper mapping painted it second-hand.
     * That mapping is gone, so the drawer asks for the pane by name.
     * Verified by render: a `Drawer.content` entry and the old `Paper.root` entry reach the same
     * `<section class="mantine-Drawer-content">`.
     */
    Drawer: {
      styles: {
        content: {
          ...glassSurface,
          backgroundColor: 'var(--glass-overlay)',
        },
      },
    },
  },
});
