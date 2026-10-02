import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, userEvent, within } from 'storybook/test';

import { openPanel, openPlayer } from './controls.stories.fixture';
import {
  AUDIT_LOG,
  conversationMessages,
  GAME_LOG,
  gameMeta,
  install,
  predictionSnapshot,
  removalSnapshot,
  seatPopover,
} from './game.stories.fixture';
import { battleStory, pendingRequestTransport } from './playing.stories.fixture';
import { playingSnapshot, preparedSnapshot, productTransport, setupSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Controls',
  parameters: {
    ...gameMeta.parameters,
    docs: {
      description: {
        component:
          'Shortcuts to each panel the game page renders today, one story per panel and state, each opening straight on its panel. Drafting and trading have their own sections (Play/Drafting, Play/Swapping).',
      },
    },
  },
  /* The stories load the table chunk before they render, as Play/Playing explains. */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* The panel's content can commit well after its tab turns current on a slow runner, so every read waits as long as the tab does. */
const WAIT = { timeout: 30_000 };

/** A seated snapshot in play with a loose Treachery card moved into the viewer's hand, as Play/Playing/PrivateDrawAndDeal does. */
function withCardInHand(snapshot: GameSnapshot) {
  const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1);
  if (!card || !snapshot.hand) {
    throw new Error('withCardInHand needs a seated snapshot with a loose Treachery card on the table.');
  }
  snapshot.hand.push({ ...card, owner: snapshot.bank?.factionId ?? card.owner });
  snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
  return snapshot;
}

/** Setup, Traitor selection: the step's instructions, the gather button and Ready. */
export const SetupTraitors = meta.story({
  beforeEach: install(() => productTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByRole('button', { name: 'Gather tabletop traitors' }, WAIT)).resolves.toBeVisible();
  },
});

/** Setup, starting forces: the kept Traitors are in hand and the table moves on to play. */
export const SetupStartingForces = meta.story({
  beforeEach: install(() => productTransport('seat-2', preparedSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByText(/^10 forces in Carthag and 10 in reserves/, {}, WAIT)).resolves.toBeVisible();
  },
});

/** Setup, the Bene Gesserit prediction before it is locked. */
export const SetupPrediction = meta.story({
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByRole('button', { name: 'Lock prediction' }, WAIT)).resolves.toBeVisible();
  },
});

/** Setup, the locked prediction waiting to be revealed. */
export const SetupPredictionLocked = meta.story({
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByRole('button', { name: 'Reveal prediction' }, WAIT)).resolves.toBeVisible();
  },
});

/** Two seats carry factions with one name, so each reads with its player in the prediction's options (#1667). */
export const SetupPredictionSharedName = meta.story({
  beforeEach: install(() => {
    const snapshot = predictionSnapshot();
    const [first, second] = snapshot.roster!.seats;
    second!.faction!.name = first!.faction!.name;
    return productTransport('seat-6', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    const [first, second] = predictionSnapshot().controls!.players;
    const name = predictionSnapshot().roster!.seats[0]!.faction!.name;
    await userEvent.click(await page.findByRole('combobox', { name: 'Predicted winner' }, WAIT));
    await expect(page.findByRole('option', { name: `${name} (${first!.name})` }, WAIT)).resolves.toBeVisible();
    await expect(page.findByRole('option', { name: `${name} (${second!.name})` }, WAIT)).resolves.toBeVisible();
  },
});

/** The hand: a leader and a Treachery card, each draggable onto the table. */
export const Hand = meta.story({
  beforeEach: install(() => productTransport('seat-2', withCardInHand(playingSnapshot()))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Hand');
    await expect(page.findByRole('button', { name: 'Drag Snooper from hand' }, WAIT)).resolves.toBeVisible();
  },
});

/** Battle, planning: the troops, leader, cards and spice the plan commits, before Ready. */
export const BattlePlanning = meta.story({
  beforeEach: install(() => productTransport('seat-2', withCardInHand(battleStory('preparing')))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle');
    await expect(page.findByRole('button', { name: 'Ready for battle' }, WAIT)).resolves.toBeVisible();
  },
});

/** Battle, both sides ready and the countdown to the reveal running. */
export const BattleCountdown = meta.story({
  beforeEach: install(() => productTransport('seat-2', battleStory('countdown'))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle');
    await expect(page.findByRole('button', { name: 'Undo Ready' }, WAIT)).resolves.toBeVisible();
  },
});

/** Battle, both plans revealed and the winner still to be called. */
export const BattleRevealed = meta.story({
  beforeEach: install(() => productTransport('seat-2', battleStory('revealed'))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle');
    await expect(page.findByRole('button', { name: 'No winner' }, WAIT)).resolves.toBeVisible();
  },
});

/** A spectator's dock opens on the Log, not on the Shared inventory whose every control is a seat's. */
export const SpectatorOpensOnLog = meta.story({
  beforeEach: install(() => productTransport('neutral')),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('tab', { name: 'Log' }, WAIT)).resolves.toHaveAttribute('aria-selected', 'true');
    expect(page.getByRole('tab', { name: 'Shared inventory' })).toHaveAttribute('aria-selected', 'false');
  },
});

/** Battle, as a spectator sees the revealed plans; the dock opens on it. */
export const BattleSpectator = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).findByRole('tab', { name: 'Battle' }, WAIT)
    ).resolves.toHaveAttribute('aria-selected', 'true');
    const page = await openPanel(canvasElement, 'Battle');
    await expect(page.findByRole('button', { name: 'No winner' }, WAIT)).resolves.toBeDisabled();
    expect(page.getByText('Both plans are revealed on the table.')).toBeVisible();
  },
});

/** A spectator of a full game reads that from the header's seat action; the dock keeps its height for the tabs. */
export const FullGameSpectatorSeat = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const seat = await seatPopover(canvasElement, 'You are watching');
    await expect(seat().findByText('All 6 seats are taken')).resolves.toBeVisible();
    expect(seat().queryByRole('button', { name: /^Request/ })).toBeNull();
    const dock = canvasElement.ownerDocument.querySelector<HTMLElement>('.seated-controls-panel')!;
    expect(within(dock).queryByRole('region', { name: 'You are watching' })).toBeNull();
    expect(page.getAllByRole('region', { name: 'You are watching' })).toHaveLength(1);
  },
});

/** Shared inventory with a request from another seat waiting for approval. */
export const SharedInventory = meta.story({
  beforeEach: install(pendingRequestTransport),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Shared inventory');
    await expect(page.findByRole('button', { name: 'Approve' }, WAIT)).resolves.toBeVisible();
  },
});

/** Spice: the private spice reserve and the public transfers. */
export const Spice = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', { ...playingSnapshot(), bank: { factionId: 'house-harkonnen', balance: 12 } })
  ),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Spice');
    await expect(page.findByLabelText('Spice reserve balance', {}, WAIT)).resolves.toHaveTextContent('12');
  },
});

/** The game log. */
export const LogGame = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot(), { logEntries: { game: GAME_LOG } })),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Log', 'Game');
    const log = await page.findByRole('region', { name: 'Game log' }, WAIT);
    await expect(within(log).findByText(GAME_LOG[0]!.text, {}, WAIT)).resolves.toBeVisible();
  },
});

/** The audit log of seat changes. */
export const LogAudit = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot(), { logEntries: { audit: AUDIT_LOG } })),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Log', 'Audit');
    const log = await page.findByRole('region', { name: 'Audit log' }, WAIT);
    await expect(within(log).findByText(AUDIT_LOG[0]!.text, {}, WAIT)).resolves.toBeVisible();
  },
});

/** The shared phase: its help, playback and the winner controls. */
export const Phase = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Phase');
    await expect(page.findByRole('button', { name: 'Replay from start' }, WAIT)).resolves.toBeVisible();
  },
});

/** A player's public information beside the controls. */
export const PlayerInfo = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Twaffle', 'Info');
    await expect(page.findByText('House Atreides · Seat 1', {}, WAIT)).resolves.toBeVisible();
  },
});

/** A private conversation with another player. */
export const PlayerConversation = meta.story({
  /* Reduced motion drops the entrance iris, as Play/Playing/ConversationHistory explains. */
  globals: { motion: 'reduce' },
  beforeEach: install(() =>
    productTransport('seat-2', playingSnapshot(), { conversationMessages: conversationMessages() })
  ),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Twaffle', 'Conversation');
    await expect(page.findByText('Shall we keep the southern route open?', {}, WAIT)).resolves.toBeVisible();
  },
});

/** A vote to remove a player, opened from the decision bar. */
export const PlayerRemovalVote = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Twaffle', 'Info');
    await expect(page.findByRole('button', { name: 'Keep' }, WAIT)).resolves.toBeVisible();
  },
});
