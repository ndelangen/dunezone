import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { TABLE_TANKS_LABEL_POSITION } from '@shared/play/tableFurnitureLayout';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { at, nextPhaseButton, onBoard, pressEnter, singleSpiceFaceUp, tableDeck, task } from './guideChecks';

/*
 * "What goes where": turn 1 played up to Shipment, one phase at a time, so each phase shows where on the table it happens.
 * Every step is one press of Next phase, one move at the place that phase uses, or a look at that place: the Spice deck on the
 * right, the Treachery deck on the left, the Tleilaxu Tanks below the board and the reserves at the player's seat (Norbert,
 * 2026-10-26: one thread, and never two presses of Next phase for one step). Moving the camera is chapter 6's, the windows chapter 9's.
 */

/* The phase the table is at, counted from the start of the game, and where a phase falls in the first turn. */
const phaseIndex = (snapshot: () => GameSnapshot) => snapshot().phase ?? 0;
const indexOf = (snapshot: () => GameSnapshot, id: string) =>
  (snapshot().phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === id);

/* One press of Next phase, into the named phase; a press too many still counts, so the chapter never waits on a phase it passed. */
const onTo = (snapshot: () => GameSnapshot, id: string, phase: string, detail: string, where?: GuideTask['anchor']) =>
  task({
    id: `to-${id}`,
    task: `Move on to ${phase}`,
    detail,
    anchor: where ?? { kind: 'page', element: nextPhaseButton },
    begin: () => undefined,
    done: () => phaseIndex(snapshot) >= indexOf(snapshot, id),
  });

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const mine = () => snapshot().bank?.factionId;
  const deck = (side: 'left' | 'right') => tableDeck(snapshot, side);
  /* Troops, not stacks: a troop dropped onto one already there joins its stack, and splitting a stack on the board adds none. */
  const myTroopsOnBoard = () =>
    pieces()
      .filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && onBoard(piece))
      .reduce((total, piece) => total + piece.items.length, 0);
  return [
    onTo(
      snapshot,
      'spice-blow',
      'the Spice Blow',
      'The game is in Storm.\n\nPress Next phase in the top right to advance to Spice Blow.'
    ),
    task({
      id: 'spice',
      task: 'Turn over a Spice card',
      detail:
        'Time for a Spice Blow! Drag the top card off the Spice deck on the right and drop it on the table. Hover over it and press {F} to flip it.\n\nStart dragging straight away to pick up one card rather than the whole deck.',
      anchor: { kind: 'table', point: () => at(deck('right')) },
      begin: () => singleSpiceFaceUp(pieces()),
      done: (start) => singleSpiceFaceUp(pieces()) > start,
    }),
    onTo(
      snapshot,
      'choam-charity',
      'CHOAM Charity',
      'Press Next phase to advance to CHOAM Charity.\n\nIn a real game, players collect any spice they are owed from the Spice Bank.'
    ),
    onTo(
      snapshot,
      'bidding',
      'Bidding',
      'Press Next phase to begin Bidding.\n\nThe camera moves to the part of the table used in each phase.'
    ),
    task({
      id: 'draw',
      task: 'Draw a Treachery card',
      detail:
        'The Treachery deck is on the left.\n\nAfter winning a card in bidding, right-click this deck and choose Draw a card. Try it now.',
      anchor: { kind: 'table', point: () => at(deck('left')) },
      /* The card must leave the Treachery deck, so a Spice card drawn instead does not count. */
      begin: () => ({ hand: snapshot().hand?.length ?? 0, deck: deck('left')?.items.length ?? 0 }),
      done: (start) => (snapshot().hand?.length ?? 0) > start.hand && (deck('left')?.items.length ?? 0) < start.deck,
    }),
    onTo(snapshot, 'revival', 'Revival', 'Press Next phase to begin Revival.'),
    task({
      id: 'tanks',
      task: 'Find the Tleilaxu Tanks',
      detail:
        "The Tleilaxu Tanks are below the board. Defeated troops and leaders go there, ready to be brought back during Revival.\n\nThey're empty for now. Press {Enter} to carry on.",
      /* Just left of the label, so the arrow coming from the rail ends at its first letter rather than over it. */
      anchor: {
        kind: 'table',
        point: () => {
          const [x, y, z] = TABLE_TANKS_LABEL_POSITION;
          return [x - 1.9, y, z];
        },
      },
      ...pressEnter(),
    }),
    onTo(
      snapshot,
      'shipment-and-movement',
      'Shipment and Movement',
      'Press Next phase to begin Shipment and Movement.'
    ),
    task({
      id: 'ship',
      task: 'Ship troops onto the board',
      detail: 'Drag a troop from your reserves beside your seat onto any territory.',
      anchor: {
        kind: 'table',
        point: () => at(pieces().find((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && !onBoard(piece))),
      },
      begin: myTroopsOnBoard,
      done: (start) => myTroopsOnBoard() > start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'One press of Next phase moves the game one phase on, and the camera with it',
  'Spice Blow: swipe a card off the Spice deck and turn it over with {F}',
  'Bidding: right-click the Treachery deck to draw a card',
  'Revival: the Tleilaxu Tanks lie below the board',
  'Shipment: drag troops from your reserves onto a territory',
];

export const whatGoesWhere: ChapterScript = { slug: 'what-goes-where', checkpoint: 'turn-1-storm', tasks, learned };
