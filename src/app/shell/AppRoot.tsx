import { PAGE_CONTENT_ID } from '@ui/layout/PageLayout';
import { useEffect } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { useMotionAllowed } from '../styles/motion';
import { AppBackground } from './AppBackground';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import styles from './AppRoot.module.css';

/*
 * Moves focus to the page's main itself rather than following the fragment, which would put `#page-content` in the address
 * and hand the router a navigation (the rulebook editor keeps its own state in the hash).
 * The main takes focus only for the moment it holds it, so a click inside it never lands focus there.
 */
function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const main = document.getElementById(PAGE_CONTENT_ID);
  if (!main) {
    return;
  }
  if (!main.hasAttribute('tabindex')) {
    main.setAttribute('tabindex', '-1');
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
  }
  main.focus();
}

export interface AppRootProps {
  children: ReactNode;
}

/** Persistent application chrome and document-level page effects. */
export function AppRoot({ children }: AppRootProps) {
  const motion = useMotionAllowed();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = motion ? 'ok' : 'reduce';

    return () => {
      delete root.dataset.motion;
    };
  }, [motion]);

  return (
    <div className={styles.container} data-app-root>
      <AppBackground motion={motion} />
      {/* The first stop in the Tab order, out of sight until it has focus. */}
      <a className={styles.skipLink} href={`#${PAGE_CONTENT_ID}`} onClick={skipToContent}>
        Skip to content
      </a>
      <div className={styles.main}>
        <AppHeader>{children}</AppHeader>
      </div>
      <footer className={styles.footer}>
        <AppFooter />
      </footer>
    </div>
  );
}
