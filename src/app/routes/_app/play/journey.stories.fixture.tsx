import type { LogEntry, LogTab } from '@shared/play/log';
import type { ClientMessage, ServerMessage, Viewer } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { UPDATE_STORY_ARGS } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';

import { StorybookPage } from '../../storybook';
import recording from './journey.recording/journey.json';
import styles from './journey.stories.module.css';
import { storyTransport } from './storyTransport';

/*
 * The Play journey: one real six-seat game the game Worker played in `workers/game/journey.record.native.test.mjs`,
 * replayed step by step. Each step holds the full view every seat and a spectator received, so the page renders engine
 * output. `bun run play:record` records it again after a rules change.
 */

type View = Extract<ServerMessage, { type: 'view' }>;
type RecordedView = Omit<View, 'type'>;
type Action = { kind: string } & Record<string, unknown>;
export type JourneyStep = {
  title: string;
  detail: string;
  /* The seat that acted to reach this step, when one did. */
  actor: string | null;
  action: Action | null;
  /* The newest public log entry at this step. */
  logSequence: number;
  views: Record<string, RecordedView>;
};
type Recording = {
  steps: unknown[];
  pool: Record<string, unknown>;
  log: Record<LogTab, LogEntry[]>;
};

const ORIGIN_TOKEN = '{{origin}}';

/* The recording interns repeated values as `{ "$": key }`; resolving shares one object per key. */
function resolver({ pool }: Recording) {
  const resolved = new Map<string, unknown>();
  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.includes(ORIGIN_TOKEN) ? value.replaceAll(ORIGIN_TOKEN, location.origin) : value;
    }
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(resolve);
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$') {
      const key = (value as { $: string }).$;
      if (!resolved.has(key)) {
        resolved.set(key, resolve(pool[key]));
      }
      return resolved.get(key);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry)]));
  };
  return resolve;
}

let cached: JourneyStep[] | undefined;
/** Every recorded step, in order. */
export function journeySteps(): JourneyStep[] {
  if (!cached) {
    const data = recording as unknown as Recording;
    const resolve = resolver(data);
    cached = data.steps.map((step) => resolve(step) as JourneyStep);
  }
  return cached;
}

/** The short name a step goes by in feedback: J01 is the first step. */
export const stepCode = (index: number) => `J${String(index + 1).padStart(2, '0')}`;

/** The viewers the recording holds, seats first and the spectator last. */
export function journeyViewers(): string[] {
  const last = journeySteps().at(-1)!;
  return Object.keys(last.views).sort((a, b) => (a === 'neutral' ? 1 : b === 'neutral' ? -1 : a.localeCompare(b)));
}

/** A viewer's label: the seat, who holds it and the faction it plays at this step. */
function viewerLabel(step: JourneyStep, seat: string) {
  const view = step.views[seat] ?? journeySteps().at(-1)!.views[seat];
  if (seat === 'neutral') {
    return `Spectator: ${view.viewer.displayName}`;
  }
  const faction = view.snapshot.roster?.seats.find((entry) => entry.id === seat)?.faction;
  return `Seat ${seat.slice('seat-'.length)}: ${view.viewer.displayName}${faction ? ` (${faction.name})` : ''}`;
}

const clampStep = (index: number) => Math.min(Math.max(Math.trunc(index) || 0, 0), journeySteps().length - 1);

/* Before a viewer had connected, the step shows the creator's view. */
const shownSeat = (step: JourneyStep, seat: string) => (step.views[seat] ? seat : 'seat-1');

let deliveries = 0;
/**
 * The frame the page receives for a step and viewer.
 * Each delivery opens a fresh epoch, because the page keeps the newest revision of one epoch and stepping back must still land.
 */
export function journeyFrame(index: number, seat: string, completedCommandId?: string): View {
  const step = journeySteps()[clampStep(index)]!;
  const view = step.views[shownSeat(step, seat)]!;
  return {
    ...view,
    type: 'view',
    epoch: `journey-${++deliveries}`,
    ...(completedCommandId ? { completedCommandId } : {}),
  } as View;
}

/* Whether a command is the recorded one: every field the recording kept matches, so a different pick stays on this step. */
const sameAction = (recorded: Action, action: Action) =>
  Object.entries(recorded).every(([key, value]) => JSON.stringify(action[key]) === JSON.stringify(value));

/** The step a command advances to when it is the one the recording took next from this viewer's seat. */
export function railsTarget(index: number, seat: string, action: Action): number | null {
  const next = journeySteps()[index + 1];
  return next?.actor === seat && next.action && sameAction(next.action, action) ? index + 1 : null;
}

/** What the page currently shows, shared by the transport and the panel. */
export const journey: {
  step: number;
  seat: string;
  transport?: ReturnType<typeof storyTransport>;
  /* Moves the story's own step argument when a command on rails advanced the page. */
  onStep?: (step: number) => void;
} = { step: 0, seat: 'seat-1' };

/** The transport a journey story installs: the recorded view for the step, the log as it stood then, and commands on rails. */
export function journeyTransport(step: number, seat: string) {
  journey.step = clampStep(step);
  journey.seat = seat;
  const { log } = recording as unknown as Recording;
  const first = journeyFrame(journey.step, seat);
  const transport = storyTransport(seat as Viewer['viewerSeat'], first.snapshot, {
    admitView: () => journeyFrame(journey.step, journey.seat),
    logEntries: () => ({
      game: log.game.filter((entry) => entry.sequence <= journeySteps()[journey.step]!.logSequence),
      audit: log.audit,
    }),
    answerCommand: (message: Extract<ClientMessage, { type: 'command' }>) => {
      const target = railsTarget(journey.step, journey.seat, message.action as Action);
      if (target !== null) {
        journey.step = target;
        journey.onStep?.(target);
      }
      return journeyFrame(journey.step, journey.seat, message.commandId);
    },
  });
  journey.transport = transport;
  return transport;
}

type JourneyArgs = { step?: number; seat?: string };

/** The story component: the real game page, with the step and viewer as arguments the decorator reads. */
export function JourneyPage({ path }: Readonly<{ path: string } & JourneyArgs>) {
  return <StorybookPage path={path} />;
}
/* The panel starts clear of the page's own bars and moves round the corners when it covers what is under review. */
const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/** The review panel over the page: which step this is, what happened, and the controls to move through the game. */
function JourneyPanel({
  step,
  seat,
  onStep,
  onSeat,
}: Readonly<{ step: number; seat: string; onStep: (step: number) => void; onSeat: (seat: string) => void }>) {
  const steps = journeySteps();
  const current = steps[step]!;
  const [open, setOpen] = useState(true);
  const [corner, setCorner] = useState(0);
  const place = CORNERS[corner]!;
  const [follow, setFollow] = useState(false);
  const go = (next: number) => {
    const target = clampStep(next);
    const actor = steps[target]!.actor;
    if (follow && actor) {
      onSeat(actor);
    }
    onStep(target);
  };
  if (!open) {
    return (
      <aside className={`${styles.panel} ${styles[place]}`} aria-label="Journey">
        <button type="button" className={styles.toggle} onClick={() => setOpen(true)}>
          {stepCode(step)} {current.title}
        </button>
      </aside>
    );
  }
  return (
    <aside className={`${styles.panel} ${styles[place]}`} aria-label="Journey">
      <header className={styles.header}>
        <strong className={styles.code}>{stepCode(step)}</strong>
        <span className={styles.title}>{current.title}</span>
        <span className={styles.count}>
          {step + 1} of {steps.length}
        </span>
        <button
          type="button"
          className={styles.toggle}
          aria-label="Move the journey panel to the next corner"
          onClick={() => setCorner((corner + 1) % CORNERS.length)}
        >
          Move
        </button>
        <button type="button" aria-label="Hide the journey panel" onClick={() => setOpen(false)}>
          Hide
        </button>
      </header>
      <p className={styles.detail}>{current.detail}</p>
      <div className={styles.row}>
        <button type="button" onClick={() => go(0)} disabled={step === 0}>
          First
        </button>
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0}>
          Previous
        </button>
        <button type="button" onClick={() => go(step + 1)} disabled={step === steps.length - 1}>
          Next
        </button>
        <button type="button" onClick={() => go(steps.length - 1)} disabled={step === steps.length - 1}>
          Last
        </button>
      </div>
      <input
        className={styles.scrub}
        type="range"
        min={0}
        max={steps.length - 1}
        value={step}
        aria-label="Journey step"
        aria-valuetext={`${stepCode(step)} ${current.title}`}
        onChange={(event) => go(Number(event.currentTarget.value))}
      />
      <div className={styles.row}>
        <label className={styles.seat}>
          <span>Viewing as</span>
          <select value={seat} onChange={(event) => onSeat(event.currentTarget.value)}>
            {journeyViewers().map((viewer) => (
              <option key={viewer} value={viewer}>
                {viewerLabel(current, viewer)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.follow}>
          <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.currentTarget.checked)} />
          Follow the acting seat
        </label>
      </div>
    </aside>
  );
}

/**
 * Renders the page with the journey panel beside it and keeps the two in step: a change of step or viewer, from the panel, the Controls addon or the URL, delivers that recorded frame to the connected page.
 */
export const journeyDecorator: Decorator = (Story, context) => (
  <JourneyFrame storyId={context.id} args={context.args as JourneyArgs}>
    <Story />
  </JourneyFrame>
);

/* Storybook's own hooks are unavailable once an outer decorator renders this one, so the arguments move through the channel the Controls addon uses. */
function JourneyFrame({
  storyId,
  args,
  children,
}: Readonly<{ storyId: string; args: JourneyArgs; children: ReactNode }>) {
  const argStep = clampStep(Number(args.step ?? 1) - 1);
  const argSeat = args.seat ?? 'seat-1';
  /* The panel moves at once; the arguments follow, so the address names the step, and a change from Controls moves the panel. */
  const [{ step, seat }, setShown] = useState({ step: argStep, seat: argSeat });
  useEffect(() => setShown({ step: argStep, seat: argSeat }), [argStep, argSeat]);
  const change = (next: { step?: number; seat?: string }) => {
    setShown((current) => ({ ...current, ...next }));
    addons.getChannel().emit(UPDATE_STORY_ARGS, {
      storyId,
      updatedArgs: {
        ...(next.step === undefined ? {} : { step: next.step + 1 }),
        ...(next.seat === undefined ? {} : { seat: next.seat }),
      },
    });
  };
  const shown = useRef({ step, seat });
  useEffect(() => {
    journey.onStep = (next) => change({ step: next });
  });
  useEffect(() => {
    if (shown.current.step === step && shown.current.seat === seat) {
      return;
    }
    shown.current = { step, seat };
    /* A command on rails already delivered this step with its answer. */
    if (journey.step === step && journey.seat === seat) {
      return;
    }
    journey.step = step;
    journey.seat = seat;
    /* Before the page connects, its admission reads the step itself. */
    if (journey.transport?.connected()) {
      journey.transport.deliver(journeyFrame(step, seat));
    }
  }, [step, seat]);
  return (
    <>
      {children}
      <JourneyPanel
        step={step}
        seat={seat}
        onStep={(next) => change({ step: next })}
        onSeat={(next) => change({ seat: next })}
      />
    </>
  );
}
