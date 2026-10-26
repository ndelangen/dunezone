import type { GameSnapshot } from "@shared/play/protocol";

import type { GuideTask } from "../TutorialGuide";
import type { ChapterScript } from "./chapterScript";
import {
  at,
  nextPhaseButton,
  onBoard,
  phaseOf,
  singleSpiceFaceUp,
  tableDeck,
  task,
} from "./guideChecks";

/*
 * Chapter 5, "What goes where": the first turn played through, so each phase shows where on the table it happens.
 * Storm to Spice Blow, a Spice card turned over; on to Bidding, a Treachery card drawn; on to Shipment, troops onto the board.
 * The game here is a table, not a referee, so the player runs each phase by hand (Norbert, 2026-10-26: the chapter needed one thread).
 * Moving the camera is chapter 6's, the windows over the table chapter 9's, and the chat bar Alliances and talking's.
 */

/* Pressing Next phase until the header names a phase; one already reached counts at once. */
const onTo = (
  snapshot: () => GameSnapshot,
  id: string,
  phase: string,
  detail: string,
) =>
  task({
    id: `to-${id}`,
    task: `Move on to the ${phase}`,
    detail,
    anchor: { kind: "page", element: nextPhaseButton },
    begin: () => undefined,
    done: () => phaseOf(snapshot).id === id,
  });

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () =>
    snapshot().table.pieces.filter((piece) => !piece.inventory);
  const mine = () => snapshot().bank?.factionId;
  const deck = (side: "left" | "right") => tableDeck(snapshot, side);
  /* Troops, not stacks: a troop dropped onto one already there joins its stack, and splitting a stack on the board adds none. */
  const myTroopsOnBoard = () =>
    pieces()
      .filter(
        (piece) =>
          piece.stackKey?.startsWith(`troops:${mine()}:`) && onBoard(piece),
      )
      .reduce((total, piece) => total + piece.items.length, 0);
  return [
    onTo(
      snapshot,
      "spice-blow",
      "Spice Blow",
      "Turn 1 starts in the Storm, as the header top left says. Nobody referees here: you move the game on yourself. Press Next phase, top right.",
    ),
    task({
      id: "spice",
      task: "Turn over the top Spice card",
      detail:
        "The Spice Blow happens at the Spice deck, on the right of the table. To draw one card, press down on the deck and swipe away at once: the top card comes with you. Wait a moment before you move and the whole deck comes instead. Drop the card on the table, then point at it and press {F} on your keyboard to turn it over.",
      anchor: { kind: "table", point: () => at(deck("right")) },
      begin: () => singleSpiceFaceUp(pieces()),
      done: (start) => singleSpiceFaceUp(pieces()) > start,
    }),
    onTo(
      snapshot,
      "bidding",
      "Bidding",
      "Press Next phase until the header says Bidding. CHOAM Charity comes first and needs nothing from you here.",
    ),
    task({
      id: "draw",
      task: "Draw a Treachery card",
      detail:
        "Bidding sells cards from the Treachery deck, on the left of the table. The bidder over the board runs the auction, which the Bidding chapter covers. Say you won a card: right-click the deck and choose Draw a card.",
      anchor: { kind: "table", point: () => at(deck("left")) },
      /* The card must leave the Treachery deck, so a Spice card drawn instead does not count. */
      begin: () => ({
        hand: snapshot().hand?.length ?? 0,
        deck: deck("left")?.items.length ?? 0,
      }),
      done: (start) =>
        (snapshot().hand?.length ?? 0) > start.hand &&
        (deck("left")?.items.length ?? 0) < start.deck,
    }),
    onTo(
      snapshot,
      "shipment-and-movement",
      "Shipment and Movement",
      "Press Next phase until the header says Shipment and Movement. Revival comes first.",
    ),
    task({
      id: "ship",
      task: "Ship troops onto the board",
      detail:
        "Your reserves wait on the rim at your seat, where the arrow points. Drag a troop from the stack onto any territory.",
      anchor: {
        kind: "table",
        point: () =>
          at(
            pieces().find(
              (piece) =>
                piece.stackKey?.startsWith(`troops:${mine()}:`) &&
                !onBoard(piece),
            ),
          ),
      },
      begin: myTroopsOnBoard,
      done: (start) => myTroopsOnBoard() > start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  "You move the game on yourself with Next phase",
  "Spice Blow: turn over a card from the Spice deck with {F}",
  "Bidding: right-click the Treachery deck to draw a card",
  "Shipment: drag troops from your reserves onto a territory",
];

export const whatGoesWhere: ChapterScript = {
  slug: "what-goes-where",
  checkpoint: "turn-1-storm",
  tasks,
  learned,
};
