import type { ReactNode } from 'react';

import styles from './AppHeader.module.css';
import { SiteNavigation } from './SiteNavigation';

export interface AppHeaderProps {
  /** The route's content. Its `PageLayout` claims the same top row and sets the band's height. */
  children: ReactNode;
}

/**
 * The artwork band above every page, and the two-row frame it shares with the route's content.
 *
 * Chrome rather than a kit component, and the frame is the reason: `AppRoot` renders
 * whatever the router hands it, so it cannot pass the band's height down, and `PageLayout` cannot
 * report upward. The two meet in CSS instead — the page joins this grid through `display:
 * contents`, takes the `hero` row to overlay the band's lower edge, and declares which height it
 * wants through `data-page-layout-*`, which the rules here read back. Keeping the band and the
 * frame in one file keeps both halves of that contract in one place; the band element then stays
 * mounted across navigations, so a height change animates instead of cutting.
 */
export function AppHeader({ children }: AppHeaderProps) {
  return (
    <div className={styles.frame}>
      <header className={styles.band}>
        <SiteNavigation />
      </header>
      {children}
    </div>
  );
}
