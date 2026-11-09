import { movementOrder } from '@shared/play/movement';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { isSpicePiece } from '@shared/play/spice';
import { spiceBankSlot } from '@shared/play/spiceBank';
import { stormOrder } from '@shared/play/stormSector';
import { TABLE_TANKS_LABEL_POSITION } from '@shared/play/tableFurnitureLayout';
import { TABLE_VISIBLE_RADIUS } from '@shared/play/tableGeometry';
import { isInTanks, isOnBottomShelf } from '@shared/play/tanksShelf';

import type { GuideTask } from '@app/widgets/tutorial-guide/TutorialGuide';

import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, element, nextPhaseButton, onBoard, pressEnter, tableDeck, task } from './guideChecks';
import type { Piece } from './guideChecks';
import type * as BoardChecks from './whatGoesWhereBoard';

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

const containsItems = (piece: Piece, itemIds: readonly string[]) => {
  const held = new Set(piece.items.map((item) => item.id));
  return itemIds.every((id) => held.has(id));
};

const leftAnotherTerritory = (itemIds: readonly string[], origins: ReadonlyMap<string, string>, destination: string) =>
  itemIds.every((id) => origins.has(id) && origins.get(id) !== destination);

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
  let blow: BoardChecks.SpiceBlow | undefined;
  /* The revealed card, followed by its top card's ID, since a pile it lands on gets a new piece ID. */
  const blowCard = () => pieces().find((piece) => blow && piece.items.at(-1)?.id === blow.card);
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const mine = () => snapshot().bank?.factionId;
  const deck = (side: 'left' | 'right') => tableDeck(snapshot, side);
  const myTroops = () => pieces().filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`));
  const landedTerritory = (itemIds: readonly string[]) => {
    if (itemIds.length === 0) {
      return undefined;
    }
    const stack = myTroops().find((piece) => containsItems(piece, itemIds));
    return stack && board?.territory(snapshot(), stack);
  };
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
  /* A stack pushed aside onto the shelf round the pad still went to the Tanks. */
  const inTanks = (piece: Piece) =>
    isInTanks(piece.position) ||
    (isOnBottomShelf(piece.position[0], piece.position[2]) &&
      Math.hypot(piece.position[0], piece.position[2]) > TABLE_VISIBLE_RADIUS);
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
        'Time for a Spice Blow! Drag the top card off the Spice deck on the right and drop it beside the deck. Hover over the card and press {F} to turn it face up.\n\nStart dragging straight away to take one card; holding first picks up the whole deck. If the whole deck turns over, press {F} over it again.',
      anchor: { kind: 'table', point: () => at(deck('right')) },
      /* The deck itself turned over shows its bottom card, which is no blow; a card drawn off it counts on its own or on top of a discard pile. */
      begin: () => ({
        deck: deck('right')?.id,
        seen: new Set(
          pieces().flatMap((piece) => {
            const shown = board?.spiceBlow(snapshot(), piece);
            return shown ? [shown.card] : [];
          })
        ),
      }),
      done: (start) => {
        for (const piece of pieces()) {
          const revealed = piece.id !== start.deck ? board?.spiceBlow(snapshot(), piece) : undefined;
          if (revealed && !start.seen.has(revealed.card)) {
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
        const amount = blow?.amount ?? 'its';
        const where = blow?.name ?? 'the territory it names';
        return `The card asks for ${amount} spice in ${where}, which now glows on the board. Right-click the card and choose Place ${amount} spice on ${where}.\n\nWith several cards face up, press {Space} and choose Spice blow to place them all at once.`;
      },
      anchor: { kind: 'table', point: () => at(blowCard()) ?? spiceBankSlot().position },
      begin: () =>
        new Set(
          pieces()
            .filter(isSpicePiece)
            .flatMap((piece) => piece.items.map((item) => item.id))
        ),
      /* Spice placed from the card or spawned from the bank by hand both count, once the card's amount lies in its territory. */
      done: (existing) => {
        if (!blow || !board) {
          return false;
        }
        const territories = blow.territories;
        const placed = pieces()
          .filter((piece) => isSpicePiece(piece) && territories.includes(board!.territory(snapshot(), piece) ?? ''))
          .flatMap((piece) => piece.items)
          .filter((item) => !existing.has(item.id)).length;
        return placed >= blow.amount;
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
        'Move every Harkonnen troop to the Tleilaxu Tanks, including the troops in Carthag and those in their reserves. Click M on the camera dial to see both stacks. Hold a stack to pick it all up, then drag it onto the Tanks below the board. Click B to inspect the Tanks.',
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
          .some((landing) => landedTerritory(landing.itemIds) && landing.itemIds.every((id) => start.reserves.has(id))),
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
          .some((landing) => {
            const destination = landedTerritory(landing.itemIds);
            return destination && leftAnotherTerritory(landing.itemIds, start.territories, destination);
          }),
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
  'Spice Blow: turn over a Spice card, then right-click it to place its spice in the territory it lights',
  'Bidding: right-click the Treachery deck to draw a card',
  'Revival: the Tleilaxu Tanks lie below the board',
  'Ship a stack, move a stack to another territory, then mark your faction done',
];

export const whatGoesWhere: ChapterScript = { slug: 'what-goes-where', checkpoint: 'turn-1-storm', tasks, learned };
