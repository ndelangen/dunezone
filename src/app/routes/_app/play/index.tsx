import { Stack } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { EmptyNote } from '@ui/content/EmptyNote';
import { PageLayout } from '@ui/layout/PageLayout';
import { useState } from 'react';

import { useLobbyGames } from '@db/play';
import { pageHead } from '@app/routes/pageTitle';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { hasLobbyGames, PlayLobbyGames, PlayLobbyHeader, PlayLobbyToolbar } from '@app/widgets/play-lobby/PlayLobby';
import type { LobbyView } from '@app/widgets/play-lobby/PlayLobby';

import { TableDepartureLink } from './TableDepartureLink';
import { SERVER_UNREACHABLE, useServerUnreachable } from './useServerUnreachable';

/*
 * The lobby lists what the directory holds and nothing more; it never loads the 3D runtime.
 * Any signed-in player sees every listed game. Nothing in the app links here: the lobby stays unlisted
 * (and noindex) until the public-release decision.
 */
export const Route = createFileRoute('/_app/play/')({
  head: () => pageHead('Play Dune!', { noindex: true }),
  component: PlayLobbyPage,
});

const createLink = (rootProps: object) => <Link {...rootProps} to="/play/create" />;
const tutorialLink = (rootProps: object) => <Link {...rootProps} to="/tutorial" />;
/* Opening a game departs for its table as creating one does: the lobby fades while the planet rises into the table's frame. */
const gameLink = (address: string) => (rootProps: object) => <TableDepartureLink {...rootProps} gameId={address} />;

function PlayLobbyPage() {
  const { data: lobby } = useLobbyGames();
  /* The page keeps the search and the list shown, so its toolbar and its games share them. */
  const [query, setQuery] = useState('');
  const [view, setView] = useState<LobbyView>('ongoing');
  const filter = { query, setQuery, view, setView };
  const games = lobby?.status === 'ready' ? lobby : null;
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <PlayLobbyHeader createLink={createLink} tutorialLink={tutorialLink} />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        {hasLobbyGames(games) ? <PlayLobbyToolbar games={games} filter={filter} createLink={createLink} /> : undefined}
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <PlayLobbyGames
          games={games}
          waiting={<LobbyWait status={lobby?.status === 'ready' ? undefined : lobby?.status} />}
          filter={filter}
          gameLink={gameLink}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

/* Convex retries on its own; after a while the wait says so and offers the way home. */
function LobbyWait({ status }: Readonly<{ status: 'sign_in_required' | undefined }>) {
  const unreachable = useServerUnreachable(status === undefined);
  switch (status) {
    case 'sign_in_required':
      return <LoginGate action="see your ongoing and past games" />;
    case undefined:
      break;
  }
  if (!unreachable) {
    return <EmptyNote>Loading games.</EmptyNote>;
  }
  return (
    <Stack gap="sm" align="flex-start" role="status">
      <EmptyNote>{SERVER_UNREACHABLE}</EmptyNote>
      <PageMessage.Home />
    </Stack>
  );
}
