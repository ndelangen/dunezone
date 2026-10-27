import { Stack, Text } from '@mantine/core';
import { TUTORIAL_RECIPE } from '@shared/tutorial/recipe';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Fragment, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { GameLink } from '../play/GameLink';
import type { TutorialChapter } from './chapters';
import type { LobbyChapterScript, LobbyState } from './chapterScripts/chapterScript';
import { sampleLobby, TutorialCreate, TutorialLobby } from './lobby/tutorialLobbyPages';
import setup from './setup/setup.json';
import type { TutorialSetup } from './setup/tutorialSetup';
import { TutorialGuide } from './TutorialGuide';

const START: LobbyState = { view: 'lobby', createOpen: false, ruleset: null, created: null };

/* Where the player is, kept outside React so the tasks read it as it is now and the page follows it. */
function lobbyStore() {
  let state = START;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: LobbyState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/* What a created game looks like from the chapter: its name, and the link that brings the others to it. */
function CreatedGame({ game, page }: Readonly<{ game: NonNullable<LobbyState['created']>; page: string }>) {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title={game.name} subtitle="Your new game" />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="sm" align="center" ta="center">
            <Text fw={600}>The table is set, and you hold its first seat.</Text>
            <Text c="dimmed" maw="32rem">
              The draft starts once enough players have taken a seat. Send them the game’s link.
            </Text>
            <GameLink address={game.address} page={page} />
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/**
 * A chapter played on the lobby and the create page rather than at a table: the rail beside the pages, which show sample games and create a game on the chapter's page alone.
 */
export default function LobbyChapter({
  chapter,
  script,
  firstTask = 0,
  chaptersLink,
  nextLink,
}: Readonly<{
  chapter: TutorialChapter;
  script: LobbyChapterScript;
  firstTask?: number;
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
}>) {
  const [chapterState] = useState(() => {
    const store = lobbyStore();
    return {
      store,
      games: sampleLobby(setup as unknown as TutorialSetup, TUTORIAL_RECIPE.learner),
      tasks: script.tasks(store.get, () => store.set({ ...store.get(), createOpen: true })),
    };
  });
  const { store, games, tasks } = chapterState;
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  /* Reset starts the pages afresh, so a half-filled create page does not carry over. */
  const [epoch, setEpoch] = useState(0);
  const page = `/tutorial/${chapter.slug}`;
  return (
    <TutorialGuide
      number={chapter.number}
      title={chapter.title}
      tasks={tasks}
      firstTask={firstTask}
      learned={script.learned}
      withTable={false}
      onReset={() => {
        store.set(START);
        setEpoch((value) => value + 1);
      }}
      chaptersLink={chaptersLink}
      nextLink={nextLink}
    >
      <Fragment key={epoch}>
        {state.view === 'lobby' && (
          <TutorialLobby
            games={games}
            /* Leaving the lobby before the chapter asks would strand the steps that read it, so the button waits for its step. */
            onCreate={() => store.get().createOpen && store.set({ ...store.get(), view: 'create' })}
          />
        )}
        {state.view === 'create' && (
          <TutorialCreate
            onRuleset={(ruleset) => store.set({ ...store.get(), ruleset })}
            onCreated={(created) => store.set({ ...store.get(), view: 'created', created })}
          />
        )}
        {state.view === 'created' && state.created && <CreatedGame game={state.created} page={page} />}
      </Fragment>
    </TutorialGuide>
  );
}
