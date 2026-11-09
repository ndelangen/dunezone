import { MantineProvider } from '@mantine/core';
import { appColorSchemeManager, appContentTheme } from '@ui/theme';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import '../styles/mantine.generated.css';
import '../styles/mantine-shell-compatibility.css';
import { useMotionAllowed } from '../styles/motion';
import styles from './ToolChrome.module.css';

/*
 * A standalone tool's frame: the app's warm dark theme and nothing else (Norbert, 2026-11-09).
 * A tool is its own page, opened in a tab of its own from the tools catalogue, so it carries no header, navigation, band or footer.
 */
export function ToolChrome({ children }: Readonly<{ children: ReactNode }>) {
  const motion = useMotionAllowed();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = motion ? 'ok' : 'reduce';
    return () => {
      delete root.dataset.motion;
    };
  }, [motion]);

  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark" colorSchemeManager={appColorSchemeManager}>
      <div className={styles.frame} data-tool-root>
        {children}
      </div>
    </MantineProvider>
  );
}
