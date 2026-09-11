/* PROTOTYPE (#1143): in-memory swapping fixture. Factions stay with seats; players move. Never persisted, never merged. */
import { factionById } from './fixture';
import type { Faction } from './fixture';

export type SwapPlayer = { id: string; name: string; initials: string; colour: string; ready: boolean };

export type Seat = { index: number; faction: string; player: SwapPlayer | null };

export type Offer = { from: number; to: number };

export type SwapState = {
  seats: Seat[];
  offers: Offer[];
  meId: string;
  secondsLeft: number;
};

export const INITIAL_SWAP: SwapState = {
  meId: 'p1',
  secondsLeft: 192,
  seats: [
    { index: 0, faction: 'atreides', player: { id: 'p0', name: 'Mara', initials: 'MA', colour: '#63b89d', ready: true } },
    { index: 1, faction: 'harkonnen', player: { id: 'p2', name: 'Teo', initials: 'TE', colour: '#7aa2f7', ready: false } },
    { index: 2, faction: 'fremen', player: { id: 'p1', name: 'You', initials: 'YOU', colour: '#f8af40', ready: false } },
    { index: 3, faction: 'emperor', player: { id: 'p3', name: 'Ines', initials: 'IN', colour: '#e07a5f', ready: false } },
    { index: 4, faction: 'guild', player: null },
    { index: 5, faction: 'bene-gesserit', player: { id: 'p4', name: 'Kofi', initials: 'KO', colour: '#c792ea', ready: false } },
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
