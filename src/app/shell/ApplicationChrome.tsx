import { MantineProvider } from '@mantine/core';
import { appColorSchemeManager, appContentTheme } from '@ui/theme';
import type { ReactNode } from 'react';

import '../styles/mantine.generated.css';
import '../styles/mantine-shell-compatibility.css';
import { AppRoot } from './AppRoot';

export interface ApplicationChromeProps {
  children: ReactNode;
}

/** The app's warm dark provider; bare document renderers use their own styling. */
export function ApplicationChrome({ children }: ApplicationChromeProps) {
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark" colorSchemeManager={appColorSchemeManager}>
      <AppRoot>{children}</AppRoot>
    </MantineProvider>
  );
}
