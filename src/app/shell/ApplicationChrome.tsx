import { MantineProvider } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import '@mantine/core/styles.layer.css';
import '../styles/mantine-shell-compatibility.css';
import { AppRoot } from './AppRoot';
import { useResolvedScheme } from './colorScheme';

export interface ApplicationChromeProps {
  children: ReactNode;
  pathname: string;
}

/**
 * Application-only shell and Mantine provider, kept outside bare renderer routes. `colorScheme.ts`
 * owns the scheme; the provider only relays the resolved verdict, so Mantine and tokens.css agree
 * without a second writer.
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
    <AppRoot pathname={pathname}>
      <MantineProvider theme={appContentTheme} forceColorScheme={scheme}>
        {children}
      </MantineProvider>
    </AppRoot>
  );
}
