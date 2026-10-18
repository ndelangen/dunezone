import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './PageAnatomy.module.css';

/* The regions of the drawing each term lights; a term not listed lights nothing. */
const LIGHTS: Record<string, readonly string[]> = {
  chrome: ['chrome'],
  band: ['band'],
  'page-layout': ['header', 'toolbar', 'content'],
  'page-header': ['header'],
  'page-toolbar': ['toolbar'],
  'page-content': ['content'],
  'page-title': ['title'],
  toolbar: ['toolbar-pane'],
  surface: ['toolbar-pane', 'surface'],
  section: ['section'],
  'app-footer': ['footer'],
  slot: ['header', 'toolbar', 'content'],
  adornment: ['adornment'],
};

function Part({
  name,
  label,
  lit,
  className,
  children,
}: Readonly<{ name: string; label: string; lit: readonly string[]; className: string; children?: ReactNode }>) {
  return (
    <div className={clsx(styles.part, className)} data-lit={lit.includes(name) || undefined}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

/** A page drawn as its named regions, lighting the ones the term the reader points at names. */
export function PageAnatomy({ term }: Readonly<{ term: string | null }>) {
  const lit = (term && LIGHTS[term]) || [];
  return (
    <div className={styles.page} data-teaching={lit.length > 0 || undefined} aria-hidden="true">
      <Part name="chrome" label="Chrome" lit={lit} className={styles.chrome}>
        <Part name="band" label="Band" lit={lit} className={styles.band}>
          <div className={styles.navigation} />
          <Part name="header" label="PageLayout.Header" lit={lit} className={styles.header}>
            <div className={styles.eyebrow} />
            <Part name="title" label="PageTitle" lit={lit} className={styles.title} />
            <div className={styles.line} />
          </Part>
        </Part>
        <Part name="toolbar" label="PageLayout.Toolbar" lit={lit} className={styles.toolbar}>
          <Part name="toolbar-pane" label="Toolbar" lit={lit} className={styles.toolbarPane}>
            <div className={styles.search} />
            <div className={styles.primary} />
          </Part>
        </Part>
        <Part name="content" label="PageLayout.Content" lit={lit} className={styles.content}>
          <Part name="section" label="Section" lit={lit} className={styles.section}>
            <div className={styles.heading}>
              <Part name="adornment" label="Adornment" lit={lit} className={styles.adornment} />
              <div className={styles.headingText} />
            </div>
            <Part name="surface" label="Surface" lit={lit} className={styles.surface}>
              <div className={styles.line} />
              <div className={styles.line} />
              <div className={styles.lineShort} />
            </Part>
          </Part>
        </Part>
        <Part name="footer" label="AppFooter" lit={lit} className={styles.footer}>
          {[0, 1, 2, 3, 4].map((dot) => (
            <div key={dot} className={styles.dot} />
          ))}
        </Part>
      </Part>
    </div>
  );
}
