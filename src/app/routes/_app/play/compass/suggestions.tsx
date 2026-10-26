import { TopicIcon } from '@ui/content/TopicIcon';
import type { ReactNode } from 'react';

import type { TableView } from '../../../../widgets/tabletop/playView';
import { PlayerToken } from './PlayerToken';
import { SHORTCUTS } from './shortcuts';
import type { Command, TableCommand } from './shortcuts';
import type { PlayerTab, TableWindow } from './windows';

/** One line under the search field: a window to open or a command to run. */
export type Suggestion = Readonly<{
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
  /** The letter that does the same with the compass shut. */
  shortcut?: string;
}>;

type Candidate = Suggestion & Readonly<{ text: string; weight: number }>;

/* How many suggestions show with nothing typed, and once something is. */
const SUGGESTED = 6;
const MATCHES = 8;

/* U turns the camera straight down whenever Flip faction token up does not have it (useCompass.ts). */
const TOP_VIEW_SHORTCUT = SHORTCUTS.faceUp;

const CAMERA_VIEWS: Record<TableView, string> = {
  map: 'board',
  left: 'left bay',
  right: 'right bay',
  bottom: 'bottom bay',
  top: 'top-down',
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
  /** The table's lettered commands, each null while the table does not offer it. */
  commands: Readonly<Record<Command, TableCommand | null>>;
  /** The letter of each window an arm of the compass opens, by the window's key. */
  shortcuts: Readonly<Record<string, string>>;
  /** Closes the compass before a command runs. */
  close: () => void;
}>;

/* What each lettered command is called, and the words it is found by. */
const COMMANDS: Readonly<Record<Command, Readonly<{ label: string; text: string }>>> = {
  pass: { label: 'Pass', text: 'pass' },
  raise: { label: 'Up the bid by 1', text: 'up raise the bid by 1 one' },
  lower: { label: 'Lower the bid', text: 'lower the bid down' },
  faceUp: { label: 'Flip faction token up', text: 'flip faction token up face up' },
};

/* Turning the token over, and the lettered commands the table offers now: a bid while the bidder points at the viewer. */
function commandCandidates(actions: SuggestionActions): Candidate[] {
  const icon = <TopicIcon topic="flip" size={18} />;
  const token = actions.token;
  const flip: Candidate[] = token
    ? [
        {
          key: 'cmd:token:flip',
          label: 'Flip faction token',
          hint: 'Command',
          icon,
          run: () => {
            actions.close();
            token.flip();
          },
          text: 'flip faction token',
          weight: 0,
        },
      ]
    : [];
  const lettered = (Object.keys(COMMANDS) as Command[]).flatMap((command): Candidate[] => {
    const offered = actions.commands[command];
    if (!offered) {
      return [];
    }
    const bid = command === 'raise' || command === 'lower';
    return [
      {
        key: `cmd:${command}`,
        label: COMMANDS[command].label,
        hint: offered.hint,
        icon: bid ? <TopicIcon topic="bidding" size={18} /> : icon,
        run: () => {
          actions.close();
          offered.run();
        },
        shortcut: SHORTCUTS[command],
        text: COMMANDS[command].text,
        /* A bid waiting on the viewer leads the suggestions. */
        weight: bid ? 6 : 0,
      },
    ];
  });
  return [...lettered, ...flip];
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
      shortcut: actions.shortcuts[entry.key],
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
    ...commandCandidates(actions),
    ...(Object.keys(CAMERA_VIEWS) as TableView[]).map((view): Candidate => ({
      key: `cmd:camera:${view}`,
      label: `Camera: ${CAMERA_VIEWS[view]}`,
      hint: 'Command',
      icon: <TopicIcon topic="board" size={18} />,
      run: () => {
        actions.close();
        actions.view(view);
      },
      /* U turns the camera straight down, unless it is flipping the viewer's token up just now. */
      shortcut: view === 'top' && !actions.commands.faceUp ? TOP_VIEW_SHORTCUT : undefined,
      text: `camera ${view} view ${CAMERA_VIEWS[view]}`,
      weight: 0,
    })),
  ];
}
