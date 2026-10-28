import { initialLobbyDraft } from '../lobby/lobbyGames';
import { FRIEND_ADDRESS, FRIEND_GAME } from '../lobby/lobbyGames';
import type { LobbyChapterScript } from './chapterScript';
import { element, task } from './guideChecks';

const SEARCH = 'input[placeholder^="Search games"]';
export const findAGame: LobbyChapterScript = {
  slug: 'find-a-game',
  page: 'lobby',
  start: (step, friend) => ({
    view: 'lobby',
    query: step >= 1 ? friend.slice(0, 3) : '',
    shown: 'ongoing',
    draft: initialLobbyDraft(),
    actionOpen: false,
    opened: null,
    tableReady: false,
  }),
  tasks: (state, unlock, friend) => [
    task({
      id: 'find',
      task: "Find your friend's game",
      detail: `The lobby shows who's at each table and how many seats are open. ${friend} is playing here somewhere. Let's find them!\n\nType the first three letters of their name in the search box. You can search for a game name here too.`,
      anchor: { kind: 'page', element: element(SEARCH) },
      begin: () => undefined,
      done: () => {
        const query = state().query.trim().toLowerCase();
        return query.length >= 3 && friend.toLowerCase().startsWith(query) && state().shown === 'ongoing';
      },
      finish: () => document.querySelector<HTMLInputElement>(SEARCH)?.blur(),
    }),
    task({
      id: 'open',
      task: 'Visit their table',
      detail: `Found them! ${friend} is at ${FRIEND_GAME}. Open the game to join them at the table.\n\nYou'll arrive as a spectator. The Take a seat tutorial will show you how to join the players.`,
      anchor: { kind: 'page', element: element(`[data-tutorial-target="game:${FRIEND_ADDRESS}"]`) },
      begin: unlock,
      done: () => state().tableReady,
    }),
  ],
  learned: ['Find a game by a player or game name', 'Open a table to watch or ask for a seat'],
};
