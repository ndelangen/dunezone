import { playGameNameSchema } from '@shared/play/gameNames';

import { initialLobbyDraft } from '../lobby/lobbyGames';
import { TUTORIAL_RULESET } from '../lobby/lobbyGames';
import type { LobbyChapterScript } from './chapterScript';
import { element, task } from './guideChecks';

const CREATE = 'form[aria-label="New game"] button[type="submit"]';
const field = (selector: string) => () => document.querySelector(selector)?.closest('.mantine-Stack-root') ?? null;

export const createAGame: LobbyChapterScript = {
  slug: 'create-a-game',
  page: 'lobby',
  start: (step) => ({
    view: 'create',
    query: '',
    shown: 'ongoing',
    actionOpen: false,
    opened: null,
    tableReady: false,
    draft: {
      ...initialLobbyDraft(),
      generatedName: 'Arrakeen picnic',
      rulesetId: step >= 1 ? TUTORIAL_RULESET.id : '',
      minimumPlayers: step >= 2 ? 4 : 6,
      lastTurn: step >= 3 ? 8 : 10,
      custom: step >= 4,
      customName: step >= 4 ? 'Arrakis with friends' : '',
    },
  }),
  tasks: (state, unlock) => [
    task({
      id: 'ruleset',
      task: 'Choose a ruleset',
      detail:
        "Let's set up a game of your own! The ruleset supplies the board, decks and factions you can play.\n\nChoose Dreamrules for this practice game.",
      anchor: { kind: 'page', element: element('form[aria-label="New game"] .mantine-Select-root') },
      begin: () => undefined,
      done: () => state().draft.rulesetId === TUTORIAL_RULESET.id,
    }),
    task({
      id: 'seats',
      task: 'Make room for friends',
      detail:
        'How many friends are coming? This is the minimum number of players you need before dealing factions. More can join, and anyone can watch.\n\nSet the minimum to four for this practice game.',
      anchor: { kind: 'page', element: field('[role="slider"][aria-label="Minimum players"]') },
      begin: () => undefined,
      done: () => state().draft.minimumPlayers === 4,
    }),
    task({
      id: 'turns',
      task: 'Choose the last turn',
      detail:
        'How long should the game run? The turn tracker counts up to the last turn, and you can change it later.\n\nSet it to 8 for this game.',
      anchor: { kind: 'page', element: field('[role="slider"][aria-label="Last turn"]') },
      begin: () => undefined,
      done: () => state().draft.lastTurn === 8,
    }),
    task({
      id: 'name',
      task: 'Give your game a name',
      detail:
        "Make the game your own! Turn on Set a custom name and give it a name you like.\n\nPress {Enter} when you're happy with it.",
      anchor: { kind: 'page', element: element('form[aria-label="New game"] [role="switch"]') },
      begin: () => {
        const watch = { confirmed: false, release: () => undefined as void };
        const confirm = (event: KeyboardEvent) => {
          if (
            event.key !== 'Enter' ||
            !state().draft.custom ||
            !playGameNameSchema.safeParse(state().draft.customName).success
          ) {
            return;
          }
          event.preventDefault();
          document.querySelector<HTMLInputElement>('input[placeholder="Name your game"]')?.blur();
          watch.confirmed = true;
        };
        document.addEventListener('keydown', confirm, true);
        watch.release = () => document.removeEventListener('keydown', confirm, true);
        return watch;
      },
      done: (watch: { confirmed: boolean; release: () => void }) => watch.confirmed,
      finish: (watch: { release: () => void }) => watch.release(),
    }),
    task({
      id: 'create',
      task: 'Open your table',
      detail: "Everything's ready! Press Create game and you'll take the first seat, ready for your friends to join.",
      anchor: { kind: 'page', element: element(CREATE) },
      begin: () => {
        unlock();
        document.querySelector(CREATE)?.scrollIntoView({ block: 'center' });
      },
      done: () => state().tableReady,
    }),
  ],
  learned: [
    'Choose the ruleset, seats and last turn',
    'Give your game a custom name',
    'Create a game and take its first seat',
  ],
};
