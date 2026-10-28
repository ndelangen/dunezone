import { normalizePlayGameSlug } from '@shared/play/gameNamePolicy';
import { generatePlayGameName } from '@shared/play/generatedGameNames';

import type { GuideTask } from '../TutorialGuide';
import type { LobbyChapterScript, LobbyState } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/*
 * "Find or create a game": the lobby with a room of sample games, then the create page.
 * The learner reads the room, finds a friend's game by name, and creates a game of their own, which ends at its link.
 */

const FRIEND = 'Thialfi';
const SEARCH = 'input[placeholder^="Search games"]';
const CREATE = 'form[aria-label="New game"] button[type="submit"]';

/*
 * The create page's ruleset field, its label included: the arrow keeps its gap from the whole field,
 * so its head lands beside it rather than over the label, however high the pass's name sets the form.
 */
const rulesetField = () =>
  [...document.querySelectorAll<HTMLInputElement>('form[aria-label="New game"] input')]
    .map((input) => input.closest('.mantine-Select-root'))
    .find((field) => field !== null) ?? null;
const copyButton = () =>
  [...document.querySelectorAll('button')].find((button) => /game link/i.test(button.textContent ?? '')) ?? null;

function tasks(state: () => LobbyState, openCreate: () => void): GuideTask[] {
  return [
    task({
      id: 'room',
      task: 'The lobby',
      detail:
        'The lobby shows games you can join or watch. Each table shows its players, progress and available seats.\n\nPress {Enter} to continue.',
      anchor: { kind: 'page', element: element('ul[aria-label="Games"]') },
      ...pressEnter(),
    }),
    task({
      id: 'find',
      task: 'Find a friend’s game',
      detail: `${FRIEND} is playing here. Type their name in the search box.\n\nYou can search by game name or player name.`,
      anchor: { kind: 'page', element: element(SEARCH) },
      begin: () => undefined,
      done: () => state().query.trim().toLowerCase() === FRIEND.toLowerCase(),
      /* The search keeps the focus, where Enter would not reach the next step, so the step lets go of it. */
      finish: () => document.querySelector<HTMLInputElement>(SEARCH)?.blur(),
    }),
    task({
      id: 'found',
      task: 'Open seats',
      detail:
        'These are the games your friend is in. Look for Seats open to ask to join. You can still watch a full game.\n\nPress {Enter} to continue.',
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
      detail: 'To host your own game, press Create a game at the top of the lobby.',
      /* The lobby's header carries the button twice, as a word and as an icon for a narrow page; the arrow finds the one showing. */
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('[data-tutorial-target="create"]')].find((button) =>
            button.checkVisibility()
          ) ?? null,
      },
      begin: openCreate,
      done: () => state().view !== 'lobby',
    }),
    task({
      id: 'ruleset',
      task: 'Choose a ruleset',
      detail: `Choose ${RULESET}. The ruleset supplies the board, decks and available factions.\n\nYou can also change the suggested game name or roll the dice for another.`,
      anchor: { kind: 'page', element: rulesetField },
      begin: () => undefined,
      /* The pass holding Dreamrules, not the field reading it: typed and left unpicked, the field holds no ruleset. */
      done: () => state().ruleset === RULESET,
    }),
    task({
      id: 'set',
      task: 'Create the game',
      detail:
        'The panel on the right lets you set the number of seats and the final turn.\n\nLeave these as they are and press Create game.',
      anchor: { kind: 'page', element: element(CREATE) },
      /* The button sits at the foot of the stub, below a short window; brought to the middle, the arrow reaches it past the stub's foot, clear of the fields above. */
      begin: () => document.querySelector(CREATE)?.scrollIntoView({ block: 'center' }),
      done: () => state().view === 'created',
    }),
    task({
      id: 'share',
      task: 'Share the game link',
      detail:
        'You have the first seat. Press Copy game link to get a link you can share.\n\nYour friends can use it to watch or ask for a seat.',
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

/* The tasks, by id, in order; `start` reads where each one is played. */
const TASK = { found: 2, create: 3, ruleset: 4, set: 5, share: 6 } as const;
const RULESET = 'Dreamrules';

/*
 * A chapter opened at a later task begins on its page with what the tasks before it would have left:
 * from Open seats with the friend's name in the search, from Choose a ruleset on the create page, from Create the game with the ruleset chosen, and from Copy its link with a game created.
 */
function start(firstTask: number): LobbyState {
  const lobby: LobbyState = {
    view: 'lobby',
    query: firstTask >= TASK.found ? FRIEND : '',
    shown: 'ongoing',
    createOpen: false,
    ruleset: null,
    created: null,
  };
  if (firstTask < TASK.ruleset) {
    return lobby;
  }
  const create: LobbyState = {
    ...lobby,
    view: 'create',
    createOpen: true,
    ruleset: firstTask >= TASK.set ? RULESET : null,
  };
  if (firstTask < TASK.share) {
    return create;
  }
  const name = generatePlayGameName();
  return { ...create, view: 'created', created: { name, address: normalizePlayGameSlug(name) } };
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The lobby shows every game as a table, with its players and its stage',
  'Search finds a game by its name or by a player’s',
  'Seats open means you can ask to join',
  'Create a game: a name, a ruleset and the seats, then share its link',
];

export const findOrCreate: LobbyChapterScript = { slug: 'find-or-create', page: 'lobby', tasks, start, learned };
