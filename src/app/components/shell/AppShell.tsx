import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { type ReactNode, useEffect, useState } from 'react';

import styles from './AppShell.module.css';
import { FooterLinksPrototype } from './FooterLinksPrototype';
import { SiteNavigation } from './SiteNavigation';

const SCROLL_VAR = '--scroll-pct';
let heroImageLoaded = false;

function updateScrollProgress() {
  const root = document.documentElement;
  const scrollHeight = Math.max(document.body.scrollHeight, root.scrollHeight);
  const maxScroll = Math.max(0, scrollHeight - window.innerHeight);
  const remainingScroll = Math.max(0, maxScroll - window.scrollY);
  const percent = maxScroll > 0 ? 100 - (remainingScroll / maxScroll) * 100 : 100;

  root.style.setProperty(SCROLL_VAR, `${Math.min(100, Math.max(0, percent))}`);
}

export interface AppShellProps {
  children: ReactNode;
  pathname: string;
}

/** Persistent application chrome and document-level page effects. */
export function AppShell({ children, pathname }: AppShellProps) {
  const [imageLoaded, setImageLoaded] = useState(heroImageLoaded);
  const showFooterPrototype =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('variant');

  useEffect(() => {
    if (heroImageLoaded) return;
    const image = new Image();
    image.onload = () => {
      heroImageLoaded = true;
      setImageLoaded(true);
    };
    image.src = '/web/head.png';
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    let animationFrameId: number | null = null;

    const scheduleUpdate = () => {
      if (animationFrameId !== null) return;
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
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateScrollProgress);
      window.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      root.style.removeProperty(SCROLL_VAR);
    };
  }, []);

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
    <div className={styles.container} data-app-shell>
      <div className={styles.main}>
        <div className={styles.routeFrame}>
          <header className={clsx(styles.hero, imageLoaded && styles.loaded)}>
            <SiteNavigation />
          </header>
          {children}
        </div>
      </div>
      <footer className={clsx(styles.footer, showFooterPrototype && styles.prototypeFooter)}>
        {showFooterPrototype ? (
          <FooterLinksPrototype />
        ) : (
          <p>
            <Link to="/privacy">Privacy Policy</Link>
          </p>
        )}
      </footer>
    </div>
  );
}
