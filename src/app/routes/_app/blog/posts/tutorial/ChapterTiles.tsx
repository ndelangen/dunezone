import { TUTORIAL_PAGES } from '@shared/recordlessPublicPages';

import { chapterArt, TUTORIAL_CHAPTERS, TUTORIAL_PARTS } from '@app/routes/_app/tutorial/chapters';
import type { CatalogueRow } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
import { TutorialTiles } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';

import styles from './ChapterTiles.module.css';

/*
 * The Learn to play page's chapter tiles, as the page draws them, in the post about the tutorial (Norbert, 2026-11-07: show the real list, not a picture of it).
 * The rows are built as the page builds them, with one difference: the page reads whether a chapter is built from its scripts, which would pull every chapter's script into the post's chunk,
 * so the post reads the sitemap's list instead, which a test holds to those scripts.
 * The rows are sized by the `page-frame` container, the whole page on the Learn to play page, so the post names one around them the width of its figure.
 */
const ROWS: readonly CatalogueRow[] = TUTORIAL_PARTS.map((part) => ({
  part,
  tiles: TUTORIAL_CHAPTERS.filter((chapter) => chapter.part === part).map((chapter) => ({
    ...chapter,
    art: chapterArt(chapter),
    link: TUTORIAL_PAGES.includes(`/tutorial/${chapter.slug}`)
      ? { to: '/tutorial/$chapter', params: { chapter: chapter.slug } }
      : undefined,
  })),
}));

export function ChapterTiles() {
  return (
    <div className={styles.frame}>
      <TutorialTiles rows={ROWS} eager={false} />
    </div>
  );
}
