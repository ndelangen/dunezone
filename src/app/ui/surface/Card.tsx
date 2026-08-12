import { Group } from '@mantine/core';
import { useId } from 'react';
import type { ReactNode } from 'react';

import { BlockHeading } from '../block/BlockHeading';
import { OneLevelDeeper, useSectionDepth } from '../block/depth';
import styles from './Card.module.css';
import { Surface } from './Surface';

export interface CardProps {
  /**
   * Required. A Card without a title is a `Surface` — the title is the whole reason this component
   * exists, not an embellishment on it.
   */
  title: string;
  /** Topical glyph beside the title. Decorative — the words carry the meaning. */
  icon?: ReactNode;
  /** The single control that belongs beside the title: a status, one button. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * A pane with a name on it.
 *
 * Callers pass the words and the body; this owns the pane, the gap between title and content, and
 * how loudly the title speaks for how deep the card sits — a card inside a `Section` is quieter
 * than one standing on its own.
 *
 * The pane is `Surface`, and that division is deliberate: `Surface` answers "content needs a
 * plane", `Card` answers "this pane needs a name". When the title was optional the two answered the
 * same question and picking between them was a coin toss.
 *
 * Content that brings panes of its own — a list of cards, a grid of spotlights — belongs in a
 * `Section` instead, or the surfaces would nest.
 */
export function Card({ title, icon, action, children }: CardProps) {
  const headingId = useId();
  const depth = useSectionDepth();

  return (
    <Surface padding="lg" className={styles.card}>
      <div className={styles.header}>
        {action == null ? (
          <BlockHeading id={headingId} title={title} icon={icon} />
        ) : (
          <Group justify="space-between" align="end" wrap="wrap" gap="md">
            <BlockHeading id={headingId} title={title} icon={icon} />
            {action}
          </Group>
        )}
      </div>
      <div className={styles.body}>
        <OneLevelDeeper depth={depth}>{children}</OneLevelDeeper>
      </div>
    </Surface>
  );
}
