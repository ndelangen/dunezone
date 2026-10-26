import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { closeGameMenu, element, gameMenuButton, pressEnter, task } from './guideChecks';

/*
 * Chapter 3, "Take a seat": the learner opens the link of a game that is already drafting, as a spectator.
 * They ask for a seat, a player at the table approves it, and then they give the place up again from the gear,
 * so the chapter ends where it began: watching.
 */

/* The player who approves the learner's request, after a moment, as someone at a real table would. */
const APPROVER = 'seat-1';
const APPROVE_AFTER_MS = 2500;

/* The game menu's hold-to-leave item, while the menu is open. */
const leaveItem = () =>
  [...document.querySelectorAll('[role="menu"] button')].find((button) =>
    (button.textContent ?? '').startsWith('Hold to give up')
  ) ?? null;

const seatCount = (snapshot: () => GameSnapshot) => snapshot().roster?.seats.length ?? 0;
const requested = (snapshot: () => GameSnapshot) =>
  snapshot().controls?.seatRequests.some((request) => request.own) ?? false;

/* The approver answers the open request; one already answered, or withdrawn, leaves nothing to approve. */
function approveSoon(players: TablePlayers) {
  const timer = setTimeout(() => {
    const request = players.viewOf(APPROVER).controls?.seatRequests[0];
    if (request) {
      players.act(APPROVER, { kind: 'seat-approve', requestId: request.id });
    }
  }, APPROVE_AFTER_MS);
  return { start: 0, timer };
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  return [
    task({
      id: 'watching',
      task: 'You are watching',
      detail:
        'A friend sent you this game’s link, but its six players are already drafting. Opening a link never takes a seat: you watch, and see what every player sees of the table, but you can’t touch anything. Press {Enter} to go on.',
      anchor: { kind: 'page', element: element('section[aria-label="Players"]') },
      ...pressEnter(),
    }),
    task({
      id: 'ask',
      task: 'Ask for a seat',
      detail:
        'Press the + under the players to ask for a place at the table. While the game is drafting, a place is all you ask for: the draft deals the factions later.',
      anchor: { kind: 'page', element: element('[aria-label="Take a seat"]') },
      begin: () => undefined,
      done: () => requested(snapshot),
    }),
    task({
      id: 'approved',
      task: 'Wait for a player to approve you',
      detail:
        'Your request shows under the players as Waiting for approval, and any one of them can approve it. Until then you keep watching, and the × beside it withdraws it.',
      anchor: { kind: 'page', element: element('[aria-label="Your seat request"]') },
      begin: () => ({ ...approveSoon(players), start: seatCount(snapshot) }),
      done: (watch: { start: number; timer: ReturnType<typeof setTimeout> }) => seatCount(snapshot) > watch.start,
      finish: (watch: { start: number; timer: ReturnType<typeof setTimeout> }) => clearTimeout(watch.timer),
    }),
    task({
      id: 'leave',
      task: 'Give up your place',
      detail:
        'Twaffle approved you: you have a place in the draft. Leaving is for good, so it is held rather than clicked. Open the gear, top right, and hold Hold to give up your place until it counts down.',
      anchor: {
        kind: 'page',
        element: () => leaveItem() ?? gameMenuButton(),
      },
      begin: () => ({ start: seatCount(snapshot) }),
      done: (watch: { start: number }) => seatCount(snapshot) < watch.start,
      finish: closeGameMenu,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'A game’s link lets you watch; a seat needs a player’s approval',
  'While a game drafts, the + under the players asks for a place',
  'Any player at the table can approve your request',
  'The gear’s held Give up item leaves the game',
];

export const takeASeat: ChapterScript = { slug: 'take-a-seat', checkpoint: 'drafting', watch: true, tasks, learned };
