import { MantineProvider } from '@mantine/core';
import { type ReactNode, useEffect } from 'react';

import { appContentTheme } from '@app/theme';

import '@mantine/core/styles.layer.css';
import '../../styles/mantine-shell-compatibility.css';
import { AppShell } from './AppShell';

export interface ApplicationChromeProps {
  children: ReactNode;
  pathname: string;
}

/** Application-only shell and Mantine provider, kept outside bare renderer routes. */
export function ApplicationChrome({ children, pathname }: ApplicationChromeProps) {
  useEffect(
    () => () => {
      document.documentElement.removeAttribute('data-mantine-color-scheme');
    },
    []
  );

  return (
    <AppShell pathname={pathname}>
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        {children}
      </MantineProvider>
    </AppShell>
  );
}
