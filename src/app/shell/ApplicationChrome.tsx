import { MantineProvider } from '@mantine/core';
import type { MantineColorSchemeManager } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import '@mantine/core/styles.layer.css';
import '../styles/mantine-shell-compatibility.css';
import { resolvedScheme, useResolvedScheme } from '../styles/colorScheme';
import { AppRoot } from './AppRoot';

/*
 * Mantine's default manager reads its own localStorage key in a mount layout-effect and rewrites
 * the html attribute before first paint, a second writer that flashes dark visitors light. This
 * bridge makes that effect read colorScheme.ts's verdict instead; everything else is a no-op
 * because `forceColorScheme` already relays changes.
 */
const schemeBridge: MantineColorSchemeManager = {
  get: () => resolvedScheme(),
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

export interface ApplicationChromeProps {
  children: ReactNode;
  pathname: string;
}

/**
 * Application-only shell and Mantine provider, kept outside bare renderer routes.
 * The provider wraps the chrome too: the shell's markup stays plain CSS-module styling, but its components (the footer's tooltips) reuse the same Mantine primitives as page content.
 * `colorScheme.ts` owns the scheme;
 * the provider only relays the resolved verdict, so
 * Mantine and tokens.css agree without a second writer.
 */
export function ApplicationChrome({ children, pathname }: ApplicationChromeProps) {
  const scheme = useResolvedScheme();

  useEffect(
    () => () => {
      document.documentElement.removeAttribute('data-mantine-color-scheme');
    },
    []
  );

  return (
    <MantineProvider theme={appContentTheme} forceColorScheme={scheme} colorSchemeManager={schemeBridge}>
      <AppRoot pathname={pathname}>{children}</AppRoot>
    </MantineProvider>
  );
}
