/* PROTOTYPE (#1147): in-memory play fixture. The setup state mid-game plus a bank, a battle plan, threads per faction and the two nested-tab paths. Never persisted, never merged. */
import { ME } from './fixture';
import { leadersOf } from './leaders.fixture';
import { factionName, mySeat, phaseCooldownLeft, reduceSetup, setupScenarioState } from './setup';
import type { SetupAction, SetupState } from './setup';

export type Message = { from: 'me' | 'them'; text: string; at: string };

export type Transfer = { to: string; amount: number; kind: 'pay' | 'bribe'; state: 'done' | 'pending' };

export type BattlePlan = { leader: string | null; forces: number; card: string | null; committed: boolean };

export type PlayState = SetupState & {
  turn: number;
  phaseLabel: string;
  bank: number;
  transfers: Transfer[];
  battle: BattlePlan;
  threads: Record<string, Message[]>;
  draft: string;
  transferAmount: number;
  left: readonly string[];
  right: readonly string[];
};

export type PlayAction =
  | SetupAction
  | { type: 'setLeft'; path: readonly string[] }
  | { type: 'setRight'; path: readonly string[] }
  | { type: 'chooseLeader'; memberId: string }
  | { type: 'setForces'; forces: number }
  | { type: 'chooseCard'; memberId: string | null }
  | { type: 'commitBattle' }
  | { type: 'withdrawBattle' }
  | { type: 'draftMessage'; text: string }
  | { type: 'sendMessage' }
  | { type: 'setTransferAmount'; amount: number }
  | { type: 'pay' }
  | { type: 'bribe' }
  | { type: 'advance'; direction: 1 | -1; at: number };

const THREADS: Record<string, Message[]> = {
  'house-atreides': [
    { from: 'them', text: 'We should talk about the Guild before bidding.', at: '12:04' },
    { from: 'me', text: 'Agreed. What do you want for Carthag?', at: '12:06' },
    { from: 'them', text: 'Two spice now, and you stay out of Arrakeen this turn.', at: '12:07' },
  ],
  'house-harkonnen': [{ from: 'them', text: 'Nothing personal about the Tanks.', at: '11:40' }],
  emperor: [{ from: 'me', text: 'After the storm, then.', at: '11:52' }],
  'spacing-guild': [],
  'bene-gesserit': [
    { from: 'them', text: 'A proposal for turn 3.', at: '11:58' },
    { from: 'them', text: 'Hold the south and I will not ship into Habbanya.', at: '11:59' },
  ],
};

export function initialPlayState(): PlayState {
  const seated = { ...setupScenarioState('final'), activePhase: 'starting-forces' };
  const seats = seated.seats.map((seat) => (seat.index === 4 ? { ...seat, player: { id: 'argelius', name: 'Argelius', initials: 'AR', avatar: 'https://dune.zone/user-images/a97a3b377cc73349521100a2c73b2907234a569f8b6317e209fbc87eba2eafb6.jpg', ready: false }, ready: false } : { ...seat, ready: false }));
  return {
    ...seated,
    seats,
    seatRequests: [],
    requests: [],
    hand: [
      { leader: leadersOf('house-harkonnen')[0], faction: 'house-harkonnen' },
      { leader: leadersOf('emperor')[0], faction: 'emperor' },
    ],
    turn: 3,
    phaseLabel: 'Battle',
    bank: 11,
    transfers: [
      { to: 'house-atreides', amount: 2, kind: 'bribe', state: 'pending' },
      { to: 'bene-gesserit', amount: 3, kind: 'pay', state: 'done' },
    ],
    battle: { leader: null, forces: 4, card: null, committed: false },
    threads: THREADS,
    draft: '',
    transferAmount: 2,
    left: ['inventory', 'hand'],
    right: ['house-atreides', 'thread'],
  };
}

export function otherSeats(state: PlayState) {
  const me = mySeat(state);
  return state.seats.filter((seat) => seat.player && seat.index !== me?.index);
}

export function threadFor(state: PlayState, faction: string): Message[] {
  return state.threads[faction] ?? [];
}

export function unreadFor(state: PlayState, faction: string): number {
  const thread = threadFor(state, faction);
  const last = thread[thread.length - 1];
  return last && last.from === 'them' ? 1 : 0;
}

export function pendingBribeTo(state: PlayState, faction: string): number {
  return state.transfers.filter((transfer) => transfer.to === faction && transfer.kind === 'bribe' && transfer.state === 'pending').reduce((sum, transfer) => sum + transfer.amount, 0);
}

export function planSummary(state: PlayState): string {
  const me = mySeat(state);
  const leader = me ? leadersOf(me.faction).find((candidate) => candidate.memberId === state.battle.leader) : undefined;
  const card = state.hand.find((held) => held.leader.memberId === state.battle.card);
  return `${leader ? leader.name : 'No leader'}, ${state.battle.forces} forces${card ? `, ${card.leader.name} as the card` : ', no card'}`;
}

export function reducePlay(state: PlayState, action: PlayAction): PlayState {
  const me = mySeat(state);
  switch (action.type) {
    case 'setLeft':
      return { ...state, left: action.path };
    case 'setRight':
      return { ...state, right: action.path };
    case 'chooseLeader':
      return state.battle.committed ? state : { ...state, battle: { ...state.battle, leader: action.memberId === state.battle.leader ? null : action.memberId } };
    case 'setForces':
      return state.battle.committed ? state : { ...state, battle: { ...state.battle, forces: Math.max(0, Math.min(state.reserve, action.forces)) } };
    case 'chooseCard':
      return state.battle.committed ? state : { ...state, battle: { ...state.battle, card: action.memberId } };
    case 'commitBattle':
      return state.battle.leader === null ? state : { ...state, battle: { ...state.battle, committed: true } };
    case 'withdrawBattle':
      return { ...state, battle: { ...state.battle, committed: false } };
    case 'draftMessage':
      return { ...state, draft: action.text };
    case 'sendMessage': {
      const faction = state.right[0];
      const text = state.draft.trim();
      if (!faction || !text) {
        return state;
      }
      return { ...state, draft: '', threads: { ...state.threads, [faction]: [...threadFor(state, faction), { from: 'me', text, at: 'now' }] } };
    }
    case 'setTransferAmount':
      return { ...state, transferAmount: Math.max(1, Math.min(state.bank, action.amount)) };
    case 'pay': {
      const to = state.right[0];
      if (!to || state.transferAmount > state.bank) {
        return state;
      }
      return { ...state, bank: state.bank - state.transferAmount, transfers: [...state.transfers, { to, amount: state.transferAmount, kind: 'pay', state: 'done' }] };
    }
    case 'bribe': {
      const to = state.right[0];
      if (!to || state.transferAmount > state.bank) {
        return state;
      }
      return { ...state, bank: state.bank - state.transferAmount, transfers: [...state.transfers, { to, amount: state.transferAmount, kind: 'bribe', state: 'pending' }] };
    }
    case 'advance': {
      if (!me || phaseCooldownLeft(state, action.at) > 0) {
        return state;
      }
      return { ...state, phaseChangedAt: action.at, phaseLabel: action.direction === 1 ? 'Spice collection' : 'Shipment and movement' };
    }
    default: {
      /* Drag, drop, flip, spawn and the rest are the setup reducer's; the play fields ride along. */
      const next = reduceSetup(state, action as SetupAction);
      return next === state ? state : { ...state, ...next };
    }
  }
}

export function counterpartName(state: PlayState, faction: string): string {
  const seat = state.seats.find((candidate) => candidate.faction === faction);
  return seat?.player ? `${seat.player.name}, ${factionName(faction)}` : factionName(faction);
}

export { ME };
