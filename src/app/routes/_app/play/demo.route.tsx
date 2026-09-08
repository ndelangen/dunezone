import { Text } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';

import styles from './demo.module.css';
import { playSearch } from './search';

const LocalTable = lazy(() => import('./LocalTable'));

export const Route = createFileRoute('/_app/play/demo')({
  validateSearch: playSearch,
  head: () => ({ meta: [{ title: 'Dune Play demo | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: PlayPage,
});

function PlayPage() {
  const { seats } = Route.useSearch();
  const navigate = Route.useNavigate();
  const loading = (
    <div className={styles.loading}>
      <Text role="status">Loading the table...</Text>
      <Link to="/play">Back to lobby</Link>
    </div>
  );

  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title="Dune Play demo" />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={loading}>
          <Suspense fallback={loading}>
            <LocalTable
              exitControl={
                <Link to="/play" className="button button--quiet" aria-label="Back to lobby">
                  Lobby
                </Link>
              }
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
