import { Button } from '@mantine/core';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './SelectableRow.module.css';

export interface SelectableRowProps {
  /** What the row stands for: a name, or a portrait and a name. Wraps rather than truncating. */
  children: ReactNode;
  /** The row the reader is working on, in a list that keeps one; it announces as pressed and wears the selected tint. Omit it for a list of choices that closes on a pick. */
  selected?: boolean;
  onSelect: () => void;
  /** Placement only, such as room for a drag handle laid over the row's end. */
  className?: string;
}

/**
 * One row of a list the reader picks from: the whole row is the target.
 *
 * Not an action: it names a thing rather than a verb, so it carries no glyph of its own and no frame until hovered or selected.
 * `LabeledAction` stays the worded action;
 * this is the entry in a picker's options or an editor's list of items.
 * It exists because four lists each hand-built this from Mantine's Button with the same six layout overrides.
 */
export function SelectableRow({ children, selected, onSelect, className }: SelectableRowProps) {
  return (
    <Button
      fullWidth
      justify="start"
      color="selected"
      variant={selected ? 'light' : 'subtle'}
      aria-pressed={selected}
      onClick={onSelect}
      className={clsx(styles.row, className)}
    >
      {children}
    </Button>
  );
}
