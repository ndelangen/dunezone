import { Button } from '@mantine/core';
import { TUTORIAL_PAGES } from '@shared/recordlessPublicPages';
import { ClientOnly, createFileRoute, Link, notFound, redirect } from '@tanstack/react-router';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { ArrakisBoardSeedProvider, loadArrakisBoard } from '@db/arrakis';
import { useCurrentProfile } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { publicPageHead } from '@app/routes/publicPage';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { TableWait } from '../play/TableWait';
import { chapterAt, TUTORIAL_CHAPTERS } from './chapters';
import { CHAPTER_SCRIPTS } from './chapterScripts/scripts';

/*
 * The table carries the game Worker's code and the recorded setup, so it loads only in the browser, and only on a chapter page.
 */
const ChapterPlay = lazy(() => import('./TutorialTable'));
/* A lobby chapter shows the lobby and create pages with sample games instead, so it loads no table. */
const LobbyPlay = lazy(() => import('./LobbyChapter'));

/*
 * A chapter's page: its table and its rail, for a chapter that is built.
 * Public and indexed (Norbert, 2026-11-01): the server renders the chapter's frame with its title, and the table arrives in the browser.
 */
export const Route = createFileRoute('/_app/tutorial/$chapter')({
  ssr: true,
  beforeLoad: ({ params }) => {
    if (params.chapter === 'find-or-create') {
      throw redirect({ to: '/tutorial/$chapter', params: { chapter: 'find-a-game' }, search: {} });
    }
    /* An unknown chapter is the router's 404, as an unknown blog post is, not a cacheable public page. */
    if (!chapterAt(params.chapter)) {
      throw notFound();
    }
  },
  /* The saved Arrakis rides in the page's HTML, so the chapter's table sets up on it without waiting for a query. */
  loader: async () => ({ arrakis: await loadArrakisBoard() }),
  head: ({ params }) => {
    const chapter = chapterAt(params.chapter);
    /* TUTORIAL_PAGES is held to CHAPTER_SCRIPTS by a test; the head reads it so the eager route tree does not pull every chapter script. */
    if (!chapter || !TUTORIAL_PAGES.includes(`/tutorial/${chapter.slug}`)) {
      return pageHead(chapter?.title ?? 'Learn to play', { noindex: true });
    }
    return publicPageHead({
      name: chapter.title,
      kind: 'Dune Zone Play tutorial',
      pathname: `/tutorial/${chapter.slug}`,
      description: `${chapter.goal}. An interactive ${chapter.minutes}-minute chapter of the Dune Zone Play tutorial, at a table you can play with.`,
      social: { kind: 'Tutorial', shape: 'portrait' },
      trail: [{ name: 'Learn to play', pathname: '/tutorial' }],
    });
  },
  /* `?step=4` opens a chapter at its fourth task, so a later task can be tried without playing the ones before it. */
  validateSearch: (params: Record<string, unknown>): { step?: number } => {
    const step = Number(params['step']);
    return Number.isInteger(step) && step > 1 ? { step } : {};
  },
  component: SeededChapterPage,
});

function SeededChapterPage() {
  return (
    <ArrakisBoardSeedProvider seed={Route.useLoaderData().arrakis}>
      <ChapterPage />
    </ArrakisBoardSeedProvider>
  );
}

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
  const current = useCurrentProfile();
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
  if (current.data === undefined) {
    return loading;
  }
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        {'page' in script ? (
          <LobbyPlay
            key={`${slug}:${current.data?.slug ?? 'guest'}`}
            chapter={chapter}
            script={script}
            viewer={current.data}
            exit={exit}
            firstTask={step === undefined ? 0 : step - 1}
            chaptersLink={chaptersLink}
            nextLink={nextLinkAfter(slug)}
          />
        ) : (
          <ChapterPlay
            key={`${slug}:${current.data?.slug ?? 'guest'}`}
            chapter={chapter}
            script={script}
            viewer={current.data}
            firstTask={step === undefined ? 0 : step - 1}
            chaptersLink={chaptersLink}
            nextLink={nextLinkAfter(slug)}
            exit={exit}
          />
        )}
      </Suspense>
    </ClientOnly>
  );
}
