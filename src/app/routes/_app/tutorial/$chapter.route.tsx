import { Button } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { TableWait } from '../play/TableWait';
import { TUTORIAL_CHAPTERS } from './chapters';
import { CHAPTER_SCRIPTS } from './chapterScripts/scripts';

/*
 * The table carries the game Worker's code and the recorded setup, so it loads only in the browser, and only on a chapter page.
 */
const ChapterPlay = lazy(() => import('./TutorialTable'));

const chapterAt = (slug: string) => TUTORIAL_CHAPTERS.find((chapter) => chapter.slug === slug);

/* A chapter's page: its table and its band, for a chapter that is built. Unlisted like the landing page. */
export const Route = createFileRoute('/_app/tutorial/$chapter')({
  head: ({ params }) => pageHead(chapterAt(params.chapter)?.title ?? 'Learn to play', { noindex: true }),
  /* `?step=4` opens a chapter at its fourth task, so a later task can be tried without playing the ones before it. */
  validateSearch: (params: Record<string, unknown>): { step?: number } => {
    const step = Number(params['step']);
    return Number.isInteger(step) && step > 1 ? { step } : {};
  },
  component: ChapterPage,
});

const chaptersLink = ({ children, ...props }: { children?: ReactNode }) => (
  <Link {...props} to="/tutorial">
    {children}
  </Link>
);

/* The chapter after this one, when it is built: the end of a chapter leads on to it, or back to the list when there is none yet. */
function nextLinkAfter(slug: string) {
  const next = TUTORIAL_CHAPTERS[TUTORIAL_CHAPTERS.findIndex((chapter) => chapter.slug === slug) + 1];
  if (!next || !CHAPTER_SCRIPTS[next.slug]) {
    return undefined;
  }
  return ({ children, ...props }: { children?: ReactNode }) => (
    <Link {...props} to="/tutorial/$chapter" params={{ chapter: next.slug }}>
      {children}
    </Link>
  );
}

function ChapterPage() {
  const { chapter: slug } = Route.useParams();
  const { step } = Route.useSearch();
  const chapter = chapterAt(slug);
  const script = CHAPTER_SCRIPTS[slug];
  if (!chapter || !script) {
    return (
      <PageMessage size="compact" title="Learn to play">
        <NotAvailable title="This chapter is not ready yet">
          Pick another chapter from the Learn to play page.
        </NotAvailable>
      </PageMessage>
    );
  }
  const exit = (
    <Button component={Link} to="/play" variant="default" aria-label="Back to lobby">
      Lobby
    </Button>
  );
  /* The same dark frame the chapter's table opens in, so the page does not jump when it arrives. */
  const loading = (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title={chapter.title} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <TableWait status="Setting the table...">{exit}</TableWait>
      </PageLayout.Content>
    </PageLayout>
  );
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <ChapterPlay
          key={slug}
          chapter={chapter}
          script={script}
          firstTask={step === undefined ? 0 : step - 1}
          chaptersLink={chaptersLink}
          nextLink={nextLinkAfter(slug)}
          exit={exit}
        />
      </Suspense>
    </ClientOnly>
  );
}
