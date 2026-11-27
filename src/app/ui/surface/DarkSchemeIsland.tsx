import {
  convertCssVariables,
  DEFAULT_THEME,
  defaultCssVariablesResolver,
  MantineContext,
  MantineProvider,
  mergeMantineTheme,
  mergeThemeOverrides,
} from '@mantine/core';
import type { MantineColorSchemeManager } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import type { ContextType, ReactNode } from 'react';
import { use, useLayoutEffect, useMemo, useState } from 'react';

import './DarkSchemeIsland.css';

const ISLAND_SELECTOR = '[data-scheme-dark]';

/**
 * The attributes that put an element on the island, carried by the island's root elements.
 * A floating pane portals out of the root to `body`, so the island's provider hands these to every Popover dropdown it renders, which covers Select, Menu and Combobox.
 */
export const darkSchemeIslandAttributes = { 'data-scheme-dark': '', 'data-mantine-color-scheme': 'dark' } as const;

/* Keep Mantine controls on the app palette, including dropdowns portaled outside the table. */
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

type MantineContextValue = NonNullable<ContextType<typeof MantineContext>>;

function sameFields(a: MantineContextValue, b: MantineContextValue) {
  const keys = Object.keys(a) as (keyof MantineContextValue)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/*
 * Mantine's provider hands out a new context object on every render, and the island re-renders with the table, on every
 * table update. Every Mantine component below reads that context, so each one re-rendered with it: every tooltip, disc and
 * box on the table's panels, whether or not its own parent changed. The fields themselves stay the same, so the island
 * provides the first object again until one of them changes.
 */
function StableMantineContext({ children }: { children: ReactNode }) {
  const value = use(MantineContext)!;
  const [kept, keep] = useState(value);
  const stable = kept === value || sameFields(kept, value) ? kept : value;
  if (stable !== kept) {
    keep(stable);
  }
  return <MantineContext value={stable}>{children}</MantineContext>;
}

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
 * Children share the app palette on their own dark ground: the play table, its panel and the placeholders shown while the table loads.
 * `tokens.css` gives `data-scheme-dark` the app's dark tokens;
 * Mantine scopes its own scheme variables to `:root`, so this nested provider re-emits them under the same selector, and the island's element carries `data-mantine-color-scheme` for Mantine's static dark rules.
 * `getRootElement` returns nothing on purpose: the provider must never write the document's scheme attribute, which the app's provider owns.
 * Stylesheets keyed on `html[data-mantine-color-scheme]` do not follow the island;
 * nothing on the play route reads them.
 */
export function DarkSchemeIsland({ children }: { children: ReactNode }) {
  /* The server has no document; a tooltip only opens in the browser, so the host is made there. */
  const [tooltipHost] = useState(() => (typeof document === 'undefined' ? undefined : createTooltipHost()));
  useLayoutEffect(() => {
    if (!tooltipHost) {
      return;
    }
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
      <StableMantineContext>{children}</StableMantineContext>
    </MantineProvider>
  );
}
