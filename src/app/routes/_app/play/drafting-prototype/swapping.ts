/* PROTOTYPE (#1143): in-memory swapping fixture. Factions stay with seats; players move. Real factions and profiles from the snapshots beside this file. Never persisted, never merged. */
import { factionById, ME } from './fixture';
import type { Faction } from './fixture';
import { PROFILES } from './profiles.fixture';

export type SwapPlayer = { id: string; name: string; initials: string; avatar: string; ready: boolean };

export type Seat = { index: number; faction: string; player: SwapPlayer | null };

export type Offer = { from: number; to: number };

export type SwapState = {
  seats: Seat[];
  offers: Offer[];
  meId: string;
  secondsLeft: number;
};

function swapPlayer(slug: string, ready: boolean): SwapPlayer {
  const p = PROFILES.find((candidate) => candidate.slug === slug);
  if (!p) {
    throw new Error(`Unknown profile ${slug}`);
  }
  return { id: slug, name: p.username, initials: p.username.slice(0, 2).toUpperCase(), avatar: p.avatarUrl, ready };
}

export const INITIAL_SWAP: SwapState = {
  meId: ME,
  secondsLeft: 192,
  seats: [
    { index: 0, faction: 'house-atreides', player: swapPlayer('twaffle', true) },
    { index: 1, faction: 'house-harkonnen', player: swapPlayer('fectumbra', false) },
    { index: 2, faction: 'fremen', player: swapPlayer(ME, false) },
    { index: 3, faction: 'emperor', player: swapPlayer('erickenneth', false) },
    { index: 4, faction: 'spacing-guild', player: null },
    { index: 5, faction: 'bene-gesserit', player: swapPlayer('ridwan', false) },
  ],
  offers: [
    { from: 3, to: 2 },
    { from: 5, to: 0 },
  ],
};

export type SwapAction =
  | { type: 'offer'; to: number }
  | { type: 'cancelOffer' }
  | { type: 'accept'; from: number }
  | { type: 'toggleReady' }
  | { type: 'tick' };

export function mySeat(state: SwapState): Seat {
  const seat = state.seats.find((candidate) => candidate.player?.id === state.meId);
  if (!seat) {
    throw new Error('The current player has no seat');
  }
  return seat;
}

export function seatFaction(seat: Seat): Faction {
  return factionById(seat.faction);
}

export function offersTo(state: SwapState, seatIndex: number) {
  return state.offers.filter((offer) => offer.to === seatIndex);
}

export function offerFrom(state: SwapState, seatIndex: number) {
  return state.offers.find((offer) => offer.from === seatIndex) ?? null;
}

export function swapGates(state: SwapState) {
  const seated = state.seats.filter((seat) => seat.player).length;
  const ready = state.seats.filter((seat) => seat.player?.ready).length;
  return { seated, seatCount: state.seats.length, ready, vacancies: state.seats.length - seated };
}

export function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function movePlayers(seats: Seat[], a: number, b: number): Seat[] {
  return seats.map((seat) => {
    if (seat.index === a) {
      return { ...seat, player: seats[b].player };
    }
    if (seat.index === b) {
      return { ...seat, player: seats[a].player };
    }
    return seat;
  });
}

/* The swapping rules from #1024: unready players offer and accept; a vacant target completes at once; readiness freezes a player. */
export function reduceSwap(state: SwapState, action: SwapAction): SwapState {
  const me = mySeat(state);
  switch (action.type) {
    case 'tick':
      return { ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) };
    case 'toggleReady':
      return {
        ...state,
        offers: me.player?.ready ? state.offers : state.offers.filter((offer) => offer.from !== me.index),
        seats: state.seats.map((seat) =>
          seat.index === me.index && seat.player ? { ...seat, player: { ...seat.player, ready: !seat.player.ready } } : seat
        ),
      };
    case 'offer': {
      if (me.player?.ready || action.to === me.index) {
        return state;
      }
      const target = state.seats[action.to];
      if (!target.player) {
        const seats = movePlayers(state.seats, me.index, action.to);
        return { ...state, seats, offers: state.offers.filter((offer) => offer.from !== me.index && offer.to !== me.index) };
      }
      if (target.player.ready) {
        return state;
      }
      const others = state.offers.filter((offer) => offer.from !== me.index);
      return { ...state, offers: [...others, { from: me.index, to: action.to }] };
    }
    case 'cancelOffer':
      return { ...state, offers: state.offers.filter((offer) => offer.from !== me.index) };
    case 'accept': {
      if (me.player?.ready) {
        return state;
      }
      const offer = state.offers.find((candidate) => candidate.from === action.from && candidate.to === me.index);
      if (!offer) {
        return state;
      }
      const seats = movePlayers(state.seats, me.index, action.from);
      const involved = new Set([me.index, action.from]);
      return { ...state, seats, offers: state.offers.filter((candidate) => !involved.has(candidate.from) && !involved.has(candidate.to)) };
    }
    default:
      return state;
  }
}
