import {
  convertCssVariables,
  DEFAULT_THEME,
  defaultCssVariablesResolver,
  MantineProvider,
  mergeMantineTheme,
  mergeThemeOverrides,
} from '@mantine/core';
import type { MantineColorSchemeManager, MantineColorsTuple } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';

import './DarkSchemeIsland.css';

const ISLAND_SELECTOR = '[data-scheme-dark]';

/**
 * The attributes that put an element on the island, carried by the island's root elements.
 * A floating pane portals out of the root to `body`, so the island's provider hands these to every Popover dropdown it renders, which covers Select, Menu and Combobox.
 */
export const darkSchemeIslandAttributes = { 'data-scheme-dark': '', 'data-mantine-color-scheme': 'dark' } as const;

/* The sietch kit's ramps (see DarkSchemeIsland.css): sand for the one action to press, leather where the app uses slate and navy. */
const sand: MantineColorsTuple = [
  '#fff6e6',
  '#ffe9c4',
  '#ffd894',
  '#fcc563',
  '#f8b546',
  '#f3a93c',
  '#e49a30',
  '#cf8724',
  '#f3a93c',
  '#e09630',
];
const leather: MantineColorsTuple = [
  '#f2e6cf',
  '#d9c7a4',
  '#bba98a',
  '#8f7a5c',
  '#5c4327',
  '#3b2c1e',
  '#2b1f15',
  '#21170f',
  '#180f09',
  '#100a06',
];
const brass: MantineColorsTuple = [
  '#fbf4e6',
  '#efe1c6',
  '#dcc6a0',
  '#c9ad7f',
  '#b49a72',
  '#9c8360',
  '#806a4c',
  '#66533a',
  '#4f402d',
  '#3b2f21',
];
/* Sand is light, so a filled sand control carries the dark ink the table's own labels use. */
const SAND_INK = '#1b1206';

const islandTheme = mergeThemeOverrides(appContentTheme, {
  colors: { slate: sand, dune: sand, gray: brass, dark: leather, selected: leather },
  variantColorResolver: (input) => {
    const resolved = appContentTheme.variantColorResolver!(input);
    const color = input.color ?? 'slate';
    return input.variant === 'filled' && (color === 'slate' || color === 'dune')
      ? { ...resolved, color: SAND_INK }
      : resolved;
  },
  components: { Popover: { defaultProps: { attributes: { dropdown: darkSchemeIslandAttributes } } } },
});

/* Inert: Mantine reads it on mount, but the island's scheme is forced and the page's own provider
   owns the document, so nothing here is ever stored or observed. */
const islandSchemeManager: MantineColorSchemeManager = {
  get: () => 'dark',
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

const noRootElement = () => undefined;

/* A Tooltip wrapping its target drops `attributes`, and tooltip colours key on an ancestor's scheme, so an island
   tooltip portals into this element instead: a child of `body` that carries the island's attributes, where no
   island `overflow` or `transform` can clip it or become its containing block. */
function createTooltipHost() {
  const host = document.createElement('div');
  for (const [name, value] of Object.entries(darkSchemeIslandAttributes)) {
    host.setAttribute(name, value);
  }
  return host;
}

/* What Mantine's own provider would emit for this selector, computed once: its `<style>` rebuilds
   the whole variable sheet on every render of the provider, and the table re-renders on every
   table update. The dark values apply through the `data-mantine-color-scheme` the island carries. */
const islandVariables =
  convertCssVariables(defaultCssVariablesResolver(mergeMantineTheme(DEFAULT_THEME, islandTheme)), ISLAND_SELECTOR) +
  `${ISLAND_SELECTOR}{--mantine-color-scheme:dark;}`;

/**
 * Children sit on their own dark ground in both page schemes: the play table, its panel and the placeholders shown while the table loads.
 * `tokens.css` gives `data-scheme-dark` the app's dark tokens;
 * Mantine scopes its own scheme variables to `:root`, so this nested provider re-emits them under the same selector, and the island's element carries `data-mantine-color-scheme` for Mantine's static dark rules.
 * `getRootElement` returns nothing on purpose: the provider must never write the document's scheme attribute, which the app's provider owns.
 * Stylesheets keyed on `html[data-mantine-color-scheme]` do not follow the island;
 * nothing on the play route reads them.
 */
export function DarkSchemeIsland({ children }: { children: ReactNode }) {
  const [tooltipHost] = useState(createTooltipHost);
  useLayoutEffect(() => {
    document.body.append(tooltipHost);
    return () => tooltipHost.remove();
  }, [tooltipHost]);
  const theme = useMemo(
    () =>
      mergeThemeOverrides(islandTheme, {
        components: { Tooltip: { defaultProps: { portalProps: { target: tooltipHost } } } },
      }),
    [tooltipHost]
  );
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme="dark"
      colorSchemeManager={islandSchemeManager}
      getRootElement={noRootElement}
      cssVariablesSelector={ISLAND_SELECTOR}
      withCssVariables={false}
      withGlobalClasses={false}
    >
      <style data-mantine-styles dangerouslySetInnerHTML={{ __html: islandVariables }} />
      {children}
    </MantineProvider>
  );
}
