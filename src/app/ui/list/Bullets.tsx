import { Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

import styles from './Bullets.module.css';

const GAP = { none: 0, md: 'md', xl: 'xl' } as const;

export interface BulletsProps {
  /** `Bullets.Item` elements. */
  children: ReactNode;
  /**
   * `none` for a divided nav whose items carry their own padding, `md` for a plain list, `xl` for a grid of
   * capabilities.
   */
  gap?: keyof typeof GAP;
  /** Lay the items out in columns rather than one stack. Accepts Mantine's responsive form. */
  columns?: ComponentProps<typeof SimpleGrid>['cols'];
}

/**
 * A list whose items lead with an icon.
 *
 * Callers own the items and how many columns they occupy. This component owns that they are a list — real `ul`/`li`
 * semantics, and one decision about the space between items instead of a `Stack` or `SimpleGrid` chosen afresh at each
 * call site.
 *
 * The item is deliberately not exported on its own: a single icon-led row outside a list has no meaning, and when it
 * was standalone every caller had to supply its own container.
 */
export function Bullets({ children, gap = 'md', columns }: BulletsProps) {
  if (columns) {
    return (
      <SimpleGrid component="ul" cols={columns} spacing={GAP[gap]} className={styles.list}>
        {children}
      </SimpleGrid>
    );
  }

  return (
    <Stack component="ul" gap={GAP[gap]} className={styles.list}>
      {children}
    </Stack>
  );
}

interface BulletsItemProps {
  /** Decorative glyph. The title carries the meaning; the medallion carries the emphasis. */
  icon: ReactNode;
  title: ReactNode;
  /** Supporting line beneath the title. Its presence switches the row to top alignment. */
  detail?: ReactNode;
  /** Affordance at the end of the row, such as a chevron on a navigating item. */
  trailing?: ReactNode;
  /** Wraps the row's content so the whole item navigates. The `li` stays the list item. */
  renderLink?: (content: ReactNode) => ReactNode;
}

/**
 * One item of a `Bullets`.
 *
 * Owns the medallion treatment and the alignment rule — centred when the row is a single line, top aligned once a
 * detail line makes it two.
 */
function Item({ icon, title, detail, trailing, renderLink }: BulletsItemProps) {
  const content = (
    <Group wrap="nowrap" align={detail == null ? 'center' : 'flex-start'} gap="sm">
      <ThemeIcon variant="light" color="var(--color-link)" radius="xl" size="lg" aria-hidden>
        {icon}
      </ThemeIcon>
      <Stack gap={1} miw={0} flex={1}>
        <Text component="span" fw={700} size={detail == null ? 'sm' : undefined} lh={1.25}>
          {title}
        </Text>
        {detail == null ? null : (
          <Text component="span" size="sm" c="dimmed">
            {detail}
          </Text>
        )}
      </Stack>
      {trailing}
    </Group>
  );

  return (
    <li className={clsx(styles.item, renderLink && styles.linked)}>{renderLink ? renderLink(content) : content}</li>
  );
}

Bullets.Item = Item;
