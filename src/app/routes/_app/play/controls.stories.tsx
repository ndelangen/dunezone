import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect } from 'storybook/test';

import { openPanel, openPlayer } from './controls.stories.fixture';
import {
  AUDIT_LOG,
  conversationMessages,
  GAME_LOG,
  gameMeta,
  install,
  predictionSnapshot,
  removalSnapshot,
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
          'Shortcuts to each panel the game page renders today, one story per panel and state, each opening straight on its panel. Drafting and trading have their own sections (Play/Drafting, Play/Swapping), and Play/Journey replays a whole recorded game.',
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

/** A snapshot in play with a loose Treachery card moved into the viewer's hand. */
function withCardInHand(snapshot: GameSnapshot) {
  const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
  snapshot.hand!.push({ ...card, owner: snapshot.bank?.factionId ?? card.owner });
  snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
  return snapshot;
}

/** Setup, Traitor selection: the step's instructions, the gather button and Ready. */
export const SetupTraitors = meta.story({
  beforeEach: install(() => productTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByRole('button', { name: 'Gather tabletop traitors' })).resolves.toBeVisible();
  },
});

/** Setup, starting forces: the kept Traitors are in hand and the table moves on to play. */
export const SetupStartingForces = meta.story({
  beforeEach: install(() => productTransport('seat-2', preparedSnapshot())),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Setup');
  },
});

/** Setup, the Bene Gesserit prediction before it is locked. */
export const SetupPrediction = meta.story({
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByRole('button', { name: 'Lock prediction' })).resolves.toBeVisible();
  },
});

/** Setup, the locked prediction waiting to be revealed. */
export const SetupPredictionLocked = meta.story({
  beforeEach: install(() => productTransport('seat-6', predictionSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Setup');
    await expect(page.findByRole('button', { name: 'Reveal prediction' })).resolves.toBeVisible();
  },
});

/** The hand: a leader and a Treachery card, each draggable onto the table. */
export const Hand = meta.story({
  beforeEach: install(() => productTransport('seat-2', withCardInHand(playingSnapshot()))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Hand');
    await expect(page.findByRole('button', { name: 'Drag Snooper from hand' })).resolves.toBeVisible();
  },
});

/** Battle, planning: the troops, leader, cards and spice the plan commits, before Ready. */
export const BattlePlanning = meta.story({
  beforeEach: install(() => productTransport('seat-2', withCardInHand(battleStory('preparing')))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle');
    await expect(page.findByRole('button', { name: 'Ready for battle' })).resolves.toBeVisible();
  },
});

/** Battle, both sides ready and the countdown to the reveal running. */
export const BattleCountdown = meta.story({
  beforeEach: install(() => productTransport('seat-2', battleStory('countdown'))),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Battle');
    await expect(page.findByRole('button', { name: 'Undo Ready' })).resolves.toBeVisible();
  },
});

/** Battle, both plans revealed and the winner still to be called. */
export const BattleRevealed = meta.story({
  beforeEach: install(() => productTransport('seat-2', battleStory('revealed'))),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Battle');
  },
});

/** Battle, as a spectator sees the revealed plans. */
export const BattleSpectator = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Battle');
  },
});

/** Shared inventory with a request from another seat waiting for approval. */
export const SharedInventory = meta.story({
  beforeEach: install(pendingRequestTransport),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Shared inventory');
    await expect(page.findByRole('button', { name: 'Approve' })).resolves.toBeVisible();
  },
});

/** Spice: the private faction bank and the public transfers. */
export const Spice = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', { ...playingSnapshot(), bank: { factionId: 'house-harkonnen', balance: 12 } })
  ),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Spice');
    await expect(page.findByLabelText('Banked spice')).resolves.toHaveTextContent('12');
  },
});

/** The game log. */
export const LogGame = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot(), { logEntries: { game: GAME_LOG } })),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Log', 'Game');
  },
});

/** The audit log of seat changes. */
export const LogAudit = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot(), { logEntries: { audit: AUDIT_LOG } })),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Log', 'Audit');
  },
});

/** The shared phase: its help, playback and the winner controls. */
export const Phase = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Phase');
  },
});

/** A player's public information beside the controls. */
export const PlayerInfo = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    await openPlayer(canvasElement, 'Twaffle', 'Info');
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
    await openPlayer(canvasElement, 'Twaffle', 'Conversation');
  },
});

/** A vote to remove a player, opened from the decision bar. */
export const PlayerRemovalVote = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    await openPlayer(canvasElement, 'Twaffle', 'Info');
  },
});
