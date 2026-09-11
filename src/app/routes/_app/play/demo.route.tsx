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
  const { seats, variant, scenario } = Route.useSearch();
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
            <LocalTable seatCount={seats} draftingVariant={variant} draftingScenario={scenario} />
          </Suspense>
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}
