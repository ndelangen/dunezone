import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, openedWindow, task, windowShown } from './guideChecks';

/*
 * Chapter 17, "Bring your own pieces": the Shared table inventory, where the pieces live that belong to no seat,
 * and its catalogue of decks, bundles and tokens people made in the editor.
 * A piece from the inventory lands on the table for anyone to use. Adding from the catalogue asks the game's server for the
 * piece, which a tutorial table does not have, so the chapter searches the catalogue and leaves adding to a real game.
 */

const SEARCH = '[data-window="shared"] input[placeholder^="A deck, bundle or token"]';

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const shared = () =>
    snapshot()
      .table.pieces.filter((piece) => piece.inventory === 'shared')
      .reduce((total, piece) => total + piece.items.length, 0);
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
      anchor: { kind: 'page', element: element('[data-window="shared"] [aria-label^="Drag Supplies"]') },
      begin: shared,
      done: (start) => shared() < start,
    }),
    task({
      id: 'catalogue',
      task: 'Search the catalogue',
      detail:
        'Decks, bundles and tokens that people made in the editor can join any game. Press Add from catalogue and search for Karama. In a game, picking one adds it here for everyone; a tutorial table has nobody to ask for it, so look only.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(SEARCH) ??
          [...document.querySelectorAll('[data-window="shared"] button')].find(
            (button) => button.textContent === 'Add from catalogue'
          ) ??
          null,
      },
      begin: () => undefined,
      done: () => /karama/i.test(document.querySelector<HTMLInputElement>(SEARCH)?.value ?? ''),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The Shared table inventory holds the pieces no seat owns',
  'Drag a piece out of it, and it lands face down on the table',
  'Add from catalogue brings in decks, bundles and tokens made in the editor',
];

export const bringYourOwnPieces: ChapterScript = {
  slug: 'bring-your-own-pieces',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
