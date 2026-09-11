/*
 * PROTOTYPE: throwaway drafting-overlay fixture for #1142. In-memory only, never persisted, never merged.
 * Three variants of the drafting overlay on the existing /play/demo route, switchable via ?variant=.
 */

export type DraftVariant = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export const DRAFT_VARIANTS: readonly DraftVariant[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export type Faction = {
  id: string;
  name: string;
  colour: string;
  logo: string;
  /* Linked to the game's ruleset: shown first, used for random filling. */
  suitable: boolean;
  /* Generated and complete: only these can be drafted. */
  eligible: boolean;
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
  { id: 'ginaz', name: 'Ginaz', colour: '#425a61', logo: '/vector/logo/ginaz.svg', suitable: false, eligible: true },
  { id: 'landsraad', name: 'Landsraad', colour: '#520e2d', logo: '/vector/generic/landsraad.svg', suitable: false, eligible: true },
  { id: 'iduali', name: 'Iduali', colour: '#5b2802', logo: '/vector/logo/iduali.svg', suitable: false, eligible: false },
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

export type DraftState = {
  seatCount: number;
  meId: string;
  players: Player[];
};

export const INITIAL_STATE: DraftState = {
  seatCount: 6,
  meId: 'p1',
  players: [
    { id: 'p0', name: 'Mara', initials: 'MA', colour: '#63b89d', ready: true, picks: ['atreides', 'guild'], bans: ['ixian'] },
    { id: 'p1', name: 'You', initials: 'YOU', colour: '#f8af40', ready: false, picks: ['fremen'], bans: [] },
    { id: 'p2', name: 'Teo', initials: 'TE', colour: '#7aa2f7', ready: false, picks: ['harkonnen', 'bene-gesserit'], bans: ['richese'] },
    { id: 'p3', name: 'Ines', initials: 'IN', colour: '#e07a5f', ready: true, picks: ['emperor'], bans: [] },
    { id: 'p4', name: 'Kofi', initials: 'KO', colour: '#c792ea', ready: false, picks: ['ecaz', 'moritani'], bans: [] },
  ],
};

export type DraftAction =
  | { type: 'pick'; faction: string }
  | { type: 'unpick'; faction: string }
  | { type: 'ban'; faction: string }
  | { type: 'unban'; faction: string }
  | { type: 'toggleReady' };

function clearReadiness(players: Player[]) {
  return players.map((player) => ({ ...player, ready: false }));
}

/* The drafting rules from #1010: a ban strips every pick and blocks new ones; any change clears everyone's readiness. */
export function reduceDraft(state: DraftState, action: DraftAction): DraftState {
  const me = state.players.find((player) => player.id === state.meId);
  if (!me) {
    return state;
  }
  switch (action.type) {
    case 'pick': {
      if (isBanned(state, action.faction) || me.picks.includes(action.faction) || !isEligible(action.faction)) {
        return state;
      }
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) => (player.id === me.id ? { ...player, picks: [...player.picks, action.faction] } : player))
        ),
      };
    }
    case 'unpick':
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) =>
            player.id === me.id ? { ...player, picks: player.picks.filter((id) => id !== action.faction) } : player
          )
        ),
      };
    case 'ban': {
      if (me.bans.includes(action.faction)) {
        return state;
      }
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) => ({
            ...player,
            picks: player.picks.filter((id) => id !== action.faction),
            bans: player.id === me.id ? [...player.bans, action.faction] : player.bans,
          }))
        ),
      };
    }
    case 'unban':
      return {
        ...state,
        players: clearReadiness(
          state.players.map((player) =>
            player.id === me.id ? { ...player, bans: player.bans.filter((id) => id !== action.faction) } : player
          )
        ),
      };
    case 'toggleReady':
      return {
        ...state,
        players: state.players.map((player) => (player.id === me.id ? { ...player, ready: !player.ready } : player)),
      };
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

export function me(state: DraftState): Player {
  const found = state.players.find((player) => player.id === state.meId);
  if (!found) {
    throw new Error('No current player');
  }
  return found;
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
    enoughFactions: poolIds.length + fillable >= state.seatCount,
    allReady: ready === seated,
    rosterFull: seated === state.seatCount,
  };
}

export function searchFactions(query: string, showAll: boolean): Faction[] {
  const needle = query.trim().toLowerCase();
  return FACTIONS.filter((faction) => (showAll || faction.suitable || needle.length > 0) && faction.name.toLowerCase().includes(needle));
}
