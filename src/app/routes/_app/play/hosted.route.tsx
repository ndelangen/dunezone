import { Anchor, Button, Stack, Text } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { lazy, Suspense } from 'react';

import { useHostedFixture } from '@db/play';

import { TableWait } from './TableWait';

const loadHostedTable = () => import('./multiplayer/HostedTable');
const HostedTable = lazy(loadHostedTable);

export const Route = createFileRoute('/_app/play/hosted')({
  /* Starts the table bundle with the route, and on an intent preload, so the frame never waits for it after the access answer. */
  loader: () => {
    void loadHostedTable();
  },
  head: () => ({ meta: [{ title: 'Hosted table | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: HostedPlayPage,
});

/*
 * One dark frame from the first render to the settled table: the access answer, the table chunk and the
 * connection are sentences inside it. Only a visitor the table turns away gets a page instead.
 */
function HostedPlayPage() {
  const { data } = useHostedFixture();
  const exit = (
    <Button component={Link} to="/play" variant="default" aria-label="Back to lobby">
      Lobby
    </Button>
  );
  switch (data?.status) {
    case undefined:
    case 'ready': {
      const loading = <TableWait status="Loading the table...">{exit}</TableWait>;
      return (
        <PageLayout height="fullscreen">
          <PageLayout.Header size="compact">
            <PageTitle title="Hosted table" />
          </PageLayout.Header>
          <PageLayout.Content width="viewport">
            {data ? (
              <ClientOnly fallback={loading}>
                <Suspense fallback={loading}>
                  <HostedTable key={data.gameId} gameId={data.gameId} exitControl={exit} />
                </Suspense>
              </ClientOnly>
            ) : (
              <TableWait status="Checking access to the hosted table...">{exit}</TableWait>
            )}
          </PageLayout.Content>
        </PageLayout>
      );
    }
    case 'sign_in_required':
    case 'unavailable':
      return (
        <PageLayout>
          <PageLayout.Header size="compact">
            <PageTitle title="Hosted table" />
          </PageLayout.Header>
          <PageLayout.Content>
            <Surface padding="xl">
              <Stack gap="sm">
                {data.status === 'sign_in_required' ? (
                  <>
                    <Text>Sign in to join the hosted table.</Text>
                    <Anchor component={Link} to="/auth/login">
                      Sign in
                    </Anchor>
                  </>
                ) : (
                  <Text role="status">The hosted table is not available yet.</Text>
                )}
                <Anchor component={Link} to="/play">
                  Back to lobby
                </Anchor>
              </Stack>
            </Surface>
          </PageLayout.Content>
        </PageLayout>
      );
  }
}
