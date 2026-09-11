/*
 * PROTOTYPE: throwaway drafting fixture for #1142 and #1145. In-memory only, never persisted, never merged.
 * The accepted drafting and swapping variants and the three creation-and-drafting panel variants on the existing /play/demo route, switchable via ?variant=.
 */

export type DraftVariant = 'drafting' | 'swapping' | 'sidecar' | 'tabs' | 'shelf';
export const DRAFT_VARIANTS: readonly DraftVariant[] = ['drafting', 'swapping', 'sidecar', 'tabs', 'shelf'];

/* PROTOTYPE (#1145): the five states every panel variant must show, switchable via ?scenario=. */
export type Scenario = 'creator' | 'spectator' | 'approve' | 'drafting' | 'short';
export const SCENARIOS: readonly Scenario[] = ['creator', 'spectator', 'approve', 'drafting', 'short'];
export const SCENARIO_NAMES: Record<Scenario, string> = {
  creator: 'Creator seated alone after /play/create',
  spectator: 'Spectator offered a seat request',
  approve: 'Seated player with a request to approve',
  drafting: 'Full roster mid-drafting, one ban, one ready, mismatch warning',
  short: 'Eligible pool too small',
};

export type Faction = {
  id: string;
  name: string;
  colour: string;
  logo: string;
  /* Linked to the game's ruleset: shown first, used for random filling. */
  suitable: boolean;
  /* Generated and complete: only these can be drafted. */
  eligible: boolean;
  /* Why it cannot be drafted, when it cannot; an author fixes it in the faction editor. */
  blocked?: string;
};

export const FACTIONS: readonly Faction[] = [
  { id: 'atreides', name: 'Atreides', colour: '#5f6114', logo: '/vector/logo/atreides.svg', suitable: true, eligible: true },
  { id: 'harkonnen', name: 'Harkonnen', colour: '#2a1f1b', logo: '/vector/logo/harkonnen.svg', suitable: true, eligible: true },
  { id: 'emperor', name: 'Emperor', colour: '#a40008', logo: '/vector/logo/emperor.svg', suitable: true, eligible: true },
  { id: 'guild', name: 'Spacing Guild', colour: '#d83c13', logo: '/vector/logo/guild.svg', suitable: true, eligible: true },
  { id: 'fremen', name: 'Fremen', colour: '#f6a834', logo: '/vector/logo/fremen.svg', suitable: true, eligible: true },
  { id: 'bene-gesserit', name: 'Bene Gesserit', colour: '#3a4491', logo: '/vector/logo/bene-gesserit.svg', suitable: true, eligible: true },
  { id: 'ixian', name: 'Ixian', colour: '#d4be6b', logo: '/vector/logo/ixian.svg', suitable: false, eligible: true },
  { id: 'bene-tleilaxu', name: 'Bene Tleilaxu', colour: '#6e008f', logo: '/vector/logo/bene-tleilaxu.svg', suitable: false, eligible: true },
  { id: 'choam', name: 'CHOAM', colour: '#7a5a2a', logo: '/vector/logo/choam.svg', suitable: false, eligible: true },
  { id: 'richese', name: 'Richese', colour: '#b5b0a5', logo: '/vector/logo/richese.svg', suitable: false, eligible: true },
  { id: 'ecaz', name: 'Ecaz', colour: '#7f3d81', logo: '/vector/logo/ecaz.svg', suitable: false, eligible: true },
  { id: 'moritani', name: 'Moritani', colour: '#0b4d64', logo: '/vector/logo/moritani.svg', suitable: false, eligible: true },
  { id: 'ginaz', name: 'Ginaz', colour: '#425a61', logo: '/vector/logo/ginaz.svg', suitable: false, eligible: false, blocked: 'Its Extra is incomplete: the leader sheet has no portrait yet.' },
  { id: 'landsraad', name: 'Landsraad', colour: '#520e2d', logo: '/vector/generic/landsraad.svg', suitable: false, eligible: true },
  { id: 'iduali', name: 'Iduali', colour: '#5b2802', logo: '/vector/logo/iduali.svg', suitable: false, eligible: false, blocked: 'Not generated yet: its assets have never been built.' },
];

export type Player = {
  id: string;
  name: string;
  initials: string;
  colour: string;
  ready: boolean;
  picks: string[];
  bans: string[];
};

/* A spectator asking for a seat; one existing player's approval seats them. */
export type SeatRequest = { id: string; name: string; initials: string; colour: string };

export type DraftState = {
  scenario: Scenario;
  /* Seats at this table; the game's seat count is fixed at the first assignment. */
  seatCount: number;
  /* The viewer's player id, or null when the viewer is a spectator. */
  meId: string | null;
  /* A spectator's own pending request. */
  myRequest: boolean;
  players: Player[];
  requests: SeatRequest[];
};

const MARA: Player = { id: 'p0', name: 'Mara', initials: 'MA', colour: '#63b89d', ready: true, picks: ['atreides', 'guild'], bans: ['ixian'] };
const YOU: Player = { id: 'p1', name: 'You', initials: 'YOU', colour: '#f8af40', ready: false, picks: ['fremen'], bans: [] };
const TEO: Player = { id: 'p2', name: 'Teo', initials: 'TE', colour: '#7aa2f7', ready: false, picks: ['harkonnen', 'bene-gesserit'], bans: [] };
const INES: Player = { id: 'p3', name: 'Ines', initials: 'IN', colour: '#e07a5f', ready: false, picks: ['emperor'], bans: [] };
const KOFI: Player = { id: 'p4', name: 'Kofi', initials: 'KO', colour: '#c792ea', ready: false, picks: ['ecaz', 'moritani'], bans: [] };
const SUNI: Player = { id: 'p5', name: 'Suni', initials: 'SU', colour: '#8fd3f4', ready: false, picks: ['bene-tleilaxu'], bans: [] };
const REQUEST_LIAM: SeatRequest = { id: 'r1', name: 'Liam', initials: 'LI', colour: '#d0a0ff' };

export function scenarioState(scenario: Scenario): DraftState {
  switch (scenario) {
    case 'creator':
      return { scenario, seatCount: 6, meId: 'p1', myRequest: false, players: [{ ...YOU, picks: [], bans: [] }], requests: [] };
    case 'spectator':
      return { scenario, seatCount: 6, meId: null, myRequest: false, players: [MARA, TEO, INES], requests: [] };
    case 'approve':
      return { scenario, seatCount: 6, meId: 'p1', myRequest: false, players: [MARA, YOU, TEO, INES], requests: [REQUEST_LIAM] };
    case 'drafting':
      /* Six seated, one ban, one ready, seven distinct picks for six players: a random subset will apply. */
      return { scenario, seatCount: 6, meId: 'p1', myRequest: false, players: [MARA, YOU, TEO, INES, KOFI, SUNI], requests: [] };
    case 'short':
      /* Five seated; bans on four suitable factions leave two picks and one fillable suitable faction: too few. */
      return {
        scenario,
        seatCount: 6,
        meId: 'p1',
        myRequest: false,
        players: [
          { ...MARA, ready: false, picks: ['atreides'], bans: ['harkonnen', 'emperor'] },
          { ...YOU, picks: ['fremen'], bans: [] },
          { ...TEO, picks: [], bans: ['guild', 'bene-gesserit'] },
          { ...INES, picks: [], bans: [] },
          { ...KOFI, picks: [], bans: [] },
        ],
        requests: [],
      };
    default:
      return scenarioState('drafting');
  }
}

export const INITIAL_STATE: DraftState = scenarioState('drafting');

export type DraftAction =
  | { type: 'pick'; faction: string }
  | { type: 'unpick'; faction: string }
  | { type: 'ban'; faction: string }
  | { type: 'unban'; faction: string }
  | { type: 'toggleReady' }
  | { type: 'requestSeat' }
  | { type: 'withdrawRequest' }
  | { type: 'approve'; request: string }
  | { type: 'load'; scenario: Scenario };

function clearReadiness(players: Player[]) {
  return players.map((player) => ({ ...player, ready: false }));
}

/* The drafting rules from #1010: a ban strips every pick and blocks new ones; any change clears everyone's readiness. Seat requests from #1011: any seated player approves. */
export function reduceDraft(state: DraftState, action: DraftAction): DraftState {
  if (action.type === 'load') {
    return scenarioState(action.scenario);
  }
  if (action.type === 'requestSeat') {
    return state.meId === null ? { ...state, myRequest: true } : state;
  }
  if (action.type === 'withdrawRequest') {
    return { ...state, myRequest: false };
  }
  const current = me(state);
  if (!current) {
    return state;
  }
  switch (action.type) {
    case 'pick': {
      if (isBanned(state, action.faction) || current.picks.includes(action.faction) || !isEligible(action.faction)) {
        return state;
      }
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) => (player.id === current.id ? { ...player, picks: [...player.picks, action.faction] } : player))
        ),
      };
    }
    case 'unpick':
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) =>
            player.id === current.id ? { ...player, picks: player.picks.filter((id) => id !== action.faction) } : player
          )
        ),
      };
    case 'ban': {
      if (current.bans.includes(action.faction)) {
        return state;
      }
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) => ({
            ...player,
            picks: player.picks.filter((id) => id !== action.faction),
            bans: player.id === current.id ? [...player.bans, action.faction] : player.bans,
          }))
        ),
      };
    }
    case 'unban':
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) =>
            player.id === current.id ? { ...player, bans: player.bans.filter((id) => id !== action.faction) } : player
          )
        ),
      };
    case 'toggleReady':
      return {
        ...state,
        players: state.players.map((player) => (player.id === current.id ? { ...player, ready: !player.ready } : player)),
      };
    case 'approve': {
      const request = state.requests.find((candidate) => candidate.id === action.request);
      if (!request || state.players.length >= state.seatCount) {
        return state;
      }
      /* A roster change clears everyone's readiness. */
      return {
        ...state,
        requests: state.requests.filter((candidate) => candidate.id !== request.id),
        players: clearReadiness([
          ...state.players,
          { id: request.id, name: request.name, initials: request.initials, colour: request.colour, ready: false, picks: [], bans: [] },
        ]),
      };
    }
    default:
      return state;
  }
}

export function factionById(id: string): Faction {
  const found = FACTIONS.find((faction) => faction.id === id);
  if (!found) {
    throw new Error(`Unknown faction ${id}`);
  }
  return found;
}

export function isEligible(id: string) {
  return factionById(id).eligible;
}

export function isBanned(state: DraftState, id: string) {
  return state.players.some((player) => player.bans.includes(id));
}

export function bannersOf(state: DraftState, id: string) {
  return state.players.filter((player) => player.bans.includes(id));
}

export function pickersOf(state: DraftState, id: string) {
  return state.players.filter((player) => player.picks.includes(id));
}

/* The viewer as a player, or null for a spectator. */
export function me(state: DraftState): Player | null {
  return state.players.find((player) => player.id === state.meId) ?? null;
}

/* The drafted pool: every distinct pick that is not banned. */
export function pool(state: DraftState): string[] {
  const ids: string[] = [];
  for (const player of state.players) {
    for (const id of player.picks) {
      if (!ids.includes(id) && !isBanned(state, id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

export function bannedIds(state: DraftState): string[] {
  const ids: string[] = [];
  for (const player of state.players) {
    for (const id of player.bans) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

export type Gates = {
  seated: number;
  seatCount: number;
  ready: number;
  poolSize: number;
  /* Suitable, eligible, unbanned factions that random filling could add. */
  fillable: number;
  enoughFactions: boolean;
  allReady: boolean;
  rosterFull: boolean;
};

/* The assignment deals to the players seated at that moment, so the pool is measured against the seated count, not the table's seats. */
export function gates(state: DraftState): Gates {
  const poolIds = pool(state);
  const fillable = FACTIONS.filter(
    (faction) => faction.suitable && faction.eligible && !isBanned(state, faction.id) && !poolIds.includes(faction.id)
  ).length;
  const seated = state.players.length;
  const ready = state.players.filter((player) => player.ready).length;
  return {
    seated,
    seatCount: state.seatCount,
    ready,
    poolSize: poolIds.length,
    fillable,
    enoughFactions: poolIds.length + fillable >= seated,
    allReady: seated > 0 && ready === seated,
    rosterFull: seated === state.seatCount,
  };
}

/* The #1010 warnings: non-blocking when the distinct drafted count differs from the player count, blocking when the eligible pool is too small. */
export type DraftWarning = { kind: 'none' } | { kind: 'fill' | 'subset'; text: string } | { kind: 'short'; text: string };

export function draftWarning(state: DraftState): DraftWarning {
  const g = gates(state);
  if (!g.enoughFactions) {
    const missing = g.seated - g.poolSize - g.fillable;
    return {
      kind: 'short',
      text: `The pool is too small for ${g.seated} ${g.seated === 1 ? 'player' : 'players'}: ${g.poolSize} drafted and ${g.fillable} suitable ${g.fillable === 1 ? 'faction' : 'factions'} left to fill with, ${missing} short. Remove a ban or draft more factions before anyone can be dealt.`,
    };
  }
  if (g.poolSize < g.seated) {
    const add = g.seated - g.poolSize;
    return {
      kind: 'fill',
      text: `${g.poolSize} ${g.poolSize === 1 ? 'faction is' : 'factions are'} drafted for ${g.seated} ${g.seated === 1 ? 'player' : 'players'}: ${add} random suitable ${add === 1 ? 'faction' : 'factions'} will be added at assignment.`,
    };
  }
  if (g.poolSize > g.seated) {
    return {
      kind: 'subset',
      text: `${g.poolSize} factions are drafted for ${g.seated} ${g.seated === 1 ? 'player' : 'players'}: a random ${g.seated} of them will be dealt.`,
    };
  }
  return { kind: 'none' };
}

export function searchFactions(query: string, showAll: boolean): Faction[] {
  const needle = query.trim().toLowerCase();
  return FACTIONS.filter((faction) => (showAll || faction.suitable || needle.length > 0) && faction.name.toLowerCase().includes(needle));
}

/* The plain tag beside a faction name in the list. */
export function factionTag(faction: Faction) {
  return !faction.eligible ? 'not generated' : faction.suitable ? 'suitable for this ruleset' : 'other faction';
}
