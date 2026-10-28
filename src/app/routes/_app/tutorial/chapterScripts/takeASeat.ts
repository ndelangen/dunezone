import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { closeGameMenu, element, gameMenuButton, pressEnter, task } from './guideChecks';

/*
 * "Take a seat": the learner opens the link of a game that is already drafting, as a spectator.
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

/*
 * The approver answers each request a moment after it is made, as someone at a real table would:
 * a request withdrawn and made again is answered too, since the guide stays on the waiting task.
 */
function approveEachRequest(players: TablePlayers) {
  let answering: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;
  const watch = setInterval(() => {
    const request = players.viewOf(APPROVER).controls?.seatRequests[0];
    if (!request || answering?.id === request.id) {
      return;
    }
    if (answering) {
      clearTimeout(answering.timer);
    }
    answering = {
      id: request.id,
      timer: setTimeout(() => players.act(APPROVER, { kind: 'seat-approve', requestId: request.id }), APPROVE_AFTER_MS),
    };
  }, 250);
  return () => {
    clearInterval(watch);
    if (answering) {
      clearTimeout(answering.timer);
    }
  };
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  return [
    task({
      id: 'watching',
      task: 'You are watching',
      detail:
        "You've joined as a spectator. You can see the public table, but you need a seat to play.\n\nPress {Enter} to continue.",
      anchor: { kind: 'page', element: element('section[aria-label="Players"]') },
      ...pressEnter(),
    }),
    task({
      id: 'ask',
      task: 'Ask for a seat',
      detail: 'Press the + below the players to request a seat. Factions will be assigned after the draft.',
      anchor: { kind: 'page', element: element('[aria-label="Take a seat"]') },
      begin: () => undefined,
      done: () => requested(snapshot),
    }),
    task({
      id: 'approved',
      task: 'Wait for approval',
      detail:
        'Any seated player can approve your request. You can keep watching while you wait, or press the cross to cancel.',
      anchor: { kind: 'page', element: element('[aria-label="Your seat request"]') },
      begin: () => ({ stop: approveEachRequest(players), start: seatCount(snapshot) }),
      done: (watch: { start: number; stop: () => void }) => seatCount(snapshot) > watch.start,
      finish: (watch: { start: number; stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'leave',
      task: 'Give up your place',
      detail:
        'Twaffle approved your request.\n\nTo leave again, open the gear menu in the top right. Press and hold Give up your place until the countdown finishes.',
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
