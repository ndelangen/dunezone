import { PageLayout } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import { CreateGamePass, CreateGamePassTitle } from '@app/widgets/create-game/CreateGamePass';
import type { CreateGameDraft, CreateGameDraftEvent, CreateGameRequest } from '@app/widgets/create-game/CreateGamePass';
import { PlayLobbyGames, PlayLobbyHeader, PlayLobbyToolbar } from '@app/widgets/play-lobby/PlayLobby';
import type { LobbyFilter, LobbyGames } from '@app/widgets/play-lobby/PlayLobby';

import { TUTORIAL_RULESET } from './lobbyGames';

const stayingLink =
  (target: string, onClick: () => void = () => undefined, disabled = false) =>
  ({ children, ...rootProps }: { children?: ReactNode }) => (
    <button
      {...rootProps}
      {...(disabled ? { disabled: true } : {})}
      type="button"
      data-tutorial-target={target}
      onClick={onClick}
    >
      {children}
    </button>
  );

export function TutorialLobby({
  games,
  filter,
  onOpen,
  openGame,
}: Readonly<{
  games: LobbyGames;
  filter: LobbyFilter;
  onOpen: (address: string) => void;
  openGame: string | null;
}>) {
  const createLink = stayingLink('create');
  const createDisabledReason = 'The Create your own game tutorial covers this';
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <PlayLobbyHeader
          createLink={createLink}
          createDisabledReason={createDisabledReason}
          tutorialLink={stayingLink('tutorial')}
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <PlayLobbyToolbar
          games={games}
          filter={filter}
          createLink={createLink}
          createDisabledReason={createDisabledReason}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <PlayLobbyGames
          games={games}
          waiting={null}
          filter={filter}
          gameLink={(address) => stayingLink(`game:${address}`, () => onOpen(address), address !== openGame)}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

export function TutorialCreate({
  draft,
  dispatch,
  open,
  onCreate,
}: Readonly<{
  draft: CreateGameDraft;
  dispatch: (event: CreateGameDraftEvent) => void;
  open: boolean;
  onCreate: (request: CreateGameRequest) => void;
}>) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <CreateGamePassTitle />
      </PageLayout.Header>
      <PageLayout.Content>
        <CreateGamePass
          rulesets={[TUTORIAL_RULESET]}
          preview={null}
          draft={draft}
          dispatch={dispatch}
          pending={false}
          departing={false}
          notice={null}
          failure={null}
          disabledReason={open ? undefined : 'Choose the game settings to continue'}
          onCreate={onCreate}
          rulesetLink={() => stayingLink('ruleset')}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}
