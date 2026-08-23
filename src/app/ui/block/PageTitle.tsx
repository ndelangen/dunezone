import { Stack, Title } from '@mantine/core';

import { Eyebrow } from '../content/Eyebrow';
import { usePageHeaderSize } from '../layout/pageHeaderSize';
import styles from './PageTitle.module.css';

export interface PageTitleProps {
  /** The page's name. A string, not a node: the words are the data this renders. */
  title: string;
  /** Classifier above the name: what kind of thing this page is. Words, not a node. */
  eyebrow?: string;
}

/**
 * The page's own name, and the one thing on a page allowed to be an `h1`.
 *
 * Callers pass words;
 * this block owns the level, the treatment, and whether the name is set in the display face or the app's heading face.
 * That last one is not a prop: the page declares what kind of header it has through `PageLayout.Header`, and this reads it back, the way a block's heading level follows its depth rather than an argument.
 *
 * It exists because the page title had three spellings and no legal home: a Content component holding an `h1`, a `Title order={1}`, and a bare `h1`, so every page picked one and the outline drifted.
 */
export function PageTitle({ title, eyebrow }: PageTitleProps) {
  const headerSize = usePageHeaderSize();

  return (
    <Stack gap={4} className={styles.root}>
      {eyebrow === undefined ? null : <Eyebrow tone={headerSize === 'hero' ? 'inverse' : 'muted'}>{eyebrow}</Eyebrow>}
      <Title order={1} className={styles.title}>
        {title}
      </Title>
    </Stack>
  );
}
