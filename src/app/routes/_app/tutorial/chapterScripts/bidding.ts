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
      task: 'Start a round at your faction',
      detail:
        'The others moved the game on to Bidding, and the bidder hovers over the board. Its face lists the factions in storm order: click yours to open the round with you.',
      anchor: { kind: 'page', element: () => document.querySelector(`[aria-label="Start bidding at ${myName()}"]`) },
      begin: () => undefined,
      done: () => bidding()?.stage === 'open' && bidding()?.turn === mine(),
    }),
    task({
      id: 'raise',
      task: 'Bid 2 spice',
      detail:
        'The bidder points at you. Press {I} on your keyboard to raise the bid by one, or click the disc in the middle. Raise it twice.',
      anchor: disc,
      begin: () => undefined,
      done: () => myBid() >= 2,
    }),
    task({
      id: 'lower',
      task: 'Take it back down to 1',
      detail:
        'Raised too far? Press {O} to lower your bid by one, as often as you need. Only a raise you made this turn comes off.',
      anchor: disc,
      /* A raise of 2 or more came first, so a bid of 1 now can only be a raise taken back. */
      begin: () => undefined,
      done: () => myBid() === 1,
    }),
    task({
      id: 'hand-on',
      task: 'Hand the bidder on',
      detail:
        'Happy with your bid? Press {P}, or right-click the disc. The bidder turns to the next faction, and the others answer.',
      anchor: disc,
      begin: () => ({ stop: othersBid(snapshot, players) }),
      done: () => bidding()?.turn !== mine(),
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'win',
      task: 'Win the card',
      detail:
        'Someone outbid you, and the bidder comes back to you. Raise with {I}, then hand it on with {P}. When everyone else passes, the card is yours.',
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
        'The bidder only keeps score: the winner pays and takes the card by hand. Right-click the Treachery deck and choose Draw a card. Paying is by hand as well: withdraw what you bid from your reserve, as in Your hand and spice.',
      anchor: { kind: 'table', point: () => at(tableDeck(snapshot, 'left')) },
      begin: () => snapshot().hand?.length ?? 0,
      done: (start) => (snapshot().hand?.length ?? 0) > start,
    }),
    task({
      id: 'sit-out',
      task: 'Sit out the next round',
      detail:
        'Hand full, or saving spice? While the bidder is not waiting on you, {P} passes for good: it turns your faction token face down. On the bidder your faction greys out, and rounds skip you.',
      anchor: { kind: 'table', point: () => (myToken()?.position as [number, number, number] | undefined) ?? null },
      begin: () => undefined,
      done: () => !tokenUp(),
    }),
    task({
      id: 'back-in',
      task: 'Join the bidding again',
      detail: 'Press {U} to turn your token face up again. The next round counts you in.',
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
