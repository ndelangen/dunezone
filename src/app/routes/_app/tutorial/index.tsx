import { createFileRoute } from '@tanstack/react-router';

import { publicPageHead } from '@app/routes/publicPage';
import { TutorialCatalogue } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
import type { CatalogueRow } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';

import { chapterArt, TUTORIAL_CHAPTERS, TUTORIAL_PARTS } from './chapters';
import { CHAPTER_SCRIPTS } from './chapterScripts/scripts';

/* The Playing Dune tutorials: every Play chapter as a tile, in rows by part. Public and indexed (Norbert, 2026-11-01). */
export const Route = createFileRoute('/_app/tutorial/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Learn to play Dune online',
      kind: 'Tutorials',
      pathname: '/tutorial',
      description:
        'Short interactive chapters that teach Dune Zone Play: find or create a game, move pieces, deal cards, bid, battle and finish a game of the Dune board game online.',
      social: { kind: 'Tutorials', shape: 'portrait' },
    }),
  component: PlayTutorials,
});

const ROWS: readonly CatalogueRow[] = TUTORIAL_PARTS.map((part) => ({
  part,
  tiles: TUTORIAL_CHAPTERS.filter((chapter) => chapter.part === part).map((chapter) => ({
    ...chapter,
    art: chapterArt(chapter),
    link: chapter.slug in CHAPTER_SCRIPTS ? { to: '/tutorial/$chapter', params: { chapter: chapter.slug } } : undefined,
  })),
}));

function PlayTutorials() {
  return <TutorialCatalogue track="play" rows={ROWS} />;
}
