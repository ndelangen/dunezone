import { Group, Stack, Text } from '@mantine/core';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Eyebrow } from '../content/Eyebrow';
import type { RenderRoot } from '../renderRoot';
import styles from './Spotlight.module.css';
import { Surface } from './Surface';

export interface SpotlightProps {
  /**
   * Required.
   * Circular artwork identifying the subject — a faction token, an avatar, a cover.
   * Without it this is just a surface with text in it, and the whole point is that a spotlight is recognisable at a glance as _a specific thing you can go to_.
   */
  media: ReactNode;
  /** Why this one was singled out, e.g. `New arrival`. Omit when every peer is here for the same reason. */
  eyebrow?: string;
  title: ReactNode;
  /**
   * Required.
   * One line of supporting fact — a date, a summary.
   * A title on its own gives the reader nothing to choose on, which is the job a spotlight exists to do.
   */
  meta: ReactNode;
  /** Turns the whole surface into the link. Same shape as Mantine's `renderRoot`. */
  renderRoot: RenderRoot;
}

/**
 * Singles one entity out of a collection and sends you to it.
 *
 * Callers own the artwork, the reason and the destination.
 * This component owns what makes it one offer rather than a box of text: the whole surface is the target, the artwork identifies the subject before the words are read, the chevron says where it goes, and the title truncates rather than reflowing.
 *
 * Distinct from `Card`, which names a region you are already in;
 * a spotlight points somewhere else.
 */
export function Spotlight({ media, eyebrow, title, meta, renderRoot }: SpotlightProps) {
  return (
    <Surface interactive padding="sm" renderRoot={renderRoot}>
      <Group wrap="nowrap" gap="sm">
        <div className={styles.media} aria-hidden>
          {media}
        </div>
        <Stack gap={1} miw={0} flex={1}>
          {eyebrow == null ? null : <Eyebrow tone="accent">{eyebrow}</Eyebrow>}
          <Text fw={700} truncate>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {meta}
          </Text>
        </Stack>
        <ChevronRight size={18} aria-hidden />
      </Group>
    </Surface>
  );
}
