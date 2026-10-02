import type { playLobbyEntrySchema } from '@shared/play/directory';
import { phaseAt, STANDARD_PHASES, tableProgressFor } from '@shared/play/phases';
import type { z } from 'zod';

/*
 * Shared data for the three lobby design prototypes (#1739).
 * Every design renders these same entries, so the comparison is about layout and not about content.
 * The shape is the real directory entry the lobby query returns today, plus the few extra fields a design might want;
 * the extras are marked so the design session can decide whether the directory should carry them.
 */
export type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;

export type DesignEntry = LobbyEntry & {
  /** Proposed extra: the ruleset the table plays. */
  ruleset: string;
  /** Proposed extra: the player who created the game. */
  host: string;
};

export const VIEWER = 'Thialfi';

/* The fixed "now" every prototype measures ages against, so screenshots and stories never drift. */
export const NOW = Date.parse('2026-10-02T21:00:00Z');
const minutesAgo = (minutes: number) => NOW - minutes * 60_000;

const SIX_FACTIONS = ['Atreides', 'Harkonnen', 'Emperor', 'Fremen', 'Spacing Guild', 'Bene Gesserit'] as const;

function seated(names: readonly string[], factions: readonly (string | null)[] = []) {
  return names.map((displayName, index) => ({ displayName, faction: factions[index] ?? null }));
}

export const ENTRIES: DesignEntry[] = [
  {
    gameId: 'g-sietch-tabr',
    name: 'Sietch Tabr Thursday',
    stage: 'play',
    seatsFilled: 6,
    seatCount: 6,
    viewerSeated: true,
    players: seated(['Twaffle', 'Thialfi', 'Fectumbra', 'Erickenneth', 'Ridwan', 'Argelius'], SIX_FACTIONS),
    phase: 3 * 9 + 6,
    lastActivityAt: minutesAgo(4),
    result: null,
    ruleset: 'Classic rules',
    host: 'Twaffle',
  },
  {
    gameId: 'g-arrakeen-nights',
    name: 'Arrakeen Nights',
    stage: 'drafting',
    seatsFilled: 4,
    seatCount: 6,
    viewerSeated: true,
    players: seated(['Thialfi', 'Morgana', 'Idaho', 'Liet']),
    phase: null,
    lastActivityAt: minutesAgo(18),
    result: null,
    ruleset: 'Dreamrules',
    host: 'Thialfi',
  },
  {
    gameId: 'g-spice-run',
    name: 'Spice run',
    stage: 'drafting',
    seatsFilled: 3,
    seatCount: 5,
    viewerSeated: false,
    players: seated(['Gurney', 'Shadout', 'Jessica']),
    phase: null,
    lastActivityAt: minutesAgo(7),
    result: null,
    ruleset: 'Classic rules',
    host: 'Gurney',
  },
  {
    gameId: 'g-shield-wall',
    name: 'Beyond the Shield Wall',
    stage: 'drafting',
    seatsFilled: 1,
    seatCount: 6,
    viewerSeated: false,
    players: seated(['Feyd']),
    phase: null,
    lastActivityAt: minutesAgo(2),
    result: null,
    ruleset: 'Dreamrules',
    host: 'Feyd',
  },
  {
    gameId: 'g-tuesday-crew',
    name: 'Tuesday crew',
    stage: 'swapping',
    seatsFilled: 6,
    seatCount: 6,
    viewerSeated: false,
    players: seated(
      ['Chani', 'Stilgar', 'Hawat', 'Yueh', 'Rabban', 'Irulan'],
      ['Fremen', 'Bene Gesserit', 'Atreides', 'Ixians', 'Harkonnen', 'Emperor']
    ),
    phase: null,
    lastActivityAt: minutesAgo(35),
    result: null,
    ruleset: 'Classic rules',
    host: 'Chani',
  },
  {
    gameId: 'g-desert-power',
    name: 'Desert power',
    stage: 'setup',
    seatsFilled: 4,
    seatCount: 4,
    viewerSeated: true,
    players: seated(['Thialfi', 'Kynes', 'Alia', 'Leto'], ['Bene Gesserit', 'Fremen', 'Emperor', 'Atreides']),
    phase: null,
    lastActivityAt: minutesAgo(64),
    result: null,
    ruleset: 'Classic rules',
    host: 'Kynes',
  },
  {
    gameId: 'g-great-convention',
    name: 'The Great Convention',
    stage: 'play',
    seatsFilled: 6,
    seatCount: 6,
    viewerSeated: false,
    players: seated(
      ['Margot', 'Hasimir', 'Shaddam', 'Tleilax', 'Esmar', 'Ramallo'],
      ['Spacing Guild', 'Harkonnen', 'Emperor', 'Tleilaxu', 'Atreides', 'Fremen']
    ),
    phase: 7 * 9 + 2,
    lastActivityAt: minutesAgo(140),
    result: null,
    ruleset: 'Dreamrules',
    host: 'Margot',
  },
  {
    gameId: 'g-kanly',
    name: 'Kanly',
    stage: 'finished',
    seatsFilled: 6,
    seatCount: 6,
    viewerSeated: true,
    players: seated(['Twaffle', 'Thialfi', 'Fectumbra', 'Erickenneth', 'Ridwan', 'Argelius'], SIX_FACTIONS),
    phase: 9 * 9 + 8,
    lastActivityAt: minutesAgo(60 * 26),
    result: { kind: 'alliance', factions: ['Fremen', 'Atreides'] },
    ruleset: 'Classic rules',
    host: 'Ridwan',
  },
  {
    gameId: 'g-water-of-life',
    name: 'Water of Life',
    stage: 'finished',
    seatsFilled: 5,
    seatCount: 5,
    viewerSeated: false,
    players: seated(
      ['Chani', 'Gurney', 'Morgana', 'Hawat', 'Feyd'],
      ['Fremen', 'Atreides', 'Bene Gesserit', 'Spacing Guild', 'Harkonnen']
    ),
    phase: 5 * 9 + 8,
    lastActivityAt: minutesAgo(60 * 50),
    result: { kind: 'faction', factions: ['Bene Gesserit'] },
    ruleset: 'Dreamrules',
    host: 'Morgana',
  },
  {
    gameId: 'g-storm-season',
    name: 'Storm season',
    stage: 'finished',
    seatsFilled: 6,
    seatCount: 6,
    viewerSeated: true,
    players: seated(
      ['Thialfi', 'Stilgar', 'Idaho', 'Shadout', 'Rabban', 'Irulan'],
      ['Harkonnen', 'Fremen', 'Atreides', 'Spacing Guild', 'Emperor', 'Bene Gesserit']
    ),
    phase: 9 * 9 + 8,
    lastActivityAt: minutesAgo(60 * 24 * 6),
    result: { kind: 'none', factions: [] },
    ruleset: 'Classic rules',
    host: 'Stilgar',
  },
];

export const STAGE_WORDS: Record<LobbyEntry['stage'], string> = {
  drafting: 'Drafting',
  swapping: 'Swapping',
  setup: 'Setup',
  play: 'In play',
  finished: 'Finished',
  discarded: 'Discarded',
};

/* A game lasts ten turns; the lobby uses this to show how far along a game is. */
export const LAST_TURN = 10;
export const PHASES_PER_TURN = STANDARD_PHASES.length;

/** Where a game stands, in words: "Turn 4 · Shipment and movement" in play, the stage name otherwise. */
export function whereWords(entry: LobbyEntry): string {
  if (entry.stage === 'play' && entry.phase !== null) {
    return `Turn ${tableProgressFor(entry.phase).turn} · ${phaseAt(entry.phase).label}`;
  }
  return STAGE_WORDS[entry.stage];
}

/** The turn a game in play has reached, or null before play. */
export function turnOf(entry: LobbyEntry): number | null {
  return entry.stage === 'play' && entry.phase !== null ? tableProgressFor(entry.phase).turn : null;
}

export function resultWords(result: LobbyEntry['result']): string | null {
  switch (result?.kind) {
    case undefined:
      return null;
    case 'none':
      return 'No winner';
    case 'faction':
      return `${result.factions.join(', ')} won`;
    case 'alliance':
      return `${result.factions.join(' and ')} won together`;
  }
}

/** "4 min ago", "2 h ago", "6 days ago", measured against the fixed NOW. */
export function ageWords(timestamp: number): string {
  const minutes = Math.round((NOW - timestamp) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const openSeats = (entry: LobbyEntry) => entry.seatCount - entry.seatsFilled;

/** A game the viewer could still join: before play, with a free seat, and not already theirs. */
export const joinable = (entry: LobbyEntry) =>
  entry.stage === 'drafting' && openSeats(entry) > 0 && !entry.viewerSeated;

export const RULESETS = ['Classic rules', 'Dreamrules'] as const;
