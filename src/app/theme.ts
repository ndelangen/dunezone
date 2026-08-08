import { createTheme } from '@mantine/core';
import type { MantineColorsTuple } from '@mantine/core';

/**
 * Application-content colors mirrored from the persistent shell tokens. Keep this map aligned with
 * styles/tokens.css when the shell palette changes.
 */
const appShellColors = {
  text: '#2e2927',
  muted: '#735c47',
  link: '#84220c',
  error: '#d34409',
  accent: '#f8af40',
  accentStrong: '#c78346',
  focusRing: 'rgba(244, 207, 139, 0.42)',
  surface: 'rgba(255, 255, 255, 0.12)',
  surfaceRaised: 'rgba(255, 253, 248, 0.95)',
  panelBorder: '#fee7c0',
  panelShadow: '0 0 20px 0 rgba(0, 0, 0, 0.166)',
} as const;

const dune: MantineColorsTuple = [
  '#fff8ed',
  appShellColors.panelBorder,
  '#f8dca5',
  '#f4cf8b',
  appShellColors.accent,
  '#e39a38',
  appShellColors.accentStrong,
  '#a75b2b',
  appShellColors.link,
  '#5d1708',
];

const warmGray: MantineColorsTuple = [
  '#fffaf2',
  '#f7f1e7',
  '#ece6dc',
  '#ddd5c8',
  '#c4b9a8',
  '#a09280',
  appShellColors.muted,
  '#57483b',
  '#403631',
  appShellColors.text,
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

const contentFontFamily = '"C_Candara", Candara, sans-serif';

const glassSurface = {
  backgroundColor: appShellColors.surface,
  borderColor: appShellColors.panelBorder,
  boxShadow: appShellColors.panelShadow,
  backdropFilter: 'blur(8px)',
};

export const appContentTheme = createTheme({
  fontFamily: contentFontFamily,
  headings: {
    fontFamily: contentFontFamily,
    fontWeight: '700',
  },
  white: '#fffdf8',
  black: appShellColors.text,
  colors: {
    dune,
    gray: warmGray,
    confirm,
    red: danger,
  },
  primaryColor: 'dune',
  primaryShade: { light: 8, dark: 8 },
  defaultRadius: 'sm',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  shadows: {
    xs: '0 2px 8px rgba(38, 24, 11, 0.12)',
    sm: appShellColors.panelShadow,
    md: '0 8px 24px rgba(38, 24, 11, 0.22)',
    lg: '0 12px 36px rgba(38, 24, 11, 0.26)',
    xl: '0 18px 48px rgba(38, 24, 11, 0.3)',
  },
  components: {
    Paper: {
      styles: {
        root: glassSurface,
      },
    },
    Popover: {
      styles: {
        dropdown: {
          ...glassSurface,
          backgroundColor: appShellColors.surfaceRaised,
        },
      },
    },
  },
});
