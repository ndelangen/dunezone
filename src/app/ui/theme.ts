import { Checkbox, Radio, Switch, Tabs, createTheme, defaultVariantColorsResolver } from '@mantine/core';
import type { MantineColorSchemeManager } from '@mantine/core';
import { playUiColors, themeRamps, withAlpha } from '@shared/uiPalette';

import styles from './theme.module.css';

/*
 * Palette values and Mantine ramps live in src/shared/uiPalette.ts.
 * The generated stylesheet provides the CSS variables; slots whose values reach the DOM verbatim
 * reference those variables, while Mantine takes the same source's literal ramps to derive variants.
 *
 * `white`/`black` are scheme-invariant inks by Mantine's contract (filled-component text in both
 * schemes); they bind to the non-flipping --color-paper/--color-ink tokens, never to ones that
 * flip. Never combine `autoContrast` or `color="white"/"black"/"bright"` with var()-valued slots:
 * Mantine's luminance check reads every var() string as dark.
 */

/** The app is dark-only, including when an older Mantine preference remains in storage. */
export const appColorSchemeManager: MantineColorSchemeManager = {
  get: () => 'dark',
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

/*
 * In dark mode Mantine derives text, body, borders, dimmed, and disabled from the `dark` tuple,
 * not from our tokens, so the stock cool-gray ramp is replaced with warm mineral neutrals.
 */

const { slate, confirm, red: danger, dark: warmDark } = themeRamps;

const contentFontFamily = '"C_Candara", Candara, sans-serif';

/**
 * The engraved face the wordmark uses.
 * `styles/fonts.css` already sets it on every bare `h1` through `h6`;
 * naming it here too is what stops a heading's face depending on whether its author reached for `<h2>` or `<Title order={2}>`.
 */
const headingFontFamily = '"C_Copperplate_Gothic", sans-serif';

const glassSurface = {
  backgroundColor: 'rgb(from var(--glass-surface-1) r g b / var(--glass-surface-1-alpha))',
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
    ...themeRamps,
    orange: themeRamps.yellow,
    green: confirm,
    lime: confirm,
    teal: confirm,
    cyan: themeRamps.blue,
    indigo: themeRamps.blue,
    grape: themeRamps.violet,
    pink: danger,
    slate,
    /* Existing dune-named UI colours resolve to slate too. Game artwork owns its own palette. */
    dune: slate,
    selected: warmDark,
    gray: slate,
    dark: warmDark,
    confirm,
    red: danger,
  },
  primaryColor: 'cta',
  primaryShade: { light: 8, dark: 8 },
  focusClassName: styles.focus,
  variantColorResolver: (input) => {
    const resolved = defaultVariantColorsResolver(input);
    const family = (input.color ?? input.theme.primaryColor).split('.')[0];
    if (family === 'cta' && input.variant === 'artwork') {
      return {
        background: 'var(--ui-ground)',
        hover: 'var(--ui-raised)',
        color: 'var(--color-paper)',
        border: 'transparent',
      };
    }
    if ((family === 'brand' || family === 'cta') && input.variant === 'filled') {
      return {
        ...resolved,
        color: 'var(--color-ink)',
        hover: `color-mix(in srgb, ${resolved.background} 88%, var(--color-white))`,
      };
    }
    const signal = ['confirm', 'green', 'lime', 'teal'].includes(family)
      ? '--color-positive'
      : family === 'red' || family === 'pink'
        ? '--color-error'
        : family === 'yellow' || family === 'orange'
          ? '--color-caution'
          : ['blue', 'cyan', 'indigo'].includes(family)
            ? '--color-progress'
            : family === 'violet' || family === 'grape'
              ? '--color-publish'
              : null;
    if (signal && input.variant === 'filled') {
      return {
        ...resolved,
        hover: `color-mix(in srgb, ${resolved.background} 88%, var(--color-shadow))`,
      };
    }
    if (signal && ['light', 'subtle', 'outline', 'transparent'].includes(input.variant)) {
      return {
        ...resolved,
        color: `var(${signal})`,
        border: input.variant === 'outline' ? `1px solid rgb(from var(${signal}) r g b / 0.5)` : resolved.border,
        background: input.variant === 'light' ? `rgb(from var(${signal}) r g b / 0.16)` : resolved.background,
        hover: input.variant === 'transparent' ? 'transparent' : `rgb(from var(${signal}) r g b / 0.24)`,
      };
    }
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
    xs: `0 2px 8px ${withAlpha(playUiColors.shadowWarm, 0.12)}`,
    sm: 'var(--panel-shadow)',
    md: `0 8px 24px ${withAlpha(playUiColors.shadowWarm, 0.22)}`,
    lg: `0 12px 36px ${withAlpha(playUiColors.shadowWarm, 0.26)}`,
    xl: `0 18px 48px ${withAlpha(playUiColors.shadowWarm, 0.3)}`,
  },
  components: {
    Button: { classNames: { root: styles.button } },
    Input: {
      vars: () => ({ wrapper: { '--input-bd-focus': 'var(--color-focus-ring)' } }),
    },
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
          backgroundColor: 'rgb(from var(--glass-overlay) r g b / var(--glass-overlay-alpha))',
        },
      },
    },
    /* A menu's dropdown is the same pane as a popover's; without this it renders unthemed beside one. */
    Menu: {
      styles: {
        dropdown: {
          ...glassSurface,
          backgroundColor: 'rgb(from var(--glass-overlay) r g b / var(--glass-overlay-alpha))',
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
          backgroundColor: 'rgb(from var(--glass-overlay) r g b / var(--glass-overlay-alpha))',
        },
      },
    },
  },
});
