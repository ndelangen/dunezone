import { addons } from 'storybook/preview-api';

import { PLAY_DEBUGGER_EVENTS } from './events';
import type { DebuggerAction, DebuggerState, DebuggerTimeline, TrafficDirection, TrafficEntry } from './events';

/*
 * The preview half of the Play debugger. It keeps nothing on the page: a story's transport reports each message that
 * crosses its socket here, the story describes the table behind the socket, and the panel in the manager shows both.
 */

/** What drives a story's page, as the story describes it to the debugger. */
export type DebuggerSource = {
  title: string;
  description: string;
  timeline?: () => DebuggerTimeline;
  /* Extra roots for the state inspector beside the page's newest view, as the table's own state. */
  inspect?: () => Record<string, unknown>;
  actions?: (DebuggerAction & { run: () => void })[];
};

/* Batches leave a few times a second, so a drag's stream of messages does not flood the channel. */
const FLUSH_MS = 200;
/* The panel keeps a long history; the preview only holds what it has not sent. */
const KEPT = 2000;

type Action = NonNullable<DebuggerSource['actions']>[number];

const session: {
  source: DebuggerSource;
  /* The socket's own actions, kept when a story describes what drives the page. */
  socketActions: Action[];
  startedAt: number;
  sequence: number;
  /* Everything this socket carried, for a panel that opens late. */
  history: TrafficEntry[];
  pending: TrafficEntry[];
  view: string | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  listening: boolean;
} = {
  source: { title: 'Scripted story', description: '' },
  socketActions: [],
  startedAt: 0,
  sequence: 0,
  history: [],
  pending: [],
  view: null,
  timer: undefined,
  listening: false,
};

const channel = () => addons.getChannel();

function state(): DebuggerState {
  const { source } = session;
  const inspect: Record<string, string> = {};
  if (session.view) {
    inspect['Page view'] = session.view;
  }
  for (const [name, value] of Object.entries(source.inspect?.() ?? {})) {
    inspect[name] = JSON.stringify(value) ?? 'null';
  }
  return {
    title: source.title,
    description: source.description,
    timeline: source.timeline?.() ?? null,
    actions: (source.actions ?? []).map(({ id, label, description }) => ({ id, label, description })),
    inspect,
  };
}

function flush() {
  session.timer = undefined;
  if (session.pending.length) {
    channel().emit(PLAY_DEBUGGER_EVENTS.traffic, session.pending);
    session.pending = [];
  }
  channel().emit(PLAY_DEBUGGER_EVENTS.state, state());
}

function schedule() {
  session.timer ??= setTimeout(flush, FLUSH_MS);
}

function listen() {
  if (session.listening) {
    return;
  }
  session.listening = true;
  channel().on(PLAY_DEBUGGER_EVENTS.request, () => {
    channel().emit(PLAY_DEBUGGER_EVENTS.reset);
    session.pending = [...session.history];
    flush();
  });
  channel().on(PLAY_DEBUGGER_EVENTS.clear, () => {
    session.history = [];
    session.pending = [];
  });
  /* A panel still showing a story that has moved on may ask for an action the new one lacks. */
  channel().on(PLAY_DEBUGGER_EVENTS.act, (id: string) => {
    if (session.source.actions?.some((candidate) => candidate.id === id)) {
      runDebuggerAction(id);
    }
  });
}

/** Runs one of the story's actions, as its button on the panel does. */
function runDebuggerAction(id: string) {
  const action = session.source.actions?.find((candidate) => candidate.id === id);
  if (!action) {
    throw new Error(`The story offers no debugger action ${id}.`);
  }
  note(action.label);
  action.run();
  schedule();
}

function record(direction: TrafficDirection, type: string, summary: string, json: string) {
  const entry: TrafficEntry = {
    sequence: ++session.sequence,
    at: Math.round(performance.now() - session.startedAt),
    direction,
    type,
    summary,
    json,
  };
  session.history.push(entry);
  if (session.history.length > KEPT) {
    session.history.splice(0, session.history.length - KEPT);
  }
  session.pending.push(entry);
  schedule();
}

/** A new socket for a story: the debugger's history starts over and the story is described afresh. */
export function beginDebugging(source: DebuggerSource) {
  listen();
  clearTimeout(session.timer);
  Object.assign(session, {
    source,
    socketActions: source.actions ?? [],
    startedAt: performance.now(),
    sequence: 0,
    history: [],
    pending: [],
    view: null,
    timer: undefined,
  });
  channel().emit(PLAY_DEBUGGER_EVENTS.reset);
  schedule();
}

/** Replaces what drives the page, as a replay or a live table taking over a socket a scripted transport opened; the socket's own actions stay. */
export function describeDebugging(source: DebuggerSource) {
  session.source = { ...source, actions: [...(source.actions ?? []), ...session.socketActions] };
  schedule();
}

/** Tells the panel the story's state moved without a message crossing the socket. */
export function debuggingChanged() {
  schedule();
}

/** A note in the history from the story itself, as a step the debugger moved to. */
export function note(summary: string) {
  record('story', 'note', summary, JSON.stringify({ note: summary }));
}

/** One line naming a message: its type and what it carried. */
function summarize(message: Record<string, unknown>) {
  const action = message.action as { kind?: string } | undefined;
  const parts = [
    action?.kind,
    typeof message.tab === 'string' ? message.tab : undefined,
    typeof message.commandId === 'string' ? message.commandId : undefined,
    typeof message.completedCommandId === 'string' ? `completes ${message.completedCommandId}` : undefined,
    typeof message.reason === 'string' ? message.reason : undefined,
    typeof message.error === 'string' ? message.error : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** A message that crossed the socket, as the JSON text that crossed it; keepalives are left out. */
export function traffic(direction: 'sent' | 'received', json: string) {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return;
  }
  const type = typeof message.type === 'string' ? message.type : 'unknown';
  if (direction === 'received' && type === 'view') {
    session.view = json;
  }
  record(direction, type, summarize(message), json);
}
