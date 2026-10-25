import { TopicIcon } from '@ui/content/TopicIcon';
import type { ReactNode } from 'react';

import type { TableView } from '../../../../widgets/tabletop/playView';
import { PlayerToken } from './PlayerToken';
import type { PlayerTab, TableWindow } from './windows';

/** One line under the search field: a window to open or a command to run. */
export type Suggestion = Readonly<{ key: string; label: string; hint: string; icon: ReactNode; run: () => void }>;

type Candidate = Suggestion & Readonly<{ text: string; weight: number }>;

/* How many suggestions show with nothing typed, and once something is. */
const SUGGESTED = 6;
const MATCHES = 8;

const CAMERA_VIEWS: Record<TableView, string> = {
  map: 'board',
  left: 'left bay',
  right: 'right bay',
  bottom: 'bottom bay',
};

/** Letters in order, anywhere in the text: "shinv" finds Shared inventory. Earlier and closer letters score higher. */
export function fuzzy(text: string, query: string): number | null {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, '');
  let score = 0;
  let from = 0;
  for (const letter of needle) {
    const at = haystack.indexOf(letter, from);
    if (at < 0) {
      return null;
    }
    score += letterScore(haystack, at, from);
    from = at + 1;
  }
  return score - haystack.length * 0.01;
}

/* A letter right after the last one scores most, one starting a word next, any other least. */
function letterScore(haystack: string, at: number, from: number) {
  if (at === from) {
    return 3;
  }
  return at === 0 || haystack[at - 1] === ' ' ? 2 : 1;
}

/* What a window's line says under its name: the player's faction and unread count, or the window's group or description. */
function hintOf(entry: TableWindow) {
  if (entry.player) {
    const unread = entry.player.unread ? ` · ${entry.player.unread} unread` : '';
    return `${entry.player.factionName ?? 'Player'}${unread}`;
  }
  return entry.group === entry.label ? (entry.description ?? '') : entry.group;
}

/* With nothing typed, unread chats and the phase lead; the player's own window trails. */
function weightOf(entry: TableWindow) {
  return (entry.player?.unread ?? 0) * 10 + (entry.key === 'phase' ? 5 : 0) + (entry.player?.own ? -5 : 0);
}

/** The suggestions for what is typed: the best matches, or with nothing typed the windows and commands worth reaching first. */
export function rankSuggestions(all: readonly Candidate[], query: string): Suggestion[] {
  if (!query.trim()) {
    return [...all].sort((a, b) => b.weight - a.weight).slice(0, SUGGESTED);
  }
  return all
    .map((entry) => ({ entry, score: fuzzy(entry.text, query) }))
    .filter((match): match is { entry: Candidate; score: number } => match.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MATCHES)
    .map((match) => match.entry);
}

export type SuggestionActions = Readonly<{
  /** Opens a window, on a player's tab where one is asked for. */
  open: (key: string, tab?: PlayerTab) => void;
  /** Steps the table to the next phase; null while the table refuses it, as the header's button is then disabled. */
  nextPhase: (() => void) | null | undefined;
  /** Moves the camera, as the dial does. */
  view: (view: TableView) => void;
  /** The viewer's own faction token on the table, when they have one. */
  token: Readonly<{ faceUp: boolean; flip: () => void }> | null | undefined;
  /** Closes the compass before a command runs. */
  close: () => void;
}>;

/* Turning the token over, and passing with it: facing it down says the faction sits out, so a token already down has no Pass. */
function tokenCandidates(actions: SuggestionActions): Candidate[] {
  const token = actions.token;
  if (!token) {
    return [];
  }
  const run = () => {
    actions.close();
    token.flip();
  };
  const icon = <TopicIcon topic="flip" size={18} />;
  return [
    {
      key: 'cmd:token:flip',
      label: 'Flip faction token',
      hint: 'Command',
      icon,
      run,
      text: 'flip faction token',
      weight: 0,
    },
    ...(token.faceUp
      ? [
          {
            key: 'cmd:token:pass',
            label: 'Pass',
            hint: 'Command: your token face down',
            icon,
            run,
            text: 'pass',
            weight: 0,
          },
        ]
      : []),
  ];
}

/** Every window and command the search can reach. */
export function candidatesOf(windows: readonly TableWindow[], actions: SuggestionActions): Candidate[] {
  return [
    ...windows.map((entry): Candidate => ({
      key: entry.key,
      label: entry.label,
      hint: hintOf(entry),
      icon: entry.player ? (
        <PlayerToken player={entry.player} size={20} />
      ) : (
        <TopicIcon topic={entry.topic} size={18} />
      ),
      run: () => actions.open(entry.key),
      text: `${entry.label} ${entry.player?.factionName ?? ''} ${entry.group}`,
      weight: weightOf(entry),
    })),
    {
      key: 'cmd:next',
      label: 'Next phase',
      hint: 'Command',
      icon: <TopicIcon topic="turn" size={18} />,
      run: () => {
        actions.close();
        actions.nextPhase?.();
      },
      text: 'next phase',
      weight: 4,
    },
    ...tokenCandidates(actions),
    ...(Object.keys(CAMERA_VIEWS) as TableView[]).map((view): Candidate => ({
      key: `cmd:camera:${view}`,
      label: `Camera: ${CAMERA_VIEWS[view]}`,
      hint: 'Command',
      icon: <TopicIcon topic="board" size={18} />,
      run: () => {
        actions.close();
        actions.view(view);
      },
      text: `camera ${view} view`,
      weight: 0,
    })),
  ];
}
