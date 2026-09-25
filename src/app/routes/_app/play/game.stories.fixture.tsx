import type { LogEntry } from '@shared/play/log';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import type { ComponentType } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { draftingSnapshot } from './drafting.stories.fixture';
import { browserGameRuntime, GameRuntimeContext } from './multiplayer/gameRuntime';
import type { GameRuntime } from './multiplayer/gameRuntime';
import type { productTransport } from './product.stories.fixture';
import { GAME_KEY, parameters, playingSnapshot, setupSnapshot, SIX } from './product.stories.fixture';

/** The story being rendered: the transport `install` put in place and the runtime the `gameMeta` decorator hands the page. */
export const session: { runtime: GameRuntime; transport: ReturnType<typeof productTransport> } = {
  runtime: browserGameRuntime,
  transport: undefined!,
};

/** A story's `beforeEach`: installs the transport the callback builds and restores the browser runtime on cleanup. */
export const install = (transportFor: () => ReturnType<typeof productTransport>) => () => {
  const transport = transportFor();
  session.transport = transport;
  session.runtime = transport.runtime;
  return () => {
    transport.dispose();
    if (session.runtime === transport.runtime) {
      session.runtime = browserGameRuntime;
    }
  };
};

/**
 * The meta every game page story file spreads beside its title: the real game's route, a ready game, and the installed runtime around the page.
 * A story passes `parameters(...)` only for another game state, and Storybook merges it over these.
 */
export const gameMeta = {
  ...pageStoryMeta,
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
  parameters: { ...pageStoryMeta.parameters, ...parameters('ready') },
  decorators: [
    (Story: ComponentType) => (
      <GameRuntimeContext value={session.runtime}>
        <Story />
      </GameRuntimeContext>
    ),
  ],
};

export const MIDWAY = {
  picks: {
    'seat-1': ['house-atreides', 'spacing-guild'],
    'seat-2': ['fremen'],
    'seat-3': ['house-harkonnen', 'bene-gesserit'],
    'seat-4': ['emperor'],
    'seat-5': ['ecaz-ecaz-moritani', 'moritani-ecaz-moritani'],
    'seat-6': ['bene-tleilax'],
  },
  bans: { 'seat-1': ['ixians'] },
  ready: ['seat-1'],
};

/* A real game while drafting: the creator holds seat 1 and the given requests wait. */
export function drafting(seatRequests: NonNullable<GameSnapshot['controls']>['seatRequests'] = []): GameSnapshot {
  return draftingSnapshot([SIX[0]!], 6, {}, seatRequests);
}

/* A seated player's cursor publishes as pointer messages, so the command is the last of its kind, not the last message. */
export const lastCommand = () =>
  [...session.transport.messages].reverse().find((message) => message.type === 'command');

/**
 * The decision bar by its eyebrow, read fresh on every use: the panel arrives with the table chunk and the connection, so a node held from before goes stale.
 */
export async function decisionBar(canvasElement: HTMLElement, name: string) {
  const page = within(canvasElement.ownerDocument.body);
  const bar = () => within(page.getByRole('region', { name }));
  await expect(
    page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await waitFor(() => expect(page.getByRole('region', { name })).toBeVisible(), { timeout: 30_000 });
  return bar;
}

/** Reads text under a fresh query until the remounting scene lets it settle. */
export const shows = (read: () => HTMLElement) => waitFor(() => expect(read()).toBeVisible(), { timeout: 30_000 });

/** Clicks a control by a fresh query, retried until the click takes on a settled node. */
export const press = (read: () => HTMLElement) =>
  waitFor(
    async () => {
      await userEvent.click(read());
    },
    { timeout: 30_000 }
  );

export function predictionSnapshot(locked = false): GameSnapshot {
  const snapshot = setupSnapshot('seat-6');
  const factionId = snapshot.roster!.seats[5]!.faction!.id;
  snapshot.setup!.steps.unshift({
    id: 'prediction',
    factionId,
    kind: 'prediction',
    title: 'Prediction',
    instructions: 'Choose the faction that will win and the turn of its victory.',
    symbol: '/vector/icon/traitor.svg',
  });
  if (locked) {
    snapshot.predictions = {
      prediction: {
        factionId,
        lockedAt: 1,
        revealedAt: null,
        choice: { factionId: snapshot.roster!.seats[0]!.faction!.id, turn: 6 },
      },
    };
  }
  return snapshot;
}

export function removalSnapshot() {
  const snapshot = playingSnapshot();
  const players = snapshot.controls!.players;
  snapshot.removalVotes = [
    {
      id: 'removal-12',
      target: { name: players[0].name, seat: players[0].seat },
      openedAt: Date.now() - 125_000,
      threshold: 4,
      ballots: players.slice(1).map((player, index) => ({
        name: player.name,
        seat: player.seat,
        choice: index === 0 ? ('remove' as const) : null,
      })),
    },
  ];
  return snapshot;
}

/* The log a game at its prediction step has written, newest first, as the table answers a page read: Bene Gesserit holds seat 6 and predicts, Twaffle holds House Atreides in seat 1 and Ridwan holds Fremen in seat 5. */
export const GAME_LOG: LogEntry[] = [
  {
    sequence: 5,
    class: 'spice',
    text: 'Ridwan collected 3 spice from the table into the Fremen bank.',
    context: 'Setup, Prediction',
    at: 5,
  },
  {
    sequence: 4,
    class: 'spice',
    text: 'Twaffle withdrew 4 spice from the House Atreides bank to the table.',
    context: 'Setup, Prediction',
    at: 4,
  },
  {
    sequence: 3,
    class: 'prediction',
    text: 'Bene Gesserit revealed its prediction: House Atreides, turn 6.',
    context: 'Setup, Prediction',
    at: 3,
  },
  {
    sequence: 2,
    class: 'prediction',
    text: 'Bene Gesserit locked its prediction.',
    context: 'Setup, Prediction',
    at: 2,
  },
];
/* Seat 6 changed hands during swapping: its first occupant's account was deleted, then Argelius took the vacancy. */
export const AUDIT_LOG: LogEntry[] = [
  {
    sequence: 8,
    class: 'vote',
    text: 'Twaffle keeps seat 1: Thialfi voted remove; Fectumbra and Erickenneth voted keep; Ridwan and Argelius did not vote.',
    context: 'Setup, Traitor selection',
    at: 8,
  },
  { sequence: 7, class: 'seat', text: 'Argelius took seat 6, approved by Twaffle.', context: 'Swapping', at: 7 },
  {
    sequence: 6,
    class: 'seat',
    text: '[deleted user] left seat 6 when the account was deleted.',
    context: 'Swapping',
    at: 6,
  },
  { sequence: 1, class: 'seat', text: 'Twaffle created the game and took seat 1.', context: 'Drafting', at: 1 },
];

export type LogRead = Extract<ClientMessage, { type: 'log-history' }>;
export const gameLogReads = (messages: ClientMessage[]) =>
  messages.filter((message): message is LogRead => message.type === 'log-history' && message.tab === 'game');

/* The prediction step with its prediction locked and revealed, which is the state the Game log above describes. */
export function revealedPredictionSnapshot(): GameSnapshot {
  const snapshot = playingSnapshot('seat-6');
  snapshot.predictions = predictionSnapshot(true).predictions;
  snapshot.predictions!.prediction!.revealedAt = 2;
  snapshot.stage = 'play';
  delete snapshot.setup;
  return snapshot;
}

export const conversationPair = () => {
  const seats = setupSnapshot().roster!.seats;
  return { factionId: seats[1]!.faction!.id, peerId: seats[0]!.faction!.id };
};
export const conversationMessages = () =>
  Array.from({ length: 55 }, (_, index) => ({
    sequence: index + 1,
    requestId: `saved-${index}`,
    senderFactionId: conversationPair().peerId,
    author: 'Twaffle',
    text: index === 54 ? 'Shall we keep the southern route open?' : `Earlier plan ${index + 1}`,
    savedAt: 1_800_000_000_000 + index * 60_000,
  }));
