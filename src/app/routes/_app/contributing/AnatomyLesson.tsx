import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import styles from './AnatomyLesson.module.css';
import { PageAnatomy } from './PageAnatomy';
import type { AnatomyRegion } from './PageAnatomy';

const REGIONS: Record<string, AnatomyRegion> = {
  chrome: 'chrome',
  band: 'band',
  'page-layout': 'chrome',
  'page-header': 'header',
  'page-toolbar': 'toolbar',
  'page-content': 'content',
  'page-title': 'header',
  toolbar: 'toolbar',
  surface: 'content',
  section: 'section',
  'app-footer': 'footer',
  slot: 'content',
  adornment: 'toolbar',
};

/** The diagram follows the nearest term without changing the visible lesson. */
export function AnatomyLesson({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<AnatomyRegion>('chrome');
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const terms = root.current?.querySelectorAll<HTMLElement>('[data-anatomy-term]');
      if (!terms?.length) {
        return;
      }
      const target = Math.min(window.innerHeight * 0.3, 240);
      const nearest = [...terms].reduce((best, term) => {
        const rect = term.getBoundingClientRect();
        const previous = best.getBoundingClientRect();
        const distance = rect.top <= target && rect.bottom >= target ? 0 : Math.abs(rect.top - target);
        const bestDistance = previous.top <= target && previous.bottom >= target ? 0 : Math.abs(previous.top - target);
        return distance < bestDistance ? term : best;
      });
      setActive(REGIONS[nearest.dataset.anatomyTerm!] ?? 'content');
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return (
    <div ref={root} className={styles.root}>
      <div className={styles.layout}>
        <div className={styles.copy}>{children}</div>
        <aside className={styles.diagram} aria-label="Page anatomy reference">
          <PageAnatomy active={active} />
        </aside>
      </div>
    </div>
  );
}
