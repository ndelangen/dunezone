import { Button, Text } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { lazy, Suspense } from 'react';

import { useGameAccess } from '@db/play';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import styles from './demo.module.css';

const HostedTable = lazy(() => import('./multiplayer/HostedTable'));

export const Route = createFileRoute('/_app/play/$gameId')({
  head: () => ({ meta: [{ title: 'Game | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: GamePage,
});

/*
 * A game's one route: the current stage in a persistent frame, whatever the stage.
 * Before the socket opens the page says only what the directory allows: a game the viewer may not
 * enter is not found, a pending game is preparing, an expired one could not be prepared.
 */
function GamePage() {
  const { gameId } = Route.useParams();
  const { data } = useGameAccess(gameId);
  const exit = (
    <Button component={Link} to="/play" variant="default" aria-label="Back to lobby">
      Lobby
    </Button>
  );
  switch (data?.status) {
    case undefined:
      return (
        <PageMessage size="compact" title="Game">
          <LoadPending title="Loading the game">The directory is still answering.</LoadPending>
        </PageMessage>
      );
    case 'sign_in_required':
      return (
        <PageMessage size="compact" title="Game">
          <LoginGate action="open a game" />
        </PageMessage>
      );
    case 'not_found':
      return (
        <PageMessage size="compact" title="Game" back={exit}>
          <NotAvailable title="This game is not available">There is no game you can open at this address.</NotAvailable>
        </PageMessage>
      );
    case 'preparing':
      return (
        <PageMessage size="compact" title="Game" back={exit}>
          <LoadPending title="Preparing the table">
            The game is being set up. This page opens the table as soon as it is ready.
          </LoadPending>
        </PageMessage>
      );
    case 'unavailable':
      return (
        <PageMessage size="compact" title="Game" back={exit}>
          <NotAvailable title="This game could not be prepared">
            {data.reason ?? 'The table was not ready in time. Create the game again from the lobby.'}
          </NotAvailable>
        </PageMessage>
      );
    case 'ready': {
      const loading = (
        <DarkSchemeIsland>
          <div className={styles.loading} {...darkSchemeIslandAttributes}>
            <Text role="status">Loading the table...</Text>
            {exit}
          </div>
        </DarkSchemeIsland>
      );
      return (
        <PageLayout height="fullscreen">
          <PageLayout.Header size="compact">
            <PageTitle title={data.name} />
          </PageLayout.Header>
          <PageLayout.Content width="viewport">
            <ClientOnly fallback={loading}>
              <Suspense fallback={loading}>
                <HostedTable key={data.gameId} gameId={data.gameId} exitControl={exit} />
              </Suspense>
            </ClientOnly>
          </PageLayout.Content>
        </PageLayout>
      );
    }
  }
}
