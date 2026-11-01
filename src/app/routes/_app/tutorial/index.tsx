import { Stack, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';

import { publicPageHead } from '@app/routes/publicPage';
import { TutorialRows, TutorialTracks } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
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
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle title="Learn to play" subtitle="How Dune Zone Play works" />
          <Text size="lg" fw={500} maw="36rem">
            Pick what you want to learn, or follow the chapters in order. Every chapter is a table you can play with.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <TutorialTracks track="play" />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <TutorialRows rows={ROWS} />
      </PageLayout.Content>
    </PageLayout>
  );
}
