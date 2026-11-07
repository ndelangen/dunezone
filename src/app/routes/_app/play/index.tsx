import { Stack } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { EmptyNote } from '@ui/content/EmptyNote';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { House, LogIn } from 'lucide-react';
import { useState } from 'react';

import { useLobbyGames } from '@db/play';
import { pageHead } from '@app/routes/pageTitle';
import { hasLobbyGames, PlayLobbyGames, PlayLobbyHeader, PlayLobbyToolbar } from '@app/widgets/play-lobby/PlayLobby';
import type { LobbyView } from '@app/widgets/play-lobby/PlayLobby';

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
const gameLink = (address: string) => (rootProps: object) => (
  <Link {...rootProps} to="/play/$gameId" params={{ gameId: address }} />
);

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
      return (
        <Stack gap="sm" align="flex-start">
          <EmptyNote>Sign in to see your ongoing and past games.</EmptyNote>
          <LabeledAction
            icon={<LogIn size={16} />}
            renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" search={{ redirect: '/play' }} />}
          >
            Log in
          </LabeledAction>
        </Stack>
      );
    case undefined:
      break;
  }
  if (!unreachable) {
    return <EmptyNote>Loading games.</EmptyNote>;
  }
  return (
    <Stack gap="sm" align="flex-start" role="status">
      <EmptyNote>{SERVER_UNREACHABLE}</EmptyNote>
      <LabeledAction icon={<House size={16} />} renderRoot={(rootProps) => <Link {...rootProps} to="/" />}>
        Go home
      </LabeledAction>
    </Stack>
  );
}
