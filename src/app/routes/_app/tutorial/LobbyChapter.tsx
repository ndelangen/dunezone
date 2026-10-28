import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { createGameDraftReducer } from '@app/widgets/create-game/CreateGamePass';

import { TableWait } from '../play/TableWait';
import type { TutorialChapter } from './chapters';
import type { LobbyChapterScript, LobbyState } from './chapterScripts/chapterScript';
import { FRIEND_ADDRESS, sampleLobby } from './lobby/lobbyGames';
import { TutorialCreate, TutorialLobby } from './lobby/tutorialLobbyPages';
import { seatTutorialPlayers, useTutorialPlayers } from './players';
import type { TutorialViewer } from './players';
import setup from './setup/setup.json';
import type { TutorialSetup } from './setup/tutorialSetup';
import { TutorialGuide } from './TutorialGuide';

const LobbyTable = lazy(() => import('./lobby/LobbyTable'));

function lobbyStore(start: LobbyState) {
  let state = start;
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

export default function LobbyChapter({
  chapter,
  script,
  firstTask = 0,
  chaptersLink,
  nextLink,
  exit,
  viewer,
}: Readonly<{
  chapter: TutorialChapter;
  script: LobbyChapterScript;
  firstTask?: number;
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
  exit: ReactNode;
  viewer: TutorialViewer;
}>) {
  const people = useTutorialPlayers(viewer);
  const [chapterState] = useState(() => {
    const seated = seatTutorialPlayers(setup as unknown as TutorialSetup, people, {
      watch: script.slug === 'find-a-game',
    });
    const friend = seated.checkpoints.drafting.players[1]!.name;
    const store = lobbyStore(script.start(firstTask, friend));
    return {
      seated,
      friend,
      store,
      games: sampleLobby(seated),
      tasks: script.tasks(store.get, () => store.set({ ...store.get(), actionOpen: true }), friend),
      ready: () => {
        if (store.get().view === 'table') {
          store.set({ ...store.get(), tableReady: true });
        }
      },
    };
  });
  const { seated, friend, store, games, tasks, ready } = chapterState;
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <TutorialGuide
      number={chapter.number}
      title={chapter.title}
      tasks={tasks}
      firstTask={firstTask}
      learned={script.learned}
      onReset={() => store.set(script.start(0, friend))}
      chaptersLink={chaptersLink}
      nextLink={nextLink}
    >
      <>
        {state.view === 'lobby' && (
          <TutorialLobby
            games={games}
            openGame={state.actionOpen ? FRIEND_ADDRESS : null}
            filter={{
              query: state.query,
              setQuery: (query) => store.set({ ...store.get(), query }),
              view: state.shown,
              setView: (shown) => store.set({ ...store.get(), shown }),
            }}
            onOpen={(address) => {
              if (store.get().actionOpen && address === FRIEND_ADDRESS) {
                store.set({ ...store.get(), view: 'table', opened: { kind: 'found', address } });
              }
            }}
          />
        )}
        {state.view === 'create' && (
          <TutorialCreate
            draft={state.draft}
            open={state.actionOpen}
            dispatch={(event) => store.set({ ...store.get(), draft: createGameDraftReducer(store.get().draft, event) })}
            onCreate={(request) => {
              if (store.get().actionOpen) {
                store.set({ ...store.get(), view: 'table', opened: { kind: 'created', request } });
              }
            }}
          />
        )}
        {state.view === 'table' && state.opened && (
          <Suspense fallback={<TableWait status="Setting the table...">{exit}</TableWait>}>
            <LobbyTable
              setup={seated}
              opened={state.opened}
              page={`/tutorial/${chapter.slug}`}
              exit={exit}
              onReady={ready}
            />
          </Suspense>
        )}
      </>
    </TutorialGuide>
  );
}
