/* Throwaway battle states for the layout comparison in #1148. */
import { leadersOf } from './leaders.fixture';

export const BATTLE_VARIANTS = ['A', 'B', 'C'] as const;
export type BattleVariant = (typeof BATTLE_VARIANTS)[number];
export const BATTLE_NAMES = { A: 'Compact callout', B: 'Wide bridge', C: 'Split wings' };
export const BATTLE_SCENARIOS = ['marker', 'claim', 'pending', 'countdown', 'revealed', 'outcome', 'settled'] as const;
export type BattleScenario = (typeof BATTLE_SCENARIOS)[number];
export const isBattleScenario = (value: unknown): value is BattleScenario =>
  BATTLE_SCENARIOS.includes(value as BattleScenario);
export const BATTLE_FACTIONS = ['fremen', 'house-atreides'] as const;
export type BattleSide = 0 | 1;
export type Outcome = 'left' | 'none' | 'right';
export const OUTCOMES = [
  ['left', 'Left side won'],
  ['none', 'No winner'],
  ['right', 'Right side won'],
] as const;
export type Plan = {
  mode: 'max' | 'custom';
  troops: number;
  funded: number;
  adjustment: number;
  leader: string | null;
  cards: string[];
};
export type BattleState = {
  scenario: BattleScenario;
  stage: 'idle' | 'preparing' | 'countdown' | 'revealed' | 'resolved';
  viewer: BattleSide | 'spectator';
  claims: [boolean, boolean];
  ready: [boolean, boolean];
  plans: [Plan, Plan];
  choices: [Outcome | null, Outcome | null];
  deadline: number | null;
  result: Outcome | null;
  moved: string[];
  returned: string[];
  positions: Record<string, [number, number, number]>;
};
export type BattleAction =
  | { type: 'load'; scenario: BattleScenario }
  | { type: 'viewer'; viewer: BattleState['viewer'] }
  | { type: 'start' }
  | { type: 'claim'; side: BattleSide }
  | { type: 'plan'; patch: Partial<Plan> }
  | { type: 'ready'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'cancel' }
  | { type: 'outcome'; outcome: Outcome }
  | { type: 'move'; piece: string; screen?: [number, number]; position?: [number, number, number] }
  | { type: 'return'; piece: string };

/* One authored troop face per fixture faction, cost one and strength one funded or one half unfunded. */
export const troopStrength = (plan: Plan) => (plan.troops - plan.funded) * 0.5 + plan.funded + plan.adjustment;
export function battleScenario(scenario: BattleScenario): BattleState {
  const plans: [Plan, Plan] = BATTLE_FACTIONS.map((faction, i) => ({
    mode: 'max',
    troops: i ? 5 : 6,
    funded: i ? 3 : 4,
    adjustment: 0,
    leader: leadersOf(faction)[0].memberId,
    cards: [i ? 'shield' : 'maulaPistol'],
  })) as [Plan, Plan];
  const stage =
    scenario === 'marker'
      ? 'idle'
      : scenario === 'countdown'
        ? 'countdown'
        : scenario === 'settled'
          ? 'resolved'
          : scenario === 'revealed' || scenario === 'outcome'
            ? 'revealed'
            : 'preparing';
  return {
    scenario,
    stage,
    viewer: 0,
    claims: [true, scenario !== 'claim'],
    ready: [!['marker', 'claim', 'pending'].includes(scenario), !['marker', 'claim'].includes(scenario)],
    plans,
    choices: scenario === 'outcome' ? ['left', 'right'] : [null, null],
    deadline: scenario === 'countdown' ? Date.now() + 5000 : null,
    result: scenario === 'settled' ? 'left' : null,
    moved: [],
    returned: [],
    positions: {},
  };
}
export function reduceBattle(state: BattleState, action: BattleAction): BattleState {
  const side = state.viewer;
  switch (action.type) {
    case 'load':
      return battleScenario(action.scenario);
    case 'viewer':
      return { ...state, viewer: action.viewer };
    case 'start':
      return state.stage === 'idle' || state.stage === 'resolved'
        ? {
            ...battleScenario('claim'),
            scenario: state.scenario,
            viewer: state.viewer,
            claims: [false, false],
            ready: [false, false],
          }
        : state;
    case 'claim': {
      if (state.stage !== 'preparing' || side === 'spectator' || side !== action.side || state.claims[side]) {
        return state;
      }
      const claims = [...state.claims] as [boolean, boolean];
      claims[side] = true;
      return { ...state, claims };
    }
    case 'plan': {
      if (side === 'spectator' || !state.claims[side] || state.ready[side] || state.stage !== 'preparing') {
        return state;
      }
      const prior = state.plans[side];
      const next =
        action.patch.mode && action.patch.mode !== prior.mode
          ? { ...prior, mode: action.patch.mode, troops: 0, funded: 0 }
          : { ...prior, ...action.patch };
      next.troops = Math.max(0, Math.floor(next.troops));
      next.funded = Math.max(0, Math.min(11, next.troops, Math.floor(next.funded)));
      const plans = [...state.plans] as [Plan, Plan];
      plans[side] = next;
      return { ...state, plans };
    }
    case 'ready': {
      if (side === 'spectator' || !state.claims[side] || !['preparing', 'countdown'].includes(state.stage)) {
        return state;
      }
      if (state.deadline !== null && action.now >= state.deadline) {
        return { ...state, stage: 'revealed', deadline: null };
      }
      const ready = [...state.ready] as [boolean, boolean];
      ready[side] = !ready[side];
      const countdown = ready.every(Boolean) && state.claims.every(Boolean);
      return {
        ...state,
        ready,
        stage: countdown ? 'countdown' : 'preparing',
        deadline: countdown ? action.now + 5000 : null,
      };
    }
    case 'tick':
      return state.stage === 'countdown' && state.deadline !== null && action.now >= state.deadline
        ? { ...state, stage: 'revealed', deadline: null }
        : state;
    case 'cancel':
      return side !== 'spectator' && state.stage === 'preparing'
        ? {
            ...battleScenario('marker'),
            scenario: state.scenario,
            viewer: side,
            plans: [
              { ...state.plans[0], funded: 0, leader: null, cards: [] },
              { ...state.plans[1], funded: 0, leader: null, cards: [] },
            ],
          }
        : state;
    case 'outcome': {
      if (side === 'spectator' || state.stage !== 'revealed') {
        return state;
      }
      const choices = [...state.choices] as BattleState['choices'];
      choices[side] = action.outcome;
      const agreed = choices[0] === choices[1];
      return { ...state, choices, stage: agreed ? 'resolved' : 'revealed', result: agreed ? action.outcome : null };
    }
    case 'move':
      return ['revealed', 'resolved'].includes(state.stage) && side !== 'spectator'
        ? {
            ...state,
            moved: state.moved.includes(action.piece) ? state.moved : [...state.moved, action.piece],
            positions: { ...state.positions, [action.piece]: action.position ?? [2.8, 0.3, -1.2] },
          }
        : state;
    case 'return':
      return state.stage === 'revealed' && side !== 'spectator'
        ? {
            ...state,
            returned: [...state.returned, action.piece],
            moved: state.moved.filter((piece) => piece !== action.piece),
          }
        : state;
  }
}
