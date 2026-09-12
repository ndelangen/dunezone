/* PROTOTYPE (#1147): in-memory play fixture. The setup state mid-game plus a bank, a battle plan, threads per faction and the two nested-tab paths. Never persisted, never merged. */
import { ME } from './fixture';
import { leadersOf } from './leaders.fixture';
import { factionName, mySeat, phaseCooldownLeft, reduceSetup, setupScenarioState } from './setup';
import type { SetupAction, SetupState } from './setup';

export type Message = { from: 'me' | 'them'; text: string; at: string };

/* A spice stack on the table: spawned from a bank, moved by hand, picked up into another bank. */
export type SpiceStack = { id: string; amount: number; from: string };

export type BattlePlan = { leader: string | null; forces: number; card: string | null; committed: boolean };

/* The persistent public log: seat changes, spice transfers and phase changes, newest first. */
export type LogEntry = { at: string; text: string };

export type PlayState = SetupState & {
  turn: number;
  phaseLabel: string;
  bank: number;
  stacks: SpiceStack[];
  spawnAmount: number;
  battle: BattlePlan;
  threads: Record<string, Message[]>;
  log: LogEntry[];
  draft: string;
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
  | { type: 'setSpawnAmount'; amount: number }
  | { type: 'spawnSpice' }
  | { type: 'pickUpSpice'; stack: string }
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
    stacks: [{ id: 'stack-atreides-2', amount: 2, from: 'house-atreides' }],
    spawnAmount: 3,
    battle: { leader: null, forces: 4, card: null, committed: false },
    threads: THREADS,
    log: [
      { at: 'Turn 3, Battle', text: 'Ridwan (Bene Gesserit) picked up a stack of 3 spice from Thialfi (Fremen).' },
      { at: 'Turn 3, Battle', text: 'Twaffle moved the table to Battle.' },
      { at: 'Turn 3, Shipment and movement', text: 'Twaffle (House Atreides) spawned a stack of 2 spice and moved it in front of Thialfi (Fremen).' },
      { at: 'Turn 2, Mentat pause', text: 'Everyone confirmed Ready; Ridwan moved the table to Turn 3.' },
      { at: 'Turn 2, Bidding', text: 'fectumbra (House Harkonnen) spawned a stack of 5 spice for the bid.' },
      { at: 'Turn 1, Setup', text: 'Bene Gesserit locked its prediction.' },
      { at: 'Turn 1, Setup', text: 'Klyzx took seat 5, Spacing Guild, approved by Twaffle; Argelius later took it back.' },
    ],
    draft: '',
    left: ['hand'],
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
    case 'setSpawnAmount':
      return { ...state, spawnAmount: Math.max(1, Math.min(state.bank, action.amount)) };
    case 'spawnSpice': {
      if (!me || state.spawnAmount > state.bank || state.spawnAmount < 1) {
        return state;
      }
      const stack = { id: `stack-${state.stacks.length + 1}`, amount: state.spawnAmount, from: me.faction };
      return {
        ...state,
        bank: state.bank - state.spawnAmount,
        stacks: [...state.stacks, stack],
        log: [{ at: `Turn ${state.turn}, ${state.phaseLabel}`, text: `You spawned a stack of ${stack.amount} spice from your bank.` }, ...state.log],
      };
    }
    case 'pickUpSpice': {
      const stack = state.stacks.find((candidate) => candidate.id === action.stack);
      if (!stack || !me) {
        return state;
      }
      return {
        ...state,
        bank: state.bank + stack.amount,
        stacks: state.stacks.filter((candidate) => candidate.id !== stack.id),
        log: [{ at: `Turn ${state.turn}, ${state.phaseLabel}`, text: `You picked up a stack of ${stack.amount} spice${stack.from === me.faction ? '' : ` from ${factionName(stack.from)}`} into your bank.` }, ...state.log],
      };
    }
    case 'advance': {
      if (!me || phaseCooldownLeft(state, action.at) > 0) {
        return state;
      }
      const phaseLabel = action.direction === 1 ? 'Spice collection' : 'Shipment and movement';
      return { ...state, phaseChangedAt: action.at, phaseLabel, log: [{ at: `Turn ${state.turn}, ${phaseLabel}`, text: `You moved the table to ${phaseLabel}.` }, ...state.log] };
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
