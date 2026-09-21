import type { LogEntry } from '@shared/play/log';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { draftingSnapshot } from './drafting.stories.fixture';
import { browserGameRuntime } from './multiplayer/gameRuntime';
import type { productTransport as hostedStoryTransport } from './product.stories.fixture';
import { playingSnapshot, setupSnapshot, SIX } from './product.stories.fixture';

export const session: { runtime: typeof browserGameRuntime; transport: ReturnType<typeof hostedStoryTransport> } = {
  runtime: browserGameRuntime,
  transport: undefined!,
};

export const install = (transportFor: () => ReturnType<typeof hostedStoryTransport>) => () => {
  session.transport = transportFor();
  session.runtime = session.transport.runtime;
  return () => {
    session.transport.dispose();
    if (session.runtime === session.transport.runtime) {
      session.runtime = browserGameRuntime;
    }
  };
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

/** The lists of the players still seated: a departing player's lists go with them, so a smaller roster keeps only its own. */
export function draftOfSeated(draft: typeof MIDWAY, players: typeof SIX): Parameters<typeof draftingSnapshot>[2] {
  const seats = new Set(players.map((player) => player.seat));
  const own = (lists: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(lists).filter(([seat]) => seats.has(seat)));
  return { picks: own(draft.picks), bans: own(draft.bans), ready: draft.ready.filter((seat) => seats.has(seat)) };
}

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
  const snapshot = setupSnapshot();
  const factionId = snapshot.roster!.seats[1]!.faction!.id;
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

/* The log a game at its prediction step has written, newest first, as the table answers a page read: House Harkonnen holds seat 2 and predicts, Twaffle holds House Atreides in seat 1 and Ridwan holds Fremen in seat 5. */
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
    text: 'House Harkonnen revealed its prediction: House Atreides, turn 6.',
    context: 'Setup, Prediction',
    at: 3,
  },
  {
    sequence: 2,
    class: 'prediction',
    text: 'House Harkonnen locked its prediction.',
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
  const snapshot = predictionSnapshot(true);
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
