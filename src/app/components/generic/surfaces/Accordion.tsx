import type { ReactNode } from 'react';

import styles from './Accordion.module.css';

export interface AccordionSectionProps {
  /** Stable id for a11y wiring and `onToggle`; should be URL- and DOM-safe. */
  sectionId: string;
  title: string;
  icon?: ReactNode;
  isOpen: boolean;
  onToggle: (sectionId: string) => void;
  children: ReactNode;
}

/**
 * Single-section disclosure: one header toggles visibility of panel content. Styling matches the
 * faction editor accordion; usable anywhere a stacked disclosure is needed.
 */
export function AccordionSection({
  sectionId,
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  const headerId = `accordion-header-${sectionId}`;
  const panelId = `accordion-panel-${sectionId}`;

  return (
    <div className={styles.item}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={isOpen}
        aria-controls={panelId}
        id={headerId}
        onClick={() => onToggle(sectionId)}
      >
        <span className={styles.headerMain}>
          {icon != null && <span className={styles.headerIcon}>{icon}</span>}
          <span className={styles.headerTitle}>{title}</span>
        </span>
        <span className={styles.headerChevron} aria-hidden>
          ▾
        </span>
      </button>
      {isOpen && (
        <section className={styles.panel} id={panelId} aria-labelledby={headerId}>
          {children}
        </section>
      )}
    </div>
  );
}
