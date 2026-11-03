import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';

import { CREATOR_TUTORIALS } from './creatorTutorials';
import { SAVE_TASK } from './factionTutorialSteps';

/* The editor and its rail load only in the browser: the draft lives in the page's memory and is never saved. */
const FactionChapter = lazy(() => import('./FactionChapter'));

const TUTORIAL = CREATOR_TUTORIALS.find((tutorial) => tutorial.slug === 'create-a-faction')!;

/*
 * The faction tutorial: the faction creator beside the Play tutorial's rail and arrow, one task at a time (Norbert, 2026-11-02).
 * Public and indexed: the server renders the frame with its title, and the creator arrives in the browser.
 */
export const Route = createFileRoute('/_app/create/faction')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'How to create a custom faction for the Dune board game',
      kind: 'Tutorial',
      pathname: '/create/faction',
      description:
        'An interactive tutorial for making your own homebrew Dune faction in the Dune Zone faction creator: name, emblem, background, leaders, troops, alliance and rules, then its faction sheet. Nothing is saved, so try anything.',
      social: { kind: 'Tutorial', shape: 'portrait' },
      trail: [{ name: 'Learn to create', pathname: '/create' }],
    }),
  /* `?step=4` opens the tutorial at its fourth task, up to Save: the task after it needs the faction Save makes. */
  validateSearch: (params: Record<string, unknown>): { step?: number } => {
    const step = Number(params['step']);
    return Number.isInteger(step) && step > 1 && step <= SAVE_TASK ? { step } : {};
  },
  component: FactionTutorialPage,
});

const chaptersLink = ({ children, ...props }: { children?: ReactNode }) => (
  <Link {...props} to="/create">
    {children}
  </Link>
);

function FactionTutorialPage() {
  const { step } = Route.useSearch();
  const loading = (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle eyebrow="Practice draft" title={TUTORIAL.title} />
      </PageLayout.Header>
      <PageLayout.Content>
        <LoadPending title="Opening the faction creator">Nothing you make here is saved.</LoadPending>
      </PageLayout.Content>
    </PageLayout>
  );
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <FactionChapter
          number={TUTORIAL.number}
          title={TUTORIAL.title}
          firstTask={step === undefined ? 0 : step - 1}
          chaptersLink={chaptersLink}
        />
      </Suspense>
    </ClientOnly>
  );
}
