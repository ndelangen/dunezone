import { Stack, Title } from '@mantine/core';

import { Eyebrow } from '../content/Eyebrow';
import { useInsidePageHeader } from '../layout/PageLayout';
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
 * That last one is not a prop: the page declares what kind of header it has through `PageLayout.Header`, and the stylesheet reads that declaration back, the way a block's heading level follows its depth rather than an argument.
 *
 * **A page title belongs in `PageLayout.Header`.**
 * That is what makes the treatment here correct rather than conventional: the band is the only place the paper ink is set, so the eyebrow is always `inverse` and needs no argument.
 * A page header sits on the masthead artwork at every declared size, since only the band's height varies, so the ink beneath the label never changes.
 * Rendering this outside the band warns in development.
 *
 * It exists because the page title had three spellings and no legal home: a Content component holding an `h1`, a `Title order={1}`, and a bare `h1`, so every page picked one and the outline drifted.
 */
export function PageTitle({ title, eyebrow }: PageTitleProps) {
  const insideHeader = useInsidePageHeader();

  if (import.meta.env.DEV && !insideHeader) {
    console.warn(
      '[PageTitle] A page title is rendered outside PageLayout.Header. The band is the only place ' +
        'its treatment is correct: the paper ink is set on the header content alone, so the eyebrow ' +
        'loses its contrast, and on a hero page the display face still applies because the size ' +
        'attribute sits on the layout root. Move the title into the header slot.'
    );
  }

  return (
    <Stack gap={4} className={styles.root}>
      {eyebrow === undefined ? null : <Eyebrow tone="inverse">{eyebrow}</Eyebrow>}
      <Title order={1} className={styles.title}>
        {title}
      </Title>
    </Stack>
  );
}
