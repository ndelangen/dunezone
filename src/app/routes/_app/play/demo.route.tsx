import { Anchor, Text } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
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
  const loading = (
    <DarkSchemeIsland>
      <div className={styles.loading} {...darkSchemeIslandAttributes}>
        <Text role="status">Loading the table...</Text>
        <Anchor component={Link} to="/play">
          Back to lobby
        </Anchor>
      </div>
    </DarkSchemeIsland>
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
