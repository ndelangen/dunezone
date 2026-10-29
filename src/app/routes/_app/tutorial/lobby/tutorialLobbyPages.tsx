import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import { CreateGamePass, CreateGamePassTitle } from '@app/widgets/create-game/CreateGamePass';
import type { CreateGameDraft, CreateGameDraftEvent, CreateGameRequest } from '@app/widgets/create-game/CreateGamePass';
import { PlayLobbyGames, PlayLobbyToolbar } from '@app/widgets/play-lobby/PlayLobby';
import type { LobbyFilter, LobbyGames } from '@app/widgets/play-lobby/PlayLobby';

import { TUTORIAL_RULESET } from './lobbyGames';
import styles from './tutorialLobbyPages.module.css';

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
    <PageLayout height="fullscreen">
      <PageLayout.Header size="hero">
        <PageTitle title="Play Dune!" />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <div className={styles.toolbar}>
          <PlayLobbyToolbar
            games={games}
            filter={filter}
            createLink={createLink}
            createDisabledReason={createDisabledReason}
          />
        </div>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <div className={styles.content}>
          <PlayLobbyGames
            games={games}
            waiting={null}
            filter={filter}
            gameLink={(address) => stayingLink(`game:${address}`, () => onOpen(address), address !== openGame)}
          />
        </div>
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
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <CreateGamePassTitle />
      </PageLayout.Header>
      <PageLayout.Content>
        <div className={styles.content}>
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
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
