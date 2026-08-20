import { UnstyledButton } from '@mantine/core';
import { TriangleAlert } from 'lucide-react';

import styles from './ValidationHeader.module.css';

/** The one shape every editor's warnings must project for the header to group and word them. */
export type ValidationHeaderWarning = {
  /** The entity the gap belongs to; the header renders one chip per source. */
  source: string;
  /** What the source is missing, e.g. "name" or "back description". */
  missing: string;
};

function formatMissingList(missing: string[]): string {
  if (missing.length <= 1) {
    return missing[0] ?? '';
  }
  return `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
}

/**
 * A lower-third caption strip on an edit page's masthead band: one chip per warning source, each a focus jump into the editor.
 * Mount it inside the band (it positions absolutely to the band's bottom edge) and gate the band itself with `useValidationHeaderOpen`.
 */
export function ValidationHeader<W extends ValidationHeaderWarning>({
  id,
  warnings,
  onFocusWarning,
}: {
  /** Anchors the toolbar's warning-count jump; pass the page's scroll target id. */
  id?: string;
  warnings: W[];
  onFocusWarning: (warning: W) => void;
}) {
  const groups = new Map<string, W[]>();
  warnings.forEach((warning) => {
    const group = groups.get(warning.source);
    if (group) {
      group.push(warning);
    } else {
      groups.set(warning.source, [warning]);
    }
  });

  return (
    <div className={styles.strip} id={id}>
      <span className={styles.title}>
        <TriangleAlert size={15} aria-hidden />
        Incomplete fields
      </span>
      {[...groups.entries()].map(([source, sourceWarnings]) => (
        <UnstyledButton key={source} className={styles.chip} onClick={() => onFocusWarning(sourceWarnings[0] as W)}>
          <span className={styles.chipSource}>{source}</span>: missing{' '}
          {formatMissingList(sourceWarnings.map((warning) => warning.missing))}
        </UnstyledButton>
      ))}
    </div>
  );
}
