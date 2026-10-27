import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, openedWindow, task, windowShown } from './guideChecks';

/*
 * Chapter 17, "Bring your own pieces": the Shared table inventory, where the pieces live that belong to no seat,
 * and its catalogue of decks, bundles and tokens people made in the editor (Norbert, 2026-10-27: really spawn one, and get it approved).
 * The learner asks the table for Karama, another player approves the request, and the token lands in the Shared table inventory,
 * captured from the catalogue as a real game captures it.
 */

const SHARED = '[data-window="shared"]';
const SEARCH = `${SHARED} input[placeholder^="A deck, bundle or token"]`;
/* How long the request waits before another player approves it, so the learner sees it waiting first. */
const APPROVAL_DELAY_MS = 1800;

const sharedButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`${SHARED} button`)].find(
    (button) => button.textContent?.trim() === label
  ) ?? null;
const karamaOption = () =>
  [...document.querySelectorAll(`${SHARED} [role="option"]`)].find((option) =>
    /karama/i.test(option.textContent ?? '')
  ) ?? null;
/* The request button opens once the table has checked the picked asset. */
const requestReady = () => {
  const request = sharedButton('Request');
  return request !== null && !request.disabled;
};
const isKarama = (label: string) => /karama/i.test(label);
/* New lines join the bottom of the window's list, below what it shows, so the step scrolls its line into view. */
const showInWindow = (selector: string) => document.querySelector(selector)?.scrollIntoView({ block: 'nearest' });

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const shared = () =>
    snapshot()
      .table.pieces.filter((piece) => piece.inventory === 'shared')
      .reduce((total, piece) => total + piece.items.length, 0);
  const requests = () => snapshot().controls?.requests ?? [];
  const karama = () => snapshot().table.pieces.filter((piece) => isKarama(piece.label));
  return [
    task({
      id: 'open',
      task: 'Open the Shared table inventory',
      detail:
        'Pieces that belong to no seat wait in the Shared table inventory. Open it by typing: press {Space}, type Shared and press {Enter}.',
      anchor: { kind: 'page', element: element('[aria-label="Search controls"], [data-compass-launcher]') },
      ...openedWindow(windowShown('shared')),
    }),
    task({
      id: 'take',
      task: 'Put a piece on the table',
      detail:
        'Each line is a piece and how many there are. Drag Supplies! cache out of the window onto the table: it lands face down, for anyone to use.',
      anchor: { kind: 'page', element: element(`${SHARED} [aria-label^="Drag Supplies"]`) },
      begin: shared,
      done: (start) => shared() < start,
    }),
    task({
      id: 'find',
      task: 'Find Karama in the catalogue',
      detail:
        'Decks, bundles and tokens that people made in the editor can join any game. Press Add from catalogue, search for Karama and pick it. The table checks it, then says how many pieces it adds.',
      anchor: {
        kind: 'page',
        element: () =>
          (/karama/i.test(document.querySelector<HTMLInputElement>(SEARCH)?.value ?? '') ? karamaOption() : null) ??
          document.querySelector(SEARCH) ??
          sharedButton('Add from catalogue'),
      },
      begin: () => undefined,
      done: requestReady,
    }),
    task({
      id: 'request',
      task: 'Ask the table for it',
      detail:
        'Everyone shares this table, so a new piece needs a yes from one other player. Press Request: your request waits under the inventory until someone answers it.',
      anchor: { kind: 'page', element: () => sharedButton('Request') },
      begin: () => undefined,
      done: () => requests().length > 0 || karama().length > 0,
    }),
    task({
      id: 'approved',
      task: 'Wait for a yes',
      detail:
        'Any other player can Approve your request, and anyone can Dismiss it. You cannot approve your own. Watch: another player approves it, and Karama joins the inventory.',
      anchor: { kind: 'page', element: element(`${SHARED} [data-spawn-request]`) },
      begin: () => {
        showInWindow(`${SHARED} [data-spawn-request]`);
        return approveSoon(snapshot, players);
      },
      done: () => karama().length > 0,
      finish: (stop) => stop(),
    }),
    task({
      id: 'place',
      task: 'Put Karama on the table',
      detail: 'It is a piece like any other now. Drag Karama out of the Shared table inventory onto the table.',
      anchor: { kind: 'page', element: element(`${SHARED} [aria-label^="Drag Karama"]`) },
      begin: () => showInWindow(`${SHARED} [aria-label^="Drag Karama"]`),
      done: () => karama().some((piece) => !piece.inventory),
    }),
  ];
}

/* Another player approves each open request after a moment, as a player at a real table would. */
function approveSoon(snapshot: () => GameSnapshot, players: TablePlayers) {
  const approve = () => {
    const [approver] = players.others();
    for (const request of snapshot().controls?.requests ?? []) {
      if (approver && request.requesterSeat !== approver) {
        players.act(approver, { kind: 'spawn-approve', requestId: request.id });
      }
    }
  };
  const timer = setInterval(approve, APPROVAL_DELAY_MS);
  return () => clearInterval(timer);
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The Shared table inventory holds the pieces no seat owns',
  'Drag a piece out of it, and it lands face down on the table',
  'Add from catalogue brings in decks, bundles and tokens made in the editor',
  'A new piece needs one other player to approve it',
];

export const bringYourOwnPieces: ChapterScript = {
  slug: 'bring-your-own-pieces',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
