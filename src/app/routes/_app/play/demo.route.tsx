import { Anchor } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';

import { playSearch } from './search';
import { TableWait } from './TableWait';

const loadLocalTable = () => import('./LocalTable');
const LocalTable = lazy(loadLocalTable);

export const Route = createFileRoute('/_app/play/demo')({
  validateSearch: playSearch,
  /* Starts the table bundle with the route, and on an intent preload, so the frame never waits for it. */
  loader: () => {
    void loadLocalTable();
  },
  head: () => ({ meta: [{ title: 'Dune Play demo | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: PlayPage,
});

function PlayPage() {
  const { seats } = Route.useSearch();
  const loading = (
    <TableWait status="Loading the table...">
      <Anchor component={Link} to="/play">
        Back to lobby
      </Anchor>
    </TableWait>
  );

  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title="Dune Play demo" />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={loading}>
          <Suspense fallback={loading}>
            <LocalTable seatCount={seats} />
          </Suspense>
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}
