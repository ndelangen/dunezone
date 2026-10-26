import type { GameSnapshot } from "@shared/play/protocol";

import type { GuideTask } from "../TutorialGuide";
import type { ChapterScript } from "./chapterScript";
import { at, tableDeck, task } from "./guideChecks";
import type { Piece } from "./guideChecks";

/*
 * Chapter 8, "Decks and dealing": what a deck does beyond a draw, on the same table as chapter 7.
 * A card dealt to another player, a few cards split off with a number key, two cards taken in one carry with T, and a deck locked and unlocked.
 * These are the deck controls chapter 7 left for later (the chapter map Norbert approved, 2026-10-26).
 */

/* Loose cards of one deck lying on the table in stacks of at least `size`, by the stack key they would join the deck with again. */
const looseStacks = (
  pieces: readonly Piece[],
  deck: Piece | undefined,
  size: number,
) =>
  deck === undefined
    ? 0
    : pieces.filter(
        (piece) =>
          piece !== deck &&
          !piece.inventory &&
          piece.stackKey === deck.stackKey &&
          piece.items.length >= size,
      ).length;

/* Every Treachery card the other players hold: a hand's size is public, as the rules make it. */
const othersHold = (snapshot: GameSnapshot) =>
  Object.entries(snapshot.handCounts ?? {})
    .filter(([factionId]) => factionId !== snapshot.bank?.factionId)
    .reduce((total, [, count]) => total + count, 0);

/*
 * A new pile of two from the deck, made while T was pressed: holding 2 over the deck, taught just before, makes such a pile too.
 * A right-click while carrying takes the next card as T does, so it counts as well.
 */
const tookWithT = (piles: () => number) => ({
  begin: () => {
    const watch = { start: piles(), took: false, stop: new AbortController() };
    const took = () => {
      watch.took = true;
    };
    const press = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "t") {
        took();
      }
    };
    window.addEventListener("keydown", press, {
      capture: true,
      signal: watch.stop.signal,
    });
    window.addEventListener("contextmenu", took, {
      capture: true,
      signal: watch.stop.signal,
    });
    return watch;
  },
  done: (watch: { start: number; took: boolean }) =>
    watch.took && piles() > watch.start,
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

/* The deck's lock turned to `locked` since the task began, so a lock left over from before it never counts. */
const turnsLocked = (lock: () => boolean | undefined, locked: boolean) => ({
  begin: () => ({ other: lock() !== locked }),
  done: (watch: { other: boolean }) => {
    watch.other ||= lock() !== locked;
    return watch.other && lock() === locked;
  },
});

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces;
  const treachery = () => tableDeck(snapshot, "left");
  const spice = () => tableDeck(snapshot, "right");
  return [
    task({
      id: "deal",
      task: "Deal a card to another player",
      detail:
        "Right-click the Treachery deck on the left of the table, choose Deal a card, then a faction. The card goes straight into their hand.",
      anchor: { kind: "table", point: () => at(treachery()) },
      begin: () => othersHold(snapshot()),
      done: (start) => othersHold(snapshot()) > start,
    }),
    task({
      id: "split",
      task: "Split three cards off the Spice deck",
      detail:
        "Point at the Spice deck on the right and hold {3} on your keyboard for a second, as you split troops. The top three cards slide off beside it as a pile of their own, still face down.",
      anchor: { kind: "table", point: () => at(spice()) },
      begin: () => looseStacks(pieces(), spice(), 3),
      done: (start) => looseStacks(pieces(), spice(), 3) > start,
    }),
    task({
      id: "take-two",
      task: "Pick up two cards in one go",
      detail:
        "Swipe the top Treachery card off the deck (press down and move at once), hold it back over the deck and press {T}: the next card joins it. Drop the two on the table.",
      anchor: { kind: "table", point: () => at(treachery()) },
      ...tookWithT(() => looseStacks(pieces(), treachery(), 2)),
    }),
    task({
      id: "lock",
      task: "Lock the Spice deck",
      detail:
        "Point at the Spice deck and press {L}. A locked piece stays put: nobody can move, draw from or deal from it by accident.",
      anchor: { kind: "table", point: () => at(spice()) },
      ...turnsLocked(() => spice()?.locked, true),
    }),
    task({
      id: "unlock",
      task: "Unlock it again",
      detail:
        "Press {L} over it once more. Right-click it first if you like: its draw, deal and shuffle wait greyed out.",
      anchor: { kind: "table", point: () => at(spice()) },
      ...turnsLocked(() => spice()?.locked, false),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  "Right-click a deck and choose Deal a card to give one to a player",
  "Hold a number key over a deck to split that many cards off it",
  "Press {T} while carrying a card to take the next one with it",
  "{L} locks a piece in place, and unlocks it again",
];

export const decksAndDealing: ChapterScript = {
  slug: "decks-and-dealing",
  checkpoint: "turn-1-storm",
  tasks,
  learned,
};
