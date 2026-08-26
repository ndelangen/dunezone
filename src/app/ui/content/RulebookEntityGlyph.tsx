import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './RulebookEntityGlyph.module.css';

export type RulebookEntityKind = 'page' | 'slot' | 'block';

export interface RulebookEntityGlyphProps {
  kind: RulebookEntityKind;
  icon: ReactNode;
  className?: string;
}

/*
 * The decorative glyph for one kind of entity in a Rulebook outline.
 *
 * The caller owns the specific icon. This component owns the fixed Page, Slot, and Block accent mapping.
 */
export function RulebookEntityGlyph({ kind, icon, className }: RulebookEntityGlyphProps) {
  return (
    <span className={clsx(styles.root, className)} data-kind={kind} aria-hidden>
      {icon}
    </span>
  );
}
