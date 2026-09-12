/*
 * PROTOTYPE: throwaway drafting fixture for #1142 and #1145. In-memory only, never persisted, never merged.
 * Real factions and real profiles from the catalogue snapshots beside this file; the accepted drafting and swapping variants on the existing /play/demo route, switchable via ?variant=.
 */
import { CATALOGUE_FACTIONS } from './catalogue.fixture';
import type { CatalogueFactionFixture } from './catalogue.fixture';
import { PROFILES } from './profiles.fixture';
import type { ProfileFixture } from './profiles.fixture';

export type DraftVariant = 'drafting' | 'swapping' | 'setup' | 'play' | 'tokens';
export const DRAFT_VARIANTS: readonly DraftVariant[] = ['drafting', 'swapping', 'setup', 'play', 'tokens'];

/* PROTOTYPE (#1145): the five states the drafting panel must show, switchable via ?scenario=. */
export type Scenario = 'creator' | 'spectator' | 'approve' | 'drafting' | 'short';
export const SCENARIOS: readonly Scenario[] = ['creator', 'spectator', 'approve', 'drafting', 'short'];
export const SCENARIO_NAMES: Record<Scenario, string> = {
  creator: 'Creator seated alone after /play/create',
  spectator: 'Spectator offered a seat request',
  approve: 'Seated player with a request to approve',
  drafting: 'Full roster mid-drafting, one ban, one ready, mismatch warning',
  short: 'Eligible pool too small',
};

/* The captured faces of the real tokens, one PNG per faction slug, shot from the ?variant=tokens gallery. Missing until captured. */
const TOKEN_IMAGES = import.meta.glob('./tokens/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function tokenImageFor(slug: string): string | undefined {
  return TOKEN_IMAGES[`./tokens/${slug}.png`];
}

export type Faction = CatalogueFactionFixture & {
  id: string;
  /* The faction's theme colour: the cylinder side and the arrow colour on the table. */
  colour: string;
  tokenImage: string | undefined;
  /* Linked to the game's ruleset: shown first, used for random filling. */
  suitable: boolean;
  /* Generated and published: only these can be drafted. */
  eligible: boolean;
  /* Why it cannot be drafted, when it cannot; an author fixes it in the faction editor. */
  blocked?: string;
};

const GAME_RULESET = 'dreamrules';

export const FACTIONS: readonly Faction[] = CATALOGUE_FACTIONS.map((entry) => ({
  ...entry,
  id: entry.slug,
  colour: entry.themeColor,
  tokenImage: tokenImageFor(entry.slug),
  suitable: entry.rulesets.includes(GAME_RULESET),
  eligible: entry.published,
  blocked: entry.published ? undefined : 'Not generated yet: its assets have not been published.',
}));

export type Player = {
  id: string;
  slug: string;
  name: string;
  initials: string;
  avatar: string;
  ready: boolean;
  picks: string[];
  bans: string[];
};

/* A spectator asking for a seat; one existing player's approval seats them. */
export type SeatRequest = { id: string; slug: string; name: string; initials: string; avatar: string };

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

function profile(slug: string): ProfileFixture {
  const found = PROFILES.find((candidate) => candidate.slug === slug);
  if (!found) {
    throw new Error(`Unknown profile ${slug}`);
  }
  return found;
}

function player(slug: string, ready: boolean, picks: string[], bans: string[]): Player {
  const p = profile(slug);
  return { id: slug, slug, name: p.username, initials: p.username.slice(0, 2).toUpperCase(), avatar: p.avatarUrl, ready, picks, bans };
}

function request(slug: string): SeatRequest {
  const p = profile(slug);
  return { id: `request-${slug}`, slug, name: p.username, initials: p.username.slice(0, 2).toUpperCase(), avatar: p.avatarUrl };
}

/* The viewer is Thialfi in every seated scenario. */
export const ME = 'thialfi';

export function scenarioState(scenario: Scenario): DraftState {
  switch (scenario) {
    case 'creator':
      return { scenario, seatCount: 6, meId: ME, myRequest: false, players: [player(ME, false, [], [])], requests: [] };
    case 'spectator':
      return {
        scenario,
        seatCount: 6,
        meId: null,
        myRequest: false,
        players: [
          player('twaffle', true, ['house-atreides', 'spacing-guild'], ['ixians']),
          player('fectumbra', false, ['house-harkonnen', 'bene-gesserit'], []),
          player('erickenneth', false, ['emperor'], []),
        ],
        requests: [],
      };
    case 'approve':
      return {
        scenario,
        seatCount: 6,
        meId: ME,
        myRequest: false,
        players: [
          player('twaffle', true, ['house-atreides', 'spacing-guild'], ['ixians']),
          player(ME, false, ['fremen'], []),
          player('fectumbra', false, ['house-harkonnen', 'bene-gesserit'], []),
          player('erickenneth', false, ['emperor'], []),
        ],
        requests: [request('klyzx')],
      };
    case 'drafting':
      /* Six seated, one ban, one ready, nine distinct picks for six players: a random subset will apply. */
      return {
        scenario,
        seatCount: 6,
        meId: ME,
        myRequest: false,
        players: [
          player('twaffle', true, ['house-atreides', 'spacing-guild'], ['ixians']),
          player(ME, false, ['fremen'], []),
          player('fectumbra', false, ['house-harkonnen', 'bene-gesserit'], []),
          player('erickenneth', false, ['emperor'], []),
          player('ridwan', false, ['ecaz-ecaz-moritani', 'moritani-ecaz-moritani'], []),
          player('argelius', false, ['bene-tleilax'], []),
        ],
        requests: [],
      };
    case 'short':
      /* Five seated; bans on four suitable factions leave two picks and too few suitable factions to fill with. */
      return {
        scenario,
        seatCount: 6,
        meId: ME,
        myRequest: false,
        players: [
          player('twaffle', false, ['house-atreides'], ['house-harkonnen', 'emperor', 'ixians']),
          player(ME, false, ['fremen'], []),
          player('fectumbra', false, [], ['spacing-guild', 'bene-gesserit', 'bene-tleilax']),
          player('erickenneth', false, [], ['iduali', 'ecaz-ecaz-moritani']),
          player('ridwan', false, [], []),
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
  return players.map((candidate) => ({ ...candidate, ready: false }));
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
          state.players.map((candidate) => (candidate.id === current.id ? { ...candidate, picks: [...candidate.picks, action.faction] } : candidate))
        ),
      };
    }
    case 'unpick':
      return {
        ...state,
        players: clearReadiness(
          state.players.map((candidate) =>
            candidate.id === current.id ? { ...candidate, picks: candidate.picks.filter((id) => id !== action.faction) } : candidate
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
          state.players.map((candidate) => ({
            ...candidate,
            picks: candidate.picks.filter((id) => id !== action.faction),
            bans: candidate.id === current.id ? [...candidate.bans, action.faction] : candidate.bans,
          }))
        ),
      };
    }
    case 'unban':
      return {
        ...state,
        players: clearReadiness(
          state.players.map((candidate) =>
            candidate.id === current.id ? { ...candidate, bans: candidate.bans.filter((id) => id !== action.faction) } : candidate
          )
        ),
      };
    case 'toggleReady':
      return {
        ...state,
        players: state.players.map((candidate) => (candidate.id === current.id ? { ...candidate, ready: !candidate.ready } : candidate)),
      };
    case 'approve': {
      const pending = state.requests.find((candidate) => candidate.id === action.request);
      if (!pending || state.players.length >= state.seatCount) {
        return state;
      }
      /* A roster change clears everyone's readiness. */
      return {
        ...state,
        requests: state.requests.filter((candidate) => candidate.id !== pending.id),
        players: clearReadiness([...state.players, { ...player(pending.slug, false, [], []) }]),
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
  return state.players.some((candidate) => candidate.bans.includes(id));
}

export function bannersOf(state: DraftState, id: string) {
  return state.players.filter((candidate) => candidate.bans.includes(id));
}

export function pickersOf(state: DraftState, id: string) {
  return state.players.filter((candidate) => candidate.picks.includes(id));
}

/* The viewer as a player, or null for a spectator. */
export function me(state: DraftState): Player | null {
  return state.players.find((candidate) => candidate.id === state.meId) ?? null;
}

/* The drafted pool: every distinct pick that is not banned. */
export function pool(state: DraftState): string[] {
  const ids: string[] = [];
  for (const candidate of state.players) {
    for (const id of candidate.picks) {
      if (!ids.includes(id) && !isBanned(state, id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

export function bannedIds(state: DraftState): string[] {
  const ids: string[] = [];
  for (const candidate of state.players) {
    for (const id of candidate.bans) {
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
  const ready = state.players.filter((candidate) => candidate.ready).length;
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

export function gateStatus(g: Gates): string {
  return !g.enoughFactions ? 'Not enough factions in the pool' : !g.allReady ? `Waiting for ${g.seated - g.ready} to ready` : 'Assigning seats...';
}

/* The #1010 warnings: non-blocking when the distinct drafted count differs from the player count, blocking when the eligible pool is too small. */
export type DraftWarning = { kind: 'none' } | { kind: 'fill' | 'subset'; text: string } | { kind: 'short'; text: string };

export function draftWarning(state: DraftState): DraftWarning {
  const g = gates(state);
  const players = `${g.seated} ${g.seated === 1 ? 'player' : 'players'}`;
  if (!g.enoughFactions) {
    const missing = g.seated - g.poolSize - g.fillable;
    return {
      kind: 'short',
      text: `The pool is too small for ${players}: ${g.poolSize} drafted and ${g.fillable} suitable ${g.fillable === 1 ? 'faction' : 'factions'} left to fill with, ${missing} short. Remove a ban or draft more factions before anyone can be dealt.`,
    };
  }
  if (g.poolSize < g.seated) {
    const add = g.seated - g.poolSize;
    return {
      kind: 'fill',
      text: `${g.poolSize} ${g.poolSize === 1 ? 'faction is' : 'factions are'} drafted for ${players}: ${add} random suitable ${add === 1 ? 'faction' : 'factions'} will be added at assignment.`,
    };
  }
  if (g.poolSize > g.seated) {
    return { kind: 'subset', text: `${g.poolSize} factions are drafted for ${players}: a random ${g.seated} of them will be dealt.` };
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
