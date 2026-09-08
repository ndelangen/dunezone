import { Text } from '@mantine/core';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';

import { playSearch } from './search';

const LocalTable = lazy(() => import('./LocalTable'));

export const Route = createFileRoute('/_app/play')({
  validateSearch: playSearch,
  head: () => ({ meta: [{ title: 'Dune Play | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: PlayPage,
});

function PlayPage() {
  const { seats } = Route.useSearch();
  const navigate = Route.useNavigate();
  const loading = <Text role="status">Loading the table...</Text>;

  return (
    <PageLayout height="viewport">
      <PageLayout.Header size="compact">
        <PageTitle title="Dune Play" />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={loading}>
          <Suspense fallback={loading}>
            <LocalTable
              seatCount={seats}
              onSeatCountChange={(seatCount) => {
                void navigate({ search: { seats: seatCount }, replace: true });
              }}
            />
          </Suspense>
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}
