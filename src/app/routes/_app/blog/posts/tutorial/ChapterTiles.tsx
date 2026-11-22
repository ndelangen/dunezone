import { TUTORIAL_PAGES } from '@shared/recordlessPublicPages';

import { chapterArt, TUTORIAL_CHAPTERS } from '@app/routes/_app/tutorial/chapters';
import type { CatalogueTile } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
import { TutorialTileStrip } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';

/*
 * The Learn to play page's chapter tiles, as the page draws them, on one line that scrolls sideways, in the post about the tutorial (Norbert, 2026-11-07: show the real tiles, one line of them, not every row).
 * The tiles are built as the page builds them, with one difference: the page reads whether a chapter is built from its scripts, which would pull every chapter's script into the post's chunk,
 * so the post reads the sitemap's list instead, which a test holds to those scripts.
 */
const TILES: readonly CatalogueTile[] = TUTORIAL_CHAPTERS.map((chapter) => ({
  ...chapter,
  art: chapterArt(chapter),
  link: TUTORIAL_PAGES.includes(`/tutorial/${chapter.slug}`)
    ? { to: '/tutorial/$chapter', params: { chapter: chapter.slug } }
    : undefined,
}));

export function ChapterTiles() {
  return <TutorialTileStrip tiles={TILES} label="Tutorial chapters" />;
}
