import { Table } from '@mantine/core';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import styles from './SectionedSurface.module.css';
import { Surface } from './Surface';

export interface SectionedSurfaceProps {
  /** `SectionedSurface.Row` elements. */
  children: ReactNode;
}

/**
 * One pane divided into rows.
 *
 * Callers own what each row contains, and own what to show when the collection is empty: an empty pane is not this component's story to tell.
 *
 * It is a surface rather than a bare list because the hairlines only read as divisions when something encloses them;
 * rules floating on the page background look like stray borders.
 * It composes `Surface` rather than restating the pane treatment, which is what the old hand-rolled version did.
 *
 * Prefer this over stacking several `Surface`s: dividing one pane is how a collection stays a single object, and surfaces never nest.
 */
export function SectionedSurface({ children }: SectionedSurfaceProps) {
  /* Hover highlight promises a click, so it lives on the interactive rows themselves rather than
     on the table: a table-level highlight glows every row once any row activates, and a purely
     informational row beside an activatable one must stay still under the pointer. */
  return (
    <Surface className={styles.surface}>
      <Table withRowBorders horizontalSpacing="md" verticalSpacing="md" className={styles.list}>
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </Surface>
  );
}

/*
 * Rows must be direct `SectionedSurface.Row` children: the interactive treatment keys on the element
 * type, so a row reaching this table through a caller's wrapper component or a Fragment renders
 * without its activation affordances rather than failing loudly.
 */
interface SectionedSurfaceRowProps {
  /**
   * The entry, as one slot.
   * The row does not arrange what is inside it;
   * a caller wanting a heading over a right-aligned meta line composes that itself.
   */
  children: ReactNode;
  /** Makes the whole row the target. Clicks on nested controls still reach those controls. */
  onActivate?: () => void;
  /** Required whenever `onActivate` is set; the row becomes a link and needs a name. */
  ariaLabel?: string;
}

function isInteractiveTarget(target: EventTarget) {
  return target instanceof Element && target.closest('a, button, input, select, textarea, [role="button"]') != null;
}

/**
 * One row of a `SectionedSurface`, optionally activatable as a whole.
 *
 * Whole-row activation is the fiddly part this owns: keyboard support, and not hijacking clicks that were aimed at a link or button nested inside the row.
 */
/** Everything that turns a plain row into the link, or nothing at all, when it is not one. */
function activationProps(onActivate: (() => void) | undefined, ariaLabel: string | undefined) {
  if (!onActivate) {
    return {};
  }

  return {
    className: styles.interactiveRow,
    role: 'link',
    tabIndex: 0,
    'aria-label': ariaLabel,
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (!isInteractiveTarget(event.target)) {
        onActivate();
      }
    },
    /* Enter only. A link activates on Enter; Space belongs to buttons, and swallowing it here
       would cost a keyboard reader the page scroll while the row has focus. */
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget || event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      onActivate();
    },
  };
}

function Row({ children, onActivate, ariaLabel }: SectionedSurfaceRowProps) {
  return (
    <Table.Tr {...activationProps(onActivate, ariaLabel)}>
      <Table.Td className={styles.rowCell}>{children}</Table.Td>
    </Table.Tr>
  );
}

SectionedSurface.Row = Row;
