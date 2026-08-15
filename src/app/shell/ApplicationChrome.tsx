import { MantineProvider } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import '@mantine/core/styles.layer.css';
import '../styles/mantine-shell-compatibility.css';
import { AppRoot } from './AppRoot';

export interface ApplicationChromeProps {
  children: ReactNode;
  pathname: string;
}

/**
 * Application-only shell and Mantine provider, kept outside bare renderer routes. The provider
 * wraps the chrome too — the shell's markup stays plain CSS-module styling, but its components (the
 * footer's tooltips) reuse the same Mantine primitives as page content.
 */
export function ApplicationChrome({ children, pathname }: ApplicationChromeProps) {
  useEffect(
    () => () => {
      document.documentElement.removeAttribute('data-mantine-color-scheme');
    },
    []
  );

  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <AppRoot pathname={pathname}>{children}</AppRoot>
    </MantineProvider>
  );
}
