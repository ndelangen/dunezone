import { Stack, Text, VisuallyHidden } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Clock } from 'lucide-react';
import { useId } from 'react';

import { pageHead } from '@app/routes/pageTitle';

import { chapterArt, TUTORIAL_CHAPTERS, TUTORIAL_PARTS } from './chapters';
import type { TutorialChapter, TutorialPart } from './chapters';
import { CHAPTER_SCRIPTS } from './chapterScripts/scripts';
import styles from './index.module.css';

/*
 * The tutorial's landing page: every chapter as a tile, in rows by part (layout A, Norbert 2026-10-23).
 * Read left to right and top to bottom, the tiles are a new player's path; any tile will start its chapter on its own.
 * The tutorial ships a chapter at a time (Norbert, 2026-10-23), so a chapter not yet built shows as coming soon and opens nothing,
 * the way the assets page showed planned types before every type existed.
 * Only the lobby header links here, so the tutorial stays as unlisted (and noindex) as Play itself through the private beta.
 */
export const Route = createFileRoute('/_app/tutorial/')({
  head: () => pageHead('Learn to play', { noindex: true }),
  component: TutorialLanding,
});

const chaptersIn = (part: TutorialPart) => TUTORIAL_CHAPTERS.filter((chapter) => chapter.part === part);

/*
 * A chapter's tile: its picture first, then its number beside its title and goal (the prototype Norbert picked, layout A).
 * A chapter not yet built keeps its picture in colour and says so in a chip where its minutes are, and opens nothing.
 * A built chapter's title is a link that covers the whole tile, so the tile opens the chapter and reads as one link.
 */
function ChapterTile({ chapter, eager }: Readonly<{ chapter: TutorialChapter; eager: boolean }>) {
  const titleId = useId();
  const built = chapter.slug in CHAPTER_SCRIPTS;
  const title = (
    <>
      <VisuallyHidden component="span">{`Chapter ${chapter.number}: `}</VisuallyHidden>
      {chapter.title}
    </>
  );
  return (
    <li className={styles.cell}>
      <Surface
        as="article"
        padding="none"
        className={styles.tile}
        data-built={built || undefined}
        aria-labelledby={titleId}
      >
        <div className={styles.art}>
          <img src={chapterArt(chapter)} alt="" loading={eager ? undefined : 'lazy'} />
          <span className={styles.chips}>
            {built ? null : <StatusBadge tone="pending">Coming soon</StatusBadge>}
            <StatusBadge icon={<Clock size={12} aria-hidden />}>{`${chapter.minutes} min`}</StatusBadge>
          </span>
        </div>
        <div className={styles.words}>
          <span className={styles.number} aria-hidden>
            {chapter.number}
          </span>
          <Text id={titleId} fw={700} lh={1.3}>
            {built ? (
              <Link to="/tutorial/$chapter" params={{ chapter: chapter.slug }} className={styles.open}>
                {title}
              </Link>
            ) : (
              title
            )}
          </Text>
          <Text size="sm" c="dimmed" lh={1.35}>
            {chapter.goal}
          </Text>
        </div>
      </Surface>
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
              <ol className={styles.row} aria-label={part} start={chaptersIn(part)[0]!.number}>
                {chaptersIn(part).map((chapter) => (
                  <ChapterTile key={chapter.slug} chapter={chapter} eager={part === TUTORIAL_PARTS[0]} />
                ))}
              </ol>
            </Section>
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
