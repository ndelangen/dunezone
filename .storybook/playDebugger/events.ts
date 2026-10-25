/*
 * What the Play debugger's preview half and its manager panel say to each other over the Storybook channel.
 * The preview half watches the story's game socket and describes the story's table; the panel shows both and sends back what the viewer asks for.
 * Messages travel as JSON text, so a large view crosses the channel without being walked twice.
 */

export const PLAY_DEBUGGER_ADDON = 'dunezone/play-debugger';
export const PLAY_DEBUGGER_PANEL = `${PLAY_DEBUGGER_ADDON}/panel`;
/** The story parameter that shows the panel: game page stories set it through their shared meta. */
export const PLAY_DEBUGGER_PARAMETER = 'playDebugger';

export const PLAY_DEBUGGER_EVENTS = {
  /** Preview to panel: a new socket opened for a story, so the history starts over. */
  reset: `${PLAY_DEBUGGER_ADDON}/reset`,
  /** Preview to panel: what the story is and the state it holds now. */
  state: `${PLAY_DEBUGGER_ADDON}/state`,
  /** Preview to panel: messages that crossed the socket since the last batch. */
  traffic: `${PLAY_DEBUGGER_ADDON}/traffic`,
  /** Panel to preview: send the whole state and history again, as a panel that opened late asks. */
  request: `${PLAY_DEBUGGER_ADDON}/request`,
  /** Panel to preview: forget the history so far, so a panel that asks again starts from here. */
  clear: `${PLAY_DEBUGGER_ADDON}/clear`,
  /** Panel to preview: run one of the story's actions. */
  act: `${PLAY_DEBUGGER_ADDON}/act`,
} as const;

/** Which way a message crossed the socket, or a note the story itself made. */
export type TrafficDirection = 'sent' | 'received' | 'story';

export type TrafficEntry = {
  /** Counts from 1 for each socket the story opens. */
  sequence: number;
  /** Milliseconds since the story's socket opened. */
  at: number;
  direction: TrafficDirection;
  /** The message's `type`, or `note` for the story's own notes. */
  type: string;
  /** One line naming what the message did. */
  summary: string;
  /** The message as JSON text. */
  json: string;
};

/** A moment a story can be moved to, as a recorded journey step. */
type TimelineStep = {
  index: number;
  code: string;
  title: string;
  detail: string;
  /** The viewer who acted to reach this step, when one did. */
  actor: string | null;
  /** The kind of action that reached this step, when one did. */
  action: string | null;
};

type TimelineViewer = { id: string; label: string };

/** How a story moves through its game: the steps, the viewers, and the arguments the panel sets to move. */
export type DebuggerTimeline = {
  /** What a step means to this story, as "Step" for a replay or "Start from" for a live table. */
  label: string;
  steps: TimelineStep[];
  /** The step indices the story can be moved to; the others are listed for context. */
  reachable: number[];
  current: number;
  viewers: TimelineViewer[];
  viewer: string;
  /** The story argument that holds the 1-based step, and the one that holds the viewer. */
  stepArg: string;
  viewerArg: string;
};

/** One of the story's actions, as a button on the panel. */
export type DebuggerAction = { id: string; label: string; description: string };

export type DebuggerState = {
  /** What drives the page, as "Journey replay" or "Live table". */
  title: string;
  description: string;
  timeline: DebuggerTimeline | null;
  actions: DebuggerAction[];
  /** Named roots for the state inspector, each as JSON text. */
  inspect: Record<string, string>;
};
