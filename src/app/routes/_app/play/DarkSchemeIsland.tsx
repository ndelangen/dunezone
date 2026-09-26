import {
  convertCssVariables,
  DEFAULT_THEME,
  defaultCssVariablesResolver,
  MantineProvider,
  mergeMantineTheme,
  mergeThemeOverrides,
} from '@mantine/core';
import type { MantineColorSchemeManager } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import type { ReactNode } from 'react';

const ISLAND_SELECTOR = '[data-scheme-dark]';

/**
 * The attributes that put an element on the island, carried by the island's root elements.
 * A floating pane portals out of the root to `body`, so the island's provider hands these to every Popover dropdown it renders, which covers Select, Menu and Combobox.
 */
export const darkSchemeIslandAttributes = { 'data-scheme-dark': '', 'data-mantine-color-scheme': 'dark' } as const;

/* Tooltips get no default: a Tooltip wrapping its target drops `attributes`, and tooltip colours key on an ancestor's
   scheme, so the attributes on the tooltip itself would not change its ground. */
const islandTheme = mergeThemeOverrides(appContentTheme, {
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
  return (
    <MantineProvider
      theme={islandTheme}
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
