import { factionTokenOf } from '@shared/play/factionToken';
import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, element, tableDeck, task } from './guideChecks';

/*
 * "Bidding": one round on the bidder, the teardrop over the board, from its start to a card won.
 * The others moved the game on to Bidding before the chapter opens. The learner opens the round at their own faction,
 * raises, takes a raise back and hands the bidder on with the letter keys, and the other players answer: one outbids them,
 * the rest pass, and the learner wins the card back. Then P turns their faction token face down to sit rounds out, and U turns it up.
 * The bidder's letters P, I, O and U work while it points at the player (the chapter map Norbert approved, 2026-10-26).
 */

/* How long the other players think before they bid or pass, so each move shows on the bidder. */
const THINK_MS = 900;
/* The others outbid the learner's bid only below this, so a raise past it wins the card. */
const OUTBID_BELOW = 3;
/* Bidding is the turn's fourth phase: Storm, Spice Blow and CHOAM Charity come first. */
const PHASES_TO_BIDDING = 3;

const DISC = '[data-bidder-turn]';

/* The seat that plays a faction, among the other players. */
const seatOf = (players: TablePlayers, factionId: string) =>
  players.others().find((seat) => players.viewOf(seat).bank?.factionId === factionId);

/*
 * The other players' bidding while the task runs: whoever the bidder reaches while the learner leads with a small bid outbids them,
 * and everyone else passes, so the learner sees a raise come back and then wins the card with a higher one.
 */
function othersBid(snapshot: () => GameSnapshot, players: TablePlayers) {
  let acted = '';
  const timer = setInterval(() => {
    const bidding = snapshot().bidding;
    const mine = snapshot().bank?.factionId;
    if (bidding?.stage !== 'open' || !bidding.turn || bidding.turn === mine) {
      return;
    }
    /* One move per turn of the bidder: a raise keeps the bidder on the raiser, who then hands it on. */
    const moment = `${bidding.round}:${bidding.turn}:${bidding.bid?.factionId}:${bidding.bid?.amount}`;
    if (moment === acted) {
      return;
    }
    acted = moment;
    const seat = seatOf(players, bidding.turn);
    if (!seat) {
      return;
    }
    const { bid } = bidding;
    const outbid = bid !== null && bid.factionId === mine && bid.amount < OUTBID_BELOW;
    players.act(seat, { kind: outbid ? 'bid-raise' : 'bid-pass', round: bidding.round });
  }, THINK_MS);
  return () => clearInterval(timer);
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const mine = () => snapshot().bank?.factionId ?? '';
  const myName = () => snapshot().roster?.seats.find((seat) => seat.faction?.id === mine())?.faction?.name ?? '';
  const bidding = () => snapshot().bidding;
  const myBid = () => (bidding()?.bid?.factionId === mine() ? bidding()!.bid!.amount : 0);
  const myToken = () => factionTokenOf(snapshot().table.pieces, mine());
  const tokenUp = () => myToken()?.items[0]?.faceUp ?? true;
  const disc = { kind: 'page' as const, element: element(DISC) };
  return [
    task({
      id: 'start',
      task: 'Start a bidding round',
      detail: "It's time to bid! Click your faction on the bidding disc to start the round with you.",
      anchor: { kind: 'page', element: () => document.querySelector(`[aria-label="Start bidding at ${myName()}"]`) },
      begin: () => {
        const timer = setInterval(() => {
          const round = bidding();
          const seat = players.others()[0];
          if (seat && round?.stage === 'open' && round.turn !== mine()) {
            players.act(seat, { kind: 'bid-start', factionId: mine() });
          }
        }, 200);
        return () => clearInterval(timer);
      },
      done: (stop) => {
        const ready = bidding()?.stage === 'open' && bidding()?.turn === mine();
        if (ready) {
          stop();
        }
        return ready;
      },
      finish: (stop) => stop(),
    }),
    task({
      id: 'raise',
      task: 'Bid 2 spice',
      detail: 'Press {I} or click the centre of the disc to raise your bid by one spice. Do it twice to bid 2.',
      anchor: disc,
      begin: () => undefined,
      done: () => myBid() >= 2,
    }),
    task({
      id: 'lower',
      task: 'Change your bid',
      detail:
        'Changed your mind? Press {O} to lower your bid by one.\n\nYou can only undo increases you made on this bidding turn.',
      anchor: disc,
      /* A raise of 2 or more came first, so a bid of 1 now can only be a raise taken back. */
      begin: () => undefined,
      done: () => myBid() === 1,
    }),
    task({
      id: 'hand-on',
      task: 'Pass to the next bidder',
      detail: 'Press {P} or right-click the disc to finish your bidding turn. The next faction can now respond.',
      anchor: disc,
      begin: () => ({ stop: othersBid(snapshot, players) }),
      done: () => bidding()?.turn !== mine(),
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'win',
      task: 'Win the card',
      detail:
        "You're back in the bidding! When the bidder points at your faction, press {I} to raise, then {P} to pass to the next bidder.\n\nYou win when everyone else passes.",
      anchor: disc,
      begin: () => ({ stop: othersBid(snapshot, players) }),
      /* A slip that hands the bidder on unraised lets another faction win; the round still ends, so the chapter goes on. */
      done: () => bidding()?.stage === 'won',
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'take-card',
      task: 'Take the card',
      detail:
        'Practice paying for the card, then taking it.\n\nPlace the amount of spice you bid near the Emperor faction token.\n\nOnce paid, right-click the Treachery deck and draw a card.',
      anchor: { kind: 'table', point: () => at(tableDeck(snapshot, 'left')) },
      begin: () => ({ seen: players.acceptedActions().length, deck: tableDeck(snapshot, 'left')?.id }),
      done: ({ seen, deck }) =>
        players
          .acceptedActions()
          .slice(seen)
          .some(
            ({ action }) =>
              action.kind === 'deck-draw' &&
              action.pieceId === deck &&
              (!action.recipient || action.recipient === mine())
          ),
    }),
    task({
      id: 'sit-out',
      task: 'Sit out the next round',
      detail: 'Press {P} to sit out the next round. Your faction token turns face down and bidding skips you.',
      anchor: { kind: 'table', point: () => (myToken()?.position as [number, number, number] | undefined) ?? null },
      begin: () => undefined,
      done: () => !tokenUp(),
    }),
    task({
      id: 'back-in',
      task: 'Join the bidding again',
      detail: 'Press {U} to turn your faction token face up and rejoin bidding in the next round.',
      anchor: { kind: 'table', point: () => (myToken()?.position as [number, number, number] | undefined) ?? null },
      begin: () => undefined,
      done: () => tokenUp(),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Click a faction on the bidder to start a round there',
  '{I} raises your bid, {O} takes a raise back, {P} hands the bidder on',
  'A round ends when everyone but the high bidder has passed; then the winner pays and draws the card',
  '{P} between your turns turns your faction token face down to sit rounds out, and {U} turns it up again',
];

export const bidding: ChapterScript = {
  slug: 'bidding',
  checkpoint: 'turn-1-storm',
  opening: (players) => {
    const seat = players.others()[0];
    for (let step = 0; seat && step < PHASES_TO_BIDDING; step++) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned,
};
