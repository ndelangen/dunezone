import { capturedTokenStackKey } from '@shared/play/assetCapture';
import { spawnableKey } from '@shared/play/inventory';
import type { SpawnSelection } from '@shared/play/inventory';
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
const SEARCH = `${SHARED} input[name="catalogue-search"]`;
/* How long the request waits before another player approves it, so the learner sees it waiting first. */
const APPROVAL_DELAY_MS = 1800;

const sharedButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`${SHARED} button`)].find(
    (button) => button.textContent?.trim() === label
  ) ?? null;
/* The token the chapter asks for, by type and slug: an owner, bundle or deck that merely has Karama in its name is not it. */
const KARAMA: SpawnSelection = { type: 'token-disc', slug: 'karama' };
const karamaOption = () =>
  document.querySelector(`${SHARED} [role="option"][data-spawn-asset="${spawnableKey(KARAMA)}"]`);
/* The row the picker holds as picked; another asset picked instead keeps the chapter waiting for Karama. */
const karamaPicked = () => karamaOption()?.hasAttribute('data-combobox-active') ?? false;
/* The request button opens once the table has checked the picked asset. */
const karamaReady = () => {
  const request = sharedButton('Request');
  return karamaPicked() && request !== null && !request.disabled;
};
/* Where to look next for Karama: its row once the picker lists it, else the search, else the button that opens the catalogue. */
const findKarama = () =>
  karamaOption() ??
  document.querySelector(SEARCH) ??
  document.querySelector(`${SHARED} [aria-label="Add disc tokens from the catalogue"]`);
/* New lines join the bottom of the window's list, below what it shows, so the step scrolls its line into view. */
const showInWindow = (selector: string) => document.querySelector(selector)?.scrollIntoView({ block: 'nearest' });

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const shared = () =>
    snapshot()
      .table.pieces.filter((piece) => piece.inventory === 'shared')
      .reduce((total, piece) => total + piece.items.length, 0);
  /* Karama's request and pieces are known by the asset its selection captured, which they carry through approval and placement. */
  const karamaRequested = () => {
    const assetId = players.captured(KARAMA);
    return (snapshot().controls?.requests ?? []).some(
      ({ contents }) => contents.type === KARAMA.type && contents.assetId === assetId
    );
  };
  const karama = () => {
    const assetId = players.captured(KARAMA);
    return assetId ? snapshot().table.pieces.filter((piece) => piece.stackKey === capturedTokenStackKey(assetId)) : [];
  };
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
        'Each shelf holds one kind of piece. Drag Supplies! cache out of the window onto the table: it lands face down, for anyone to use.',
      anchor: { kind: 'page', element: element(`${SHARED} [aria-label^="Drag Supplies"]`) },
      begin: shared,
      done: (start) => shared() < start,
    }),
    task({
      id: 'find',
      task: 'Find Karama in the catalogue',
      detail:
        'Decks, bundles and tokens that people made in the editor can join any game. Press the + on the Disc tokens shelf, search for Karama and pick it. The table checks it, then says how many pieces it adds.',
      anchor: { kind: 'page', element: findKarama },
      begin: () => undefined,
      done: karamaReady,
    }),
    task({
      id: 'request',
      task: 'Ask the table for it',
      detail:
        'Everyone shares this table, so a new piece needs a yes from one other player. With Karama picked, press Request: your request waits under the inventory until someone answers it.',
      anchor: { kind: 'page', element: () => (karamaPicked() ? sharedButton('Request') : findKarama()) },
      begin: () => undefined,
      done: () => karamaRequested() || karama().length > 0,
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
  "Each shelf's + brings in that kind of piece from the catalogue",
  'A new piece needs one other player to approve it',
];

export const bringYourOwnPieces: ChapterScript = {
  slug: 'bring-your-own-pieces',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
