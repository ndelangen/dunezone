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

const SEARCH = '[data-window="shared"] input[name="catalogue-search"]';

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
        'Every kind of piece has its own shelf, and the number on a piece says how many there are. Drag Supplies! cache out of the window onto the table: it lands face down, for anyone to use.',
      anchor: { kind: 'page', element: element('[data-window="shared"] [aria-label^="Drag Supplies"]') },
      begin: shared,
      done: (start) => shared() < start,
    }),
    task({
      id: 'catalogue',
      task: 'Search the catalogue',
      detail:
        'Decks, bundles and tokens that people made in the editor can join any game. Every shelf has its own + for its kind of piece: press the one on Tech tokens and search for Customs. In a game, picking one adds it here for everyone; a tutorial table has nobody to ask for it, so look only.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(SEARCH) ??
          document.querySelector('[data-window="shared"] [aria-label="Add tech tokens from the catalogue"]'),
      },
      begin: () => undefined,
      done: () => /customs/i.test(document.querySelector<HTMLInputElement>(SEARCH)?.value ?? ''),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The Shared table inventory holds the pieces no seat owns',
  'Drag a piece out of it, and it lands face down on the table',
  "Each shelf's + brings in its kind of piece from the catalogue of things made in the editor",
];

export const bringYourOwnPieces: ChapterScript = {
  slug: 'bring-your-own-pieces',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
