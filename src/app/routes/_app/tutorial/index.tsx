import { Stack, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Card } from '@ui/surface/Card';
import { Clock } from 'lucide-react';

import { pageHead } from '@app/routes/pageTitle';

import { chapterArt, TUTORIAL_CHAPTERS, TUTORIAL_PARTS } from './chapters';
import type { TutorialChapter, TutorialPart } from './chapters';
import styles from './index.module.css';

/*
 * The tutorial's landing page: every chapter as a tile, in rows by part (layout A, Norbert 2026-10-23).
 * Read left to right and top to bottom, the tiles are a new player's path; any tile will start its chapter on its own.
 * The tutorial ships a chapter at a time (Norbert, 2026-10-23), so a chapter not yet built shows as coming soon and opens nothing,
 * the way the assets page showed planned types before every type existed.
 * Nothing in the app links here: like the lobby, the tutorial stays unlisted (and noindex) through the private beta.
 */
export const Route = createFileRoute('/_app/tutorial/')({
  head: () => pageHead('Learn to play', { noindex: true }),
  component: TutorialLanding,
});

const chaptersIn = (part: TutorialPart) => TUTORIAL_CHAPTERS.filter((chapter) => chapter.part === part);

function ChapterTile({ chapter }: Readonly<{ chapter: TutorialChapter }>) {
  return (
    <li className={styles.cell}>
      <Card title={chapter.title} padding="sm" className={styles.tile}>
        <div className={styles.art}>
          <img src={chapterArt(chapter)} alt="" loading="lazy" />
          <span className={styles.number} aria-label={`Chapter ${chapter.number}`}>
            {chapter.number}
          </span>
          <span className={styles.minutes}>
            <StatusBadge icon={<Clock size={12} aria-hidden />}>{`${chapter.minutes} min`}</StatusBadge>
          </span>
          <span className={styles.soon}>
            <StatusBadge>Coming soon</StatusBadge>
          </span>
        </div>
        <Text size="sm" c="dimmed">
          {chapter.goal}
        </Text>
      </Card>
    </li>
  );
}

function TutorialLanding() {
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
      <PageLayout.Content>
        <Stack gap="xl">
          {TUTORIAL_PARTS.map((part) => (
            <Section key={part} title={part}>
              <div className={styles.part}>
                <ol className={styles.row} aria-label={part} start={chaptersIn(part)[0]!.number}>
                  {chaptersIn(part).map((chapter) => (
                    <ChapterTile key={chapter.slug} chapter={chapter} />
                  ))}
                </ol>
              </div>
            </Section>
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
