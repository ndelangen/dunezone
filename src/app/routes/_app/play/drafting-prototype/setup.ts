/* PROTOTYPE (#1146): in-memory setup fixture. Real factions, profiles and leaders from the snapshots beside this file; the setup sequence and its gates from the decisions on #1025. Never persisted, never merged. */
import { TABLE_PHASES } from '@shared/play/phases';

import { ME } from './fixture';
import type { Scenario } from './fixture';
import { leaderByName } from './leaders.fixture';
import type { LeaderFixture } from './leaders.fixture';
import { PROFILES } from './profiles.fixture';
import type { SwapPlayer, SwapState } from './swapping';

export type SetupScenario = 'instructions' | 'traitors' | 'prediction' | 'blocked' | 'refused' | 'final';
export const SETUP_SCENARIOS: readonly SetupScenario[] = ['instructions', 'traitors', 'prediction', 'blocked', 'refused', 'final'];
export const SETUP_SCENARIO_NAMES: Record<SetupScenario, string> = {
  instructions: 'Instructions-only phase with its flat symbol',
  traitors: 'Traitor step, one player not ready',
  prediction: 'Prediction lock as the Bene Gesserit player',
  blocked: 'Everyone ready, a required built-in action incomplete',
  refused: 'A spawn request refused as not ready',
  final: 'Final readiness with a vacant seat and a pending spawn request',
};

/* Every ?scenario= the demo route accepts: the drafting states and the setup states. */
export type PrototypeScenario = Scenario | SetupScenario;

export function isSetupScenario(value: unknown): value is SetupScenario {
  return SETUP_SCENARIOS.includes(value as SetupScenario);
}

/*
 * The setup sequence from #1025: faction-declared phases first (a built-in name such as prediction carries the app's required action, any other name is instructions-only), then traitor selection, then starting forces with the final Ready to play gate, then Turn 1.
 * Whether starting forces and the final gate are one phase or two is open; this fixture makes them one. The standard setup steps have no symbol artwork yet; a faction-declared phase carries its faction's mark.
 */
export type SetupPhase = {
  id: string;
  label: string;
  symbol?: string;
  instructions: string;
  kind: 'instructions' | 'gated' | 'builtin';
  declaredBy?: string;
  readyLabel?: string;
  nextLabel?: string;
};

export const SETUP_PHASES: readonly SetupPhase[] = [
  {
    id: 'prediction',
    label: 'Prediction',
    symbol: '/vector/logo/bene-gesserit.svg',
    kind: 'builtin',
    declaredBy: 'bene-gesserit',
    instructions: 'Bene Gesserit: choose the faction and the turn of the win you predict, then lock it. Everyone else learns only that it is locked.',
    readyLabel: 'Ready',
  },
  {
    id: 'fremen-placement',
    label: 'Fremen placement',
    symbol: '/vector/logo/fremen.svg',
    kind: 'instructions',
    declaredBy: 'fremen',
    instructions: 'Fremen: place 10 forces in Sietch Tabr, False Wall South and False Wall West, in any distribution. Everyone else waits.',
  },
  {
    id: 'traitors',
    label: 'Traitor selection',
    kind: 'gated',
    instructions: 'The map is hidden. Combine the traitor decks, shuffle with hover and R, draw or deal one card per click, and keep what you hold. Ready when your hand is final.',
    readyLabel: 'Ready to end traitor phase',
  },
  {
    id: 'starting-forces',
    label: 'Starting forces',
    kind: 'gated',
    instructions: 'Place your starting forces from the reserve stacks behind your token, then confirm you are ready to play. Turn 1 begins when every seat is taken and ready.',
    readyLabel: 'Ready to play',
    nextLabel: 'Begin Turn 1',
  },
];

/* The nine turn phases follow the setup steps, from the runtime. */
export const TURN_PHASES = TABLE_PHASES.map((phase) => ({ id: phase.id, label: phase.label, symbol: phase.symbol }));

export type SetupSeat = { index: number; faction: string; player: SwapPlayer | null; ready: boolean; connected: boolean };

export type TraitorCardData = { leader: LeaderFixture; faction: string };

export type SharedItem = { id: string; kind: 'deck' | 'bundle' | 'token'; name: string; count: number; origin: string };

export type SpawnRequest = { id: string; requestedBy: string; kind: SharedItem['kind']; name: string; count: number };

export type Refusal = { name: string; reason: string };

export type SpawnOption = { id: string; kind: SharedItem['kind']; name: string; count: number; ready: boolean; missing?: string };

export type Conversation = { faction: string; unread: number; last: string };

export type SetupSeatRequest = { id: string; slug: string; name: string; initials: string; avatar: string; seat: number };

export type SetupState = {
  scenario: SetupScenario;
  meId: string | null;
  activePhase: string;
  seats: SetupSeat[];
  prediction: { status: 'pending' | 'locked'; faction: string; turn: number; revealed: boolean };
  hand: TraitorCardData[];
  reserve: number;
  spice: number;
  shared: SharedItem[];
  requests: SpawnRequest[];
  refusal: Refusal | null;
  conversations: Conversation[];
  seatRequests: SetupSeatRequest[];
};

/* What the spawn control offers; the second is not ready and gets refused with the reason. */
export const SPAWN_OPTIONS: readonly SpawnOption[] = [
  { id: 'tech', kind: 'bundle', name: 'Tech tokens', count: 6, ready: true },
  { id: 'sietch', kind: 'deck', name: 'Sietch deck', count: 12, ready: false, missing: 'its card back is missing and 3 of 12 card fronts are not generated' },
  { id: 'alliance', kind: 'deck', name: 'Alliance cards', count: 8, ready: true },
];

function swapPlayer(slug: string, ready: boolean): SwapPlayer {
  const profile = PROFILES.find((candidate) => candidate.slug === slug);
  if (!profile) {
    throw new Error(`Unknown profile ${slug}`);
  }
  return { id: slug, name: profile.username, initials: profile.username.slice(0, 2).toUpperCase(), avatar: profile.avatarUrl, ready };
}

function seat(index: number, faction: string, slug: string | null, ready: boolean, connected = true): SetupSeat {
  return { index, faction, player: slug ? swapPlayer(slug, ready) : null, ready: slug ? ready : false, connected };
}

function card(name: string): TraitorCardData {
  return leaderByName(name);
}

const SEATING: [string, string][] = [
  ['house-atreides', 'twaffle'],
  ['house-harkonnen', 'fectumbra'],
  ['fremen', ME],
  ['emperor', 'erickenneth'],
  ['spacing-guild', 'argelius'],
  ['bene-gesserit', 'ridwan'],
];

function seats(ready: (slug: string) => boolean, vacant: number | null = null): SetupSeat[] {
  return SEATING.map(([faction, slug], index) =>
    index === vacant ? seat(index, faction, null, false) : seat(index, faction, slug, ready(slug), slug !== 'erickenneth')
  );
}

const CONVERSATIONS: Conversation[] = [
  { faction: 'house-atreides', unread: 2, last: 'Twaffle: we should talk about the Guild.' },
  { faction: 'emperor', unread: 0, last: 'You: agreed, after the storm.' },
  { faction: 'bene-gesserit', unread: 1, last: 'Ridwan: a proposal for turn 3.' },
];

const SHARED: SharedItem[] = [
  { id: 'treachery', kind: 'deck', name: 'Treachery deck', count: 33, origin: 'supplied at setup' },
  { id: 'spice-deck', kind: 'deck', name: 'Spice deck', count: 21, origin: 'supplied at setup' },
];

const LOCKED = { status: 'locked' as const, faction: 'house-atreides', turn: 4, revealed: false };

export function setupScenarioState(scenario: SetupScenario): SetupState {
  const base = {
    scenario,
    meId: ME as string | null,
    hand: [] as TraitorCardData[],
    reserve: 20,
    spice: 3,
    shared: SHARED,
    requests: [] as SpawnRequest[],
    refusal: null as Refusal | null,
    conversations: CONVERSATIONS,
    seatRequests: [] as SetupSeatRequest[],
    prediction: LOCKED,
  };
  switch (scenario) {
    case 'instructions':
      return { ...base, activePhase: 'fremen-placement', seats: seats(() => false) };
    case 'traitors':
      return {
        ...base,
        activePhase: 'traitors',
        seats: seats((slug) => slug !== ME),
        hand: [card('Feyd Rautha'), card('Duncan Idaho'), card('Hasimir Fenring'), card('Princess Irulan')],
      };
    case 'prediction':
      return {
        ...base,
        meId: 'ridwan',
        activePhase: 'prediction',
        seats: seats((slug) => slug === 'twaffle' || slug === 'fectumbra'),
        prediction: { status: 'pending', faction: 'house-atreides', turn: 4, revealed: false },
      };
    case 'blocked':
      return {
        ...base,
        activePhase: 'prediction',
        seats: seats(() => true),
        prediction: { status: 'pending', faction: 'house-atreides', turn: 4, revealed: false },
      };
    case 'refused':
      return {
        ...base,
        activePhase: 'starting-forces',
        seats: seats((slug) => slug === 'twaffle' || slug === 'ridwan'),
        refusal: { name: 'Sietch deck', reason: 'Sietch deck is not ready: its card back is missing and 3 of 12 card fronts are not generated. Approval does not override this; an author fixes it in the asset editor.' },
      };
    case 'final':
      return {
        ...base,
        activePhase: 'starting-forces',
        seats: seats(() => true, 4),
        requests: [{ id: 'req-tech', requestedBy: 'fectumbra', kind: 'bundle', name: 'Tech tokens', count: 6 }],
        seatRequests: [{ ...swapPlayer('klyzx', false), slug: 'klyzx', id: 'seat-klyzx', seat: 4 }],
      };
    default:
      return setupScenarioState('traitors');
  }
}

export type SetupAction =
  | { type: 'toggleReady' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'predict'; faction?: string; turn?: number }
  | { type: 'lockPrediction' }
  | { type: 'reveal' }
  | { type: 'approveSpawn'; request: string }
  | { type: 'dismissSpawn'; request: string }
  | { type: 'requestSpawn'; option: string }
  | { type: 'dismissRefusal' }
  | { type: 'approveSeat'; request: string }
  | { type: 'load'; scenario: SetupScenario };

export function phaseById(id: string): SetupPhase {
  const found = SETUP_PHASES.find((phase) => phase.id === id);
  if (!found) {
    throw new Error(`Unknown setup phase ${id}`);
  }
  return found;
}

export function activePhase(state: SetupState): SetupPhase {
  return phaseById(state.activePhase);
}

export function phaseIndex(state: SetupState): number {
  return SETUP_PHASES.findIndex((phase) => phase.id === state.activePhase);
}

export function mySeat(state: SetupState): SetupSeat | null {
  return state.seats.find((candidate) => candidate.player?.id === state.meId) ?? null;
}

export function myFaction(state: SetupState): string | null {
  return mySeat(state)?.faction ?? null;
}

export function readiness(state: SetupState) {
  const seated = state.seats.filter((candidate) => candidate.player).length;
  const ready = state.seats.filter((candidate) => candidate.player && candidate.ready).length;
  return { seated, ready, seatCount: state.seats.length, vacancies: state.seats.length - seated, allReady: seated > 0 && ready === seated };
}

export function factionName(slug: string): string {
  switch (slug) {
    case 'house-atreides':
      return 'House Atreides';
    case 'house-harkonnen':
      return 'House Harkonnen';
    case 'fremen':
      return 'Fremen';
    case 'emperor':
      return 'Emperor';
    case 'spacing-guild':
      return 'Spacing Guild';
    case 'bene-gesserit':
      return 'Bene Gesserit';
    default:
      return slug;
  }
}

/* Why Next phase is disabled, or null when it is enabled. An instructions-only phase completes on Next; a gated phase waits for every seat; a built-in action blocks its own phase. */
export function nextBlockedReason(state: SetupState): string | null {
  const phase = activePhase(state);
  if (phase.kind === 'instructions') {
    return null;
  }
  const r = readiness(state);
  const vacant = state.seats.find((candidate) => !candidate.player);
  if (vacant && phase.id === 'starting-forces') {
    return `Seat ${vacant.index + 1}, ${factionName(vacant.faction)}, is vacant. Turn 1 waits for a replacement who gives their own Ready to play.`;
  }
  if (!r.allReady) {
    return `Waiting for ${r.seated - r.ready} to ready.`;
  }
  if (phase.kind === 'builtin' && state.prediction.status === 'pending') {
    return 'Everyone is ready, but Bene Gesserit has not locked its prediction. Next phase waits for that.';
  }
  return null;
}

export function isPredictor(state: SetupState) {
  return myFaction(state) === 'bene-gesserit';
}

/* The setup seats as the swapping scene's state, so the same tokens stand at the stations with no offers. */
export function toSwapState(state: SetupState): SwapState {
  return {
    meId: state.meId ?? '',
    secondsLeft: 0,
    offers: [],
    seats: state.seats.map((candidate) => ({ index: candidate.index, faction: candidate.faction, player: candidate.player })),
  };
}

function clearReadiness(seatsIn: SetupSeat[]) {
  return seatsIn.map((candidate) => ({ ...candidate, ready: false }));
}

/* The setup rules from #1025: Ready is reversible and locks nothing; Next needs every seat ready and the built-in action done; every visit starts unready. Spawn requests follow #1095 and #1021. */
export function reduceSetup(state: SetupState, action: SetupAction): SetupState {
  const me = mySeat(state);
  switch (action.type) {
    case 'load':
      return setupScenarioState(action.scenario);
    case 'toggleReady':
      if (!me) {
        return state;
      }
      return { ...state, seats: state.seats.map((candidate) => (candidate.index === me.index ? { ...candidate, ready: !candidate.ready } : candidate)) };
    case 'next': {
      if (nextBlockedReason(state)) {
        return state;
      }
      const index = phaseIndex(state);
      if (index + 1 >= SETUP_PHASES.length) {
        return state;
      }
      return { ...state, activePhase: SETUP_PHASES[index + 1].id, seats: clearReadiness(state.seats) };
    }
    case 'previous': {
      const index = phaseIndex(state);
      if (index === 0) {
        return state;
      }
      return { ...state, activePhase: SETUP_PHASES[index - 1].id, seats: clearReadiness(state.seats) };
    }
    case 'predict':
      if (!isPredictor(state) || state.prediction.status === 'locked') {
        return state;
      }
      return { ...state, prediction: { ...state.prediction, faction: action.faction ?? state.prediction.faction, turn: action.turn ?? state.prediction.turn } };
    case 'lockPrediction':
      if (!isPredictor(state)) {
        return state;
      }
      return { ...state, prediction: { ...state.prediction, status: 'locked' } };
    case 'reveal':
      if (!isPredictor(state) || state.prediction.status !== 'locked') {
        return state;
      }
      return { ...state, prediction: { ...state.prediction, revealed: true } };
    case 'approveSpawn': {
      const request = state.requests.find((candidate) => candidate.id === action.request);
      if (!request || !me || request.requestedBy === me.player?.id) {
        return state;
      }
      return {
        ...state,
        requests: state.requests.filter((candidate) => candidate.id !== request.id),
        shared: [...state.shared, { id: request.id, kind: request.kind, name: request.name, count: request.count, origin: `requested by ${request.requestedBy}, approved by ${me.player?.name ?? 'you'}` }],
      };
    }
    case 'dismissSpawn':
      return me ? { ...state, requests: state.requests.filter((candidate) => candidate.id !== action.request) } : state;
    case 'requestSpawn': {
      const option = SPAWN_OPTIONS.find((candidate) => candidate.id === action.option);
      if (!option || !me) {
        return state;
      }
      if (!option.ready) {
        return {
          ...state,
          refusal: { name: option.name, reason: `${option.name} is not ready: ${option.missing}. Approval does not override this; an author fixes it in the asset editor.` },
        };
      }
      if (readiness(state).seated === 1) {
        return { ...state, shared: [...state.shared, { id: `${option.id}-${state.shared.length}`, kind: option.kind, name: option.name, count: option.count, origin: 'spawned directly as the sole player' }] };
      }
      return { ...state, requests: [...state.requests, { id: `${option.id}-${state.requests.length}`, requestedBy: me.player?.id ?? '', kind: option.kind, name: option.name, count: option.count }] };
    }
    case 'dismissRefusal':
      return { ...state, refusal: null };
    case 'approveSeat': {
      const request = state.seatRequests.find((candidate) => candidate.id === action.request);
      if (!request || !me) {
        return state;
      }
      return {
        ...state,
        seatRequests: state.seatRequests.filter((candidate) => candidate.id !== request.id),
        seats: state.seats.map((candidate) => (candidate.index === request.seat ? { ...candidate, player: swapPlayer(request.slug, false), ready: false, connected: true } : candidate)),
      };
    }
    default:
      return state;
  }
}
