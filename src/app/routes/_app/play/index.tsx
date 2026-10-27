import { Anchor, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';

import { useLobbyGames } from '@db/play';
import { pageHead } from '@app/routes/pageTitle';
import { PlayLobby } from '@app/widgets/play-lobby/PlayLobby';

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
  return (
    <PlayLobby
      games={lobby?.status === 'ready' ? lobby : null}
      waiting={<LobbyWait status={lobby?.status === 'ready' ? undefined : lobby?.status} />}
      createLink={createLink}
      tutorialLink={tutorialLink}
      gameLink={gameLink}
    />
  );
}

/* Convex retries on its own; after a while the wait says so and offers the way home. */
function LobbyWait({ status }: Readonly<{ status: 'sign_in_required' | undefined }>) {
  const unreachable = useServerUnreachable(status === undefined);
  switch (status) {
    case 'sign_in_required':
      return <Text c="dimmed">Ongoing and past games appear here once you sign in.</Text>;
    case undefined:
      break;
  }
  if (!unreachable) {
    return <Text c="dimmed">Loading games.</Text>;
  }
  return (
    <Stack gap="xs" role="status">
      <Text c="dimmed">{SERVER_UNREACHABLE}</Text>
      <Anchor component={Link} to="/">
        Go back home
      </Anchor>
    </Stack>
  );
}
