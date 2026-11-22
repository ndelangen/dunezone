import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageState } from '@ui/block/PageState';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';

import { CREATOR_TUTORIALS, creatorArt } from './creatorTutorials';

/* The faction pages and their rail load only in the browser: the practice copy lives in the page's memory and is never saved. */
const VariantChapter = lazy(() => import('./VariantChapter'));

const TUTORIAL = CREATOR_TUTORIALS.find((tutorial) => tutorial.slug === 'make-a-variant')!;

/*
 * The variant tutorial: the faction pages beside the Play tutorial's rail and arrow, one task at a time (Norbert, 2026-11-17).
 * Public and indexed: the server renders the frame with its title, and the practice copy arrives in the browser.
 */
export const Route = createFileRoute('/_app/create/variant')({
  ssr: true,
  loader: async () => ({
    socialImage: (await import('../tutorial/socialImage')).tutorialSocialImage(creatorArt(TUTORIAL)),
  }),
  head: ({ loaderData }) =>
    publicPageHead({
      name: 'How to make a variant of a Dune faction',
      kind: 'Tutorial',
      pathname: '/create/variant',
      description:
        'An interactive tutorial on faction variants in Dune Zone: open a faction, switch between its variants, make a variant of your own, choose its parent and change one field. Nothing is saved, so try anything.',
      image: loaderData?.socialImage,
      social: {
        kind: 'Tutorial · Creating content',
        shape: 'landscape',
        text: `${TUTORIAL.goal}, in a ${TUTORIAL.minutes}-minute tutorial.`,
      },
      trail: [{ name: 'Learn to create', pathname: '/create' }],
    }),
  component: VariantTutorialPage,
});

const chaptersLink = ({ children, ...props }: { children?: ReactNode }) => (
  <Link {...props} to="/create">
    {children}
  </Link>
);

function VariantTutorialPage() {
  const loading = (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle eyebrow="Practice copy" title={TUTORIAL.title} />
      </PageLayout.Header>
      <PageLayout.Content>
        <PageState kind="pending" title="Opening a practice copy of Dune Zone">
          It runs in your browser, so nothing you make here is saved to the site.
        </PageState>
      </PageLayout.Content>
    </PageLayout>
  );
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <VariantChapter number={TUTORIAL.number} title={TUTORIAL.title} loading={loading} chaptersLink={chaptersLink} />
      </Suspense>
    </ClientOnly>
  );
}
