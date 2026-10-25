import { debuggingChanged, describeDebugging, note } from '@sb/playDebugger/preview';
import type { LogEntry, LogTab } from '@shared/play/log';
import type { ClientMessage, ServerMessage, Viewer } from '@shared/play/protocol';
import { UPDATE_STORY_ARGS } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';
import { expect, waitFor, within } from 'storybook/test';

import { StorybookPage } from '../../storybook';
import { install } from './game.stories.fixture';
import recording from './journey.recording/journey.json';
import { capturedFactions } from './product.stories.fixture';
import { storyTransport } from './storyTransport';

/*
 * The Play journey: one real six-seat game the game Worker played in `workers/game/journey.record.native.test.ts`,
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
  /* The room's stored state, kept from setup on so the sandbox story can run the table from this step. */
  stored?: unknown;
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
      return value.map((entry) => resolve(entry));
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

/** The 1-based step of the first recorded step with this title, so a re-recording keeps each story on its moment. */
export const chapter = (title: string) => {
  const index = journeySteps().findIndex((step) => step.title === title);
  if (index < 0) {
    throw new Error(`The journey recording has no step titled ${title}.`);
  }
  return index + 1;
};

/** The short name a step goes by in feedback: J01 is the first step. */
export const stepCode = (index: number) => `J${String(index + 1).padStart(2, '0')}`;

/** The viewers the recording holds, seats first and the spectator last. */
export function journeyViewers(): string[] {
  const last = journeySteps().at(-1)!;
  return Object.keys(last.views).sort((a, b) => (a === 'neutral' ? 1 : b === 'neutral' ? -1 : a.localeCompare(b)));
}

/** A viewer's label: the seat, who holds it and the faction it plays at this step. */
export function viewerLabel(step: JourneyStep, seat: string) {
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
function journeyTransport(step: number, seat: string) {
  journey.step = clampStep(step);
  journey.seat = seat;
  const { log } = recording as unknown as Recording;
  const first = journeyFrame(journey.step, seat);
  const transport = storyTransport(seat as Viewer['viewerSeat'], first.snapshot, {
    factions: capturedFactions(),
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

/** The story component: the real game page, with the step and viewer as arguments the story's `beforeEach` reads. */
export function JourneyPage({ path }: Readonly<{ path: string } & JourneyArgs>) {
  return <StorybookPage path={path} />;
}

/** Every recorded step as the Play debugger panel lists it. */
export const timelineSteps = () =>
  journeySteps().map((step, index) => ({
    index,
    code: stepCode(index),
    title: step.title,
    detail: step.detail,
    actor: step.actor,
    action: step.action?.kind ?? null,
  }));

/** How the replay looks in the Play debugger panel: the recorded steps, the viewers, and the step shown now. */
function describeJourney() {
  const steps = journeySteps();
  describeDebugging({
    title: 'Journey replay',
    description:
      'One real six-seat game recorded from the game Worker, replayed step by step. A command the recording took next from the viewed seat moves to the next step; any other is answered with the same step. Record it again with `bun run play:record`.',
    timeline: () => {
      const current = steps[journey.step]!;
      return {
        label: 'Step',
        steps: timelineSteps(),
        reachable: steps.map((_, index) => index),
        current: journey.step,
        viewers: journeyViewers().map((id) => ({ id, label: viewerLabel(current, id) })),
        viewer: journey.seat,
        stepArg: 'step',
        viewerArg: 'seat',
      };
    },
    inspect: () => {
      const { title, detail, actor, action, logSequence } = steps[journey.step]!;
      return { 'Recorded step': { code: stepCode(journey.step), title, detail, actor, action, logSequence } };
    },
  });
}

/** Delivers a step and viewer to the connected page, unless a command on rails already did, as a change of the story's arguments does. */
export function showJourney(step: number, seat: string) {
  if (journey.step === step && journey.seat === seat) {
    return;
  }
  journey.step = step;
  journey.seat = seat;
  note(`${stepCode(step)} as ${seat}`);
  /* Before the page connects, its admission reads the step itself. */
  if (journey.transport?.connected()) {
    journey.transport.deliver(journeyFrame(step, seat));
  }
}

/**
 * A journey story's `beforeEach`.
 * Storybook runs it again on every change of the step or seat argument without unmounting the page, so a page already connected keeps its transport and the new step is delivered over it.
 * The Play debugger panel, the Controls addon and the address all move the story through those arguments.
 */
export function journeyBeforeEach({ args, id }: { args: JourneyArgs; id: string }) {
  const step = clampStep(Number(args.step ?? 1) - 1);
  const seat = String(args.seat ?? 'seat-1');
  /* A command on rails moves the step argument after it, so the address and the panel name the step the page shows. */
  journey.onStep = (next) =>
    addons.getChannel().emit(UPDATE_STORY_ARGS, { storyId: id, updatedArgs: { step: next + 1 } });
  if (journey.transport?.connected()) {
    showJourney(step, seat);
    debuggingChanged();
    return;
  }
  return install(() => {
    const transport = journeyTransport(step, seat);
    describeJourney();
    return transport;
  })();
}

/** Waits for the replay to reach a 1-based step, then for the connected page. */
export async function atStep(canvasElement: HTMLElement, step: number) {
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(journey.step).toBe(step - 1), { timeout: 30_000 });
  await expect(
    page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  return { page };
}
