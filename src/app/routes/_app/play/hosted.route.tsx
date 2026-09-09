import { Stack, Text } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { lazy, Suspense } from 'react';

import { useHostedFixture } from '@db/play';

import styles from './demo.module.css';

const HostedTable = lazy(() => import('./multiplayer/HostedTable'));

export const Route = createFileRoute('/_app/play/hosted')({
  head: () => ({ meta: [{ title: 'Hosted table | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: HostedPlayPage,
});

function HostedPlayPage() {
  const { data } = useHostedFixture();
  const ready = data?.status === 'ready';
  const exit = (
    <Link to="/play" className="button button--quiet" aria-label="Back to lobby">
      Lobby
    </Link>
  );
  const loading = (
    <div className={styles.loading}>
      <Text role="status">Loading the table...</Text>
      {exit}
    </div>
  );

  return (
    <PageLayout height={ready ? 'fullscreen' : undefined}>
      <PageLayout.Header size="compact">
        <PageTitle title="Hosted table" />
      </PageLayout.Header>
      <PageLayout.Content width={ready ? 'viewport' : undefined}>
        {ready ? (
          <ClientOnly fallback={loading}>
            <Suspense fallback={loading}>
              <HostedTable key={data.gameId} gameId={data.gameId} exitControl={exit} />
            </Suspense>
          </ClientOnly>
        ) : (
          <Surface padding="xl">
            <Stack gap="sm">
              {data?.status === 'sign_in_required' ? (
                <>
                  <Text>Sign in to join the hosted table.</Text>
                  <Link to="/auth/login">Sign in</Link>
                </>
              ) : (
                <Text role="status">
                  {data ? 'The hosted table is not available yet.' : 'Checking access to the hosted table...'}
                </Text>
              )}
              <Link to="/play">Back to lobby</Link>
            </Stack>
          </Surface>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
