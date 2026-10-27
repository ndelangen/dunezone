import type { GuideTask } from '../TutorialGuide';
import type { LobbyChapterScript, LobbyState } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/*
 * Chapter 2, "Find or create a game": the lobby with a room of sample games, then the create page.
 * The learner reads the room, finds a friend's game by name, and creates a game of their own, which ends at its link.
 */

const FRIEND = 'Thialfi';
const SEARCH = 'input[placeholder^="Search games"]';

const searchValue = () => document.querySelector<HTMLInputElement>(SEARCH)?.value ?? '';
/* The create page's ruleset field, by the label the page gives it. */
const rulesetInput = () =>
  [...document.querySelectorAll<HTMLInputElement>('form[aria-label="New game"] input')].find(
    (input) => input.closest('.mantine-Select-root') !== null
  ) ?? null;
const copyButton = () =>
  [...document.querySelectorAll('button')].find((button) => /game link/i.test(button.textContent ?? '')) ?? null;

function tasks(state: () => LobbyState): GuideTask[] {
  return [
    task({
      id: 'room',
      task: 'The lobby',
      detail:
        'Every game you can join or watch is here, as a table: its players around the rim, how far it has come in the middle, and a badge that says whether a seat is open. Press {Enter} to go on.',
      anchor: { kind: 'page', element: element('ul[aria-label="Games"]') },
      ...pressEnter(),
    }),
    task({
      id: 'find',
      task: 'Find a friend’s game',
      detail: `${FRIEND} told you they are playing. Type their name in the search above the games: it finds a game by its name or by its players.`,
      anchor: { kind: 'page', element: element(SEARCH) },
      begin: () => undefined,
      done: () => searchValue().trim().toLowerCase() === FRIEND.toLowerCase(),
      /* The search keeps the focus, where Enter would not reach the next step, so the step lets go of it. */
      finish: () => document.querySelector<HTMLInputElement>(SEARCH)?.blur(),
    }),
    task({
      id: 'found',
      task: 'Open seats',
      detail:
        'Only their games are left. A green Seats open badge means you can ask for a seat once you open it; a full game you can still watch. Press {Enter} to go on.',
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('ul[aria-label="Games"] li')].find((card) =>
            card.textContent?.includes('Seats open')
          ) ?? null,
      },
      ...pressEnter(),
    }),
    task({
      id: 'create',
      task: 'Create a game',
      detail: 'Or set a table of your own: press Create a game, at the top of the lobby.',
      /* The lobby's header carries the button twice, as a word and as an icon for a narrow page; the arrow finds the one showing. */
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('[data-tutorial-target="create"]')].find((button) =>
            button.checkVisibility()
          ) ?? null,
      },
      begin: () => undefined,
      done: () => state().view !== 'lobby',
    }),
    task({
      id: 'ruleset',
      task: 'Choose a ruleset',
      detail:
        'The game already has a name, drawn at random; the dice draw another. Choose Dreamrules as its ruleset: a ruleset decides the board, the decks and the factions the game can draft.',
      anchor: { kind: 'page', element: rulesetInput },
      begin: () => undefined,
      done: () => rulesetInput()?.value === 'Dreamrules',
    }),
    task({
      id: 'set',
      task: 'Create the game',
      detail:
        'The dark stub of the pass is the table: how many seats it has, and the turn the game ends on. Six seats suit a first game. Press Create game.',
      anchor: { kind: 'page', element: element('form[aria-label="New game"] button[type="submit"]') },
      begin: () => undefined,
      done: () => state().view === 'created',
    }),
    task({
      id: 'share',
      task: 'Copy its link',
      detail:
        'You hold the first seat. Press Copy game link and send it to the others: the link lets them watch, and ask you for a seat.',
      anchor: { kind: 'page', element: copyButton },
      begin: () => ({ refused: false }),
      done: (watch: { refused: boolean }) => {
        /* A browser that refuses the clipboard shows the link to copy by hand, which counts as well. */
        watch.refused ||= document.querySelector('[role="alert"]')?.textContent?.startsWith('Could not copy') ?? false;
        return watch.refused || (copyButton()?.textContent ?? '').includes('copied');
      },
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The lobby shows every game as a table, with its players and its stage',
  'Search finds a game by its name or by a player’s',
  'Seats open means you can ask to join',
  'Create a game: a name, a ruleset and the seats, then share its link',
];

export const findOrCreate: LobbyChapterScript = { slug: 'find-or-create', page: 'lobby', tasks, learned };
