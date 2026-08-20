import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useMotionAllowed } from '../styles/motion';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import styles from './AppRoot.module.css';

const SCROLL_VAR = '--scroll-pct';

function updateScrollProgress() {
  const root = document.documentElement;
  const scrollHeight = Math.max(document.body.scrollHeight, root.scrollHeight);
  const maxScroll = Math.max(0, scrollHeight - window.innerHeight);
  const remainingScroll = Math.max(0, maxScroll - window.scrollY);
  const percent = maxScroll > 0 ? 100 - (remainingScroll / maxScroll) * 100 : 100;

  root.style.setProperty(SCROLL_VAR, `${Math.min(100, Math.max(0, percent))}`);
}

export interface AppRootProps {
  children: ReactNode;
  pathname: string;
}

/** Persistent application chrome and document-level page effects. */
export function AppRoot({ children, pathname }: AppRootProps) {
  useEffect(() => {
    const root = document.documentElement;
    let animationFrameId: number | null = null;

    const scheduleUpdate = () => {
      if (animationFrameId !== null) {
        return;
      }
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        updateScrollProgress();
      });
    };
    const handleScroll = () => {
      root.removeAttribute('data-initial-animate');
      scheduleUpdate();
    };

    root.setAttribute('data-initial-animate', '');
    root.style.setProperty(SCROLL_VAR, '0');
    window.addEventListener('resize', updateScrollProgress);
    window.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(document.body);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', updateScrollProgress);
      window.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      root.style.removeProperty(SCROLL_VAR);
    };
  }, []);

  const motion = useMotionAllowed();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = motion ? 'ok' : 'reduce';

    return () => {
      delete root.dataset.motion;
    };
  }, [motion]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.route = pathname;
    root.setAttribute('data-initial-animate', '');

    return () => {
      delete root.dataset.route;
      root.removeAttribute('data-initial-animate');
    };
  }, [pathname]);

  return (
    <div className={styles.container} data-app-root>
      <div className={styles.main}>
        <AppHeader>{children}</AppHeader>
      </div>
      <footer className={styles.footer}>
        <AppFooter />
      </footer>
    </div>
  );
}
