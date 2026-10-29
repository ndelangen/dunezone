import { movementOrder } from '@shared/play/movement';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { isSpicePiece } from '@shared/play/spice';
import { spiceBankSlot } from '@shared/play/spiceBank';
import { stormOrder } from '@shared/play/stormSector';
import { TABLE_TANKS_LABEL_POSITION } from '@shared/play/tableFurnitureLayout';
import { TANKS_PLAY_AREA } from '@shared/play/tablePhysics';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, element, nextPhaseButton, onBoard, pressEnter, tableDeck, task } from './guideChecks';
import type { Piece } from './guideChecks';
import type * as BoardChecks from './whatGoesWhereBoard';
import type { SpiceBlow } from './whatGoesWhereBoard';

/*
 * "What goes where": turn 1 played through Shipment and Movement, one phase at a time, so each phase shows where on the table it happens.
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

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  /* Geometry and the recorded catalogue stay out of the chapter list's initial bundle. */
  let board: typeof BoardChecks | undefined;
  void import('./whatGoesWhereBoard').then((loaded) => {
    board = loaded;
  });
  let blow: SpiceBlow | undefined;
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const mine = () => snapshot().bank?.factionId;
  const deck = (side: 'left' | 'right') => tableDeck(snapshot, side);
  const myTroops = () => pieces().filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`));
  const factionName = () => snapshot().roster?.seats.find((seat) => seat.faction?.id === mine())?.faction?.name;
  const movementToken = () => {
    const name = factionName();
    return (
      [...document.querySelectorAll('[aria-label="Shipment and Movement turns"] button')].find(
        (button) => button.getAttribute('aria-label') === name
      ) ?? null
    );
  };
  const harkonnen = () =>
    snapshot().roster?.seats.find((seat) => seat.faction?.name === 'House Harkonnen')?.faction?.id;
  const harkonnenTroops = () => pieces().filter((piece) => piece.stackKey?.startsWith(`troops:${harkonnen()}:`));
  const inTanks = (piece: Piece) =>
    piece.position[0] >= TANKS_PLAY_AREA.minX &&
    piece.position[0] <= TANKS_PLAY_AREA.maxX &&
    piece.position[2] >= TANKS_PLAY_AREA.minZ &&
    piece.position[2] <= TANKS_PLAY_AREA.maxZ;
  const actsSince = (start: number) => players.acceptedActions().slice(start);
  return [
    task({
      id: 'storm',
      task: 'Place the storm',
      detail:
        'The game is in Storm. Press {Space}, type Phase and confirm with {Enter}. In the Phase window, press Place storm randomly before moving on.',
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Place storm randomly'
          ) ?? document.querySelector('[data-compass-launcher]'),
      },
      begin: () => players.acceptedActions().length,
      done: (start) => actsSince(start).some(({ action }) => action.kind === 'storm-random'),
    }),
    onTo(snapshot, 'spice-blow', 'the Spice Blow', 'Press Next phase in the top right to advance to Spice Blow.'),
    task({
      id: 'spice',
      task: 'Turn over a Spice card',
      detail:
        'Time for a Spice Blow! Drag the top card off the Spice deck on the right and drop it on the table. Hover over it and press {F} to flip it.\n\nStart dragging straight away to pick up one card rather than the whole deck. If you reveal Shai-Hulud, draw another card until one shows a spice amount.',
      anchor: { kind: 'table', point: () => at(deck('right')) },
      begin: () =>
        new Set(
          pieces()
            .filter((piece) => piece.items[0]?.faceUp)
            .map((piece) => piece.items[0]!.id)
        ),
      done: (seen) => {
        for (const piece of pieces()) {
          const revealed = !seen.has(piece.items[0]?.id ?? '') && board?.spiceBlow(piece);
          if (revealed) {
            blow = revealed;
            return true;
          }
        }
        return false;
      },
    }),
    task({
      id: 'place-spice',
      task: 'Place the Spice Blow',
      get detail() {
        return `The card shows ${blow?.amount ?? 'its amount of'} spice in ${blow?.name ?? 'its named territory'}. Click M on the camera dial to see the Spice Bank. Hover over the bank and press a number key to spawn that much spice, then drag it onto that territory. {0} means ten; for more than ten, spawn another batch.\n\nThe spice must reach the board before you move on.`;
      },
      anchor: { kind: 'table', point: () => at(pieces().find(isSpicePiece)) ?? spiceBankSlot().position },
      begin: () => ({
        actions: players.acceptedActions().length,
        existing: new Set(
          pieces()
            .filter(isSpicePiece)
            .flatMap((piece) => piece.items.map((item) => item.id))
        ),
      }),
      done: (start) => {
        if (!blow || !board) {
          return false;
        }
        const spawned = actsSince(start.actions).reduce(
          (amount, { action }) => amount + (action.kind === 'spice-spawn' ? action.count : 0),
          0
        );
        const placed = pieces()
          .filter((piece) => isSpicePiece(piece) && board!.territory(snapshot(), piece) === blow!.territory)
          .flatMap((piece) => piece.items)
          .filter((item) => !start.existing.has(item.id)).length;
        return spawned >= blow.amount && placed === blow.amount;
      },
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
        "The Tleilaxu Tanks are below the board. Defeated troops and leaders go there, ready to be brought back during Revival.\n\nThey're empty for now; I'm sure this will soon change. Press {Enter} to carry on.",
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
    task({
      id: 'fill-tanks',
      task: 'Move all Harkonnen troops to the Tanks',
      detail:
        'Move every Harkonnen troop to the Tleilaxu Tanks, including the troops in Carthag and those in their reserves. Click M on the camera dial to see both stacks. Hold a stack to pick it all up, then drag it to the near end of the shelf below the board. Click B to inspect the Tanks.',
      anchor: { kind: 'table', point: () => at(harkonnenTroops().find((piece) => !inTanks(piece))) },
      begin: () => harkonnenTroops().flatMap((piece) => piece.items.map((item) => item.id)),
      done: (ids) => {
        const there = new Set(
          harkonnenTroops()
            .filter(inTanks)
            .flatMap((piece) => piece.items.map((item) => item.id))
        );
        return ids.length > 0 && ids.every((id) => there.has(id));
      },
    }),
    onTo(
      snapshot,
      'shipment-and-movement',
      'Shipment and Movement',
      'Press Next phase to begin Shipment and Movement. The faction tokens in the top right show the order of play.'
    ),
    task({
      id: 'movement-order',
      task: 'Read the faction order',
      detail:
        'The faction tokens in the top right show whose turn it is. One faction is active, marked by a ring. The others are waiting or done; done factions have a check mark.\n\nPlayers can rearrange the waiting factions when someone acts out of order. The Guild can interject and pass, a super baller move.\n\nThe factions before you have finished. Your faction is active now. Press {Enter} to begin your turn.',
      anchor: { kind: 'page', element: element('[aria-label="Shipment and Movement turns"]') },
      ...(() => {
        const enter = pressEnter();
        return {
          ...enter,
          begin: () => {
            const view = snapshot();
            const order = movementOrder(
              stormOrder(view.table.stormSectorIndex, view.roster, view.table.pieces),
              view.movement
            );
            const before = order.slice(0, Math.max(0, order.indexOf(mine() ?? '')));
            for (const factionId of before) {
              const seat = view.roster?.seats.find((entry) => entry.faction?.id === factionId)?.id;
              if (seat && players.others().includes(seat) && !snapshot().movement?.done.includes(factionId)) {
                players.act(seat, { kind: 'movement-done', factionId });
              }
            }
            return enter.begin();
          },
        };
      })(),
    }),
    task({
      id: 'ship',
      task: 'Ship a stack onto the board',
      detail:
        'Ship one stack from your reserves onto any territory. Hold the stack to pick it up, then drag it onto the board.',
      anchor: { kind: 'table', point: () => at(myTroops().find((piece) => !onBoard(piece))) },
      begin: () => ({
        landings: players.landings().length,
        reserves: new Set(
          myTroops()
            .filter((piece) => !onBoard(piece))
            .flatMap((piece) => piece.items.map((item) => item.id))
        ),
      }),
      done: (start) =>
        players
          .landings()
          .slice(start.landings)
          .some(
            (landing) =>
              landing.itemIds.length > 0 &&
              landing.itemIds.every((id) => start.reserves.has(id)) &&
              myTroops().some(
                (piece) =>
                  board?.territory(snapshot(), piece) &&
                  landing.itemIds.every((id) => piece.items.some((item) => item.id === id))
              )
          ),
    }),
    task({
      id: 'move',
      task: 'Move a stack to another territory',
      detail:
        'Now move one of your stacks already on the board to a different territory. Hold the stack to pick it up, then drag it to its destination.',
      anchor: { kind: 'table', point: () => at(myTroops().find(onBoard)) },
      begin: () => ({
        landings: players.landings().length,
        territories: new Map(
          myTroops().flatMap((piece) => {
            const territory = board?.territory(snapshot(), piece);
            return territory ? piece.items.map((item) => [item.id, territory] as const) : [];
          })
        ),
      }),
      done: (start) =>
        players
          .landings()
          .slice(start.landings)
          .some(
            (landing) =>
              landing.itemIds.length > 0 &&
              myTroops().some((piece) => {
                const destination = board?.territory(snapshot(), piece);
                return (
                  destination &&
                  landing.itemIds.every(
                    (id) =>
                      start.territories.has(id) &&
                      start.territories.get(id) !== destination &&
                      piece.items.some((item) => item.id === id)
                  )
                );
              })
          ),
    }),
    task({
      id: 'movement-done',
      task: 'Finish your turn',
      detail:
        'Click your own faction token in the top right to show you have finished Shipment and Movement. Its check mark tells the next faction they can begin.',
      anchor: { kind: 'page', element: movementToken },
      begin: () => players.acceptedActions().length,
      done: (start) =>
        Boolean(mine() && snapshot().movement?.done.includes(mine()!)) &&
        actsSince(start).some(({ action }) => action.kind === 'movement-done' && action.factionId === mine()),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'One press of Next phase moves the game one phase on, and the camera with it',
  'Spice Blow: turn over a Spice card, then place its spice from the bank on the board',
  'Bidding: right-click the Treachery deck to draw a card',
  'Revival: the Tleilaxu Tanks lie below the board',
  'Ship a stack, move a stack to another territory, then mark your faction done',
];

export const whatGoesWhere: ChapterScript = { slug: 'what-goes-where', checkpoint: 'turn-1-storm', tasks, learned };
