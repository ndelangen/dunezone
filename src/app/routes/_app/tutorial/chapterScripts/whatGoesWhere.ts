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
      'Turn 1 starts in the Storm, as the chip top left says. Every phase happens somewhere on the table; you move from one to the next yourself. Press Next phase, top right, once.'
    ),
    task({
      id: 'spice',
      task: 'Turn over the top Spice card',
      detail:
        'The Spice Blow happens at the Spice deck, on the right of the table. To draw one card, press down on the deck and swipe away at once: the top card comes with you. Wait a moment before you move and the whole deck comes instead. Drop the card on the table, then point at it and press {F} on your keyboard to turn it over.',
      anchor: { kind: 'table', point: () => at(deck('right')) },
      begin: () => singleSpiceFaceUp(pieces()),
      done: (start) => singleSpiceFaceUp(pieces()) > start,
    }),
    onTo(
      snapshot,
      'choam-charity',
      'CHOAM Charity',
      'Press Next phase once more. CHOAM Charity is paid out of the spice bank by hand; your hand and spice chapter shows how. Nobody needs it now.'
    ),
    onTo(
      snapshot,
      'bidding',
      'Bidding',
      'Press Next phase again. Watch the camera: each phase turns it to the part of the table that phase uses.'
    ),
    task({
      id: 'draw',
      task: 'Draw a Treachery card',
      detail:
        'Bidding sells cards from the Treachery deck, on the left of the table; the Bidding chapter covers the auction. Say you won a card: right-click the deck and choose Draw a card. It goes to your hand.',
      anchor: { kind: 'table', point: () => at(deck('left')) },
      /* The card must leave the Treachery deck, so a Spice card drawn instead does not count. */
      begin: () => ({ hand: snapshot().hand?.length ?? 0, deck: deck('left')?.items.length ?? 0 }),
      done: (start) => (snapshot().hand?.length ?? 0) > start.hand && (deck('left')?.items.length ?? 0) < start.deck,
    }),
    onTo(snapshot, 'revival', 'Revival', 'Press Next phase, into Revival. Watch where the camera goes.'),
    task({
      id: 'tanks',
      task: 'Find the Tleilaxu Tanks',
      detail:
        'Revival brings troops and leaders back from the Tleilaxu Tanks, the tray below the board where the arrow points. Nothing has died yet, so there is nothing to revive. Press {Enter} to go on.',
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
      'Press Next phase once more, into Shipment and Movement.'
    ),
    task({
      id: 'ship',
      task: 'Ship troops onto the board',
      detail:
        'Your reserves wait on the rim at your seat, where the arrow points. Drag a troop from the stack onto any territory.',
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
