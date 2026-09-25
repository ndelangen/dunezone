import preview from '@sb/preview';
import type { LogEntry } from '@shared/play/log';
import type { TablePiece } from '@shared/play/model';
import { TABLE_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { stackTopHeight } from '@shared/play/tableGeometry';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import {
  AUDIT_LOG,
  conversationMessages,
  conversationPair,
  GAME_LOG,
  gameLogReads,
  session as gameSession,
  install,
  lastCommand,
  removalSnapshot,
  revealedPredictionSnapshot,
} from './game.stories.fixture';
import { browserGameRuntime, GameRuntimeContext } from './multiplayer/gameRuntime';
import {
  activateRuntime,
  expectHeaderPhase,
  mapViewPoint,
  openTab,
  paintedColor,
  pendingRequestTransport,
  phaseControls,
  session as playingSession,
  settled,
} from './playing.stories.fixture';
import {
  cardBack,
  GAME_KEY,
  productTransport as hostedStoryTransport,
  playingSnapshot as initialSnapshot,
  parameters,
  playingSnapshot,
  SIX,
} from './product.stories.fixture';

let dealtSnapshot: GameSnapshot;

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Playing',
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
  decorators: [
    (Story) => (
      <GameRuntimeContext
        value={gameSession.runtime !== browserGameRuntime ? gameSession.runtime : playingSession.runtime}
      >
        <Story />
      </GameRuntimeContext>
    ),
  ],
});

export const RemovalVoting = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'View vote about Twaffle' }));
    expect(page.getByRole('button', { name: 'Twaffle, removal vote in progress' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Withdraw' }));
    expect(lastCommand()).toMatchObject({ action: { kind: 'removal-ballot', voteId: 'removal-12', choice: null } });
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    expect(lastCommand()).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
  },
});

export const LogGame = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport('seat-6', revealedPredictionSnapshot(), { logEntries: { game: GAME_LOG } })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Log' }));
    const log = await page.findByRole('region', { name: 'Game log' });
    await expect(within(log).findByText('Bene Gesserit locked its prediction.')).resolves.toBeVisible();
    expect(
      within(log)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'SpiceRidwan collected 3 spice from the table into the Fremen bank.Setup, Prediction',
      'SpiceTwaffle withdrew 4 spice from the House Atreides bank to the table.Setup, Prediction',
      'PredictionBene Gesserit revealed its prediction: House Atreides, turn 6.Setup, Prediction',
      'PredictionBene Gesserit locked its prediction.Setup, Prediction',
    ]);
    expect(within(log).queryByRole('button', { name: 'Earlier entries' })).toBeNull();
  },
});

export const LogAudit = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    const snapshot = playingSnapshot();
    snapshot.removalVotes = [];
    return hostedStoryTransport('seat-2', snapshot, { logEntries: { audit: AUDIT_LOG } });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Log' }));
    await userEvent.click(await page.findByRole('button', { name: 'Audit' }));
    const log = await page.findByRole('region', { name: 'Audit log' });
    await expect(within(log).findByText(/Twaffle keeps seat 1/)).resolves.toBeVisible();
    expect(within(log).getByText('[deleted user] left seat 6 when the account was deleted.')).toBeVisible();
    expect(page.queryByRole('button', { name: 'View vote about Twaffle' })).toBeNull();
  },
});

export const LogPagination = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-6', revealedPredictionSnapshot(), { holdLogHistory: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Log' }));
    await waitFor(() => expect(gameLogReads(gameSession.transport.messages).length).toBeGreaterThan(0));
    const latest = GAME_LOG[0]!;
    const older: LogEntry = {
      sequence: 1,
      class: 'phase',
      text: 'Trading ended and setup began.',
      context: 'Swapping',
      at: 1,
    };
    gameSession.transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
      entries: [latest],
      more: true,
    });
    await userEvent.click(await page.findByRole('button', { name: 'Earlier entries' }));
    const messagesBeforeUpdate = gameSession.transport.messages.length;
    const updated = revealedPredictionSnapshot();
    updated.revision += 1;
    gameSession.transport.deliver(gameSession.transport.view(updated));
    await waitFor(() => {
      const later = gameLogReads(gameSession.transport.messages.slice(messagesBeforeUpdate));
      expect(later.length).toBeGreaterThan(0);
      expect(later.every((message) => message.before === latest.sequence)).toBe(true);
    });
    gameSession.transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: latest.sequence,
      entries: [older],
      more: false,
    });
    await expect(page.findByText('Trading ended and setup began.')).resolves.toBeVisible();
    const messagesBeforeDeparture = gameSession.transport.messages.length;
    const departed = gameSession.transport.view({ ...updated, revision: updated.revision + 1 });
    departed.viewer = { ...departed.viewer, viewerSeat: SPECTATOR_SEAT };
    delete departed.snapshot.bank;
    delete departed.snapshot.hand;
    gameSession.transport.deliver(departed);
    await waitFor(() => {
      const reads = gameLogReads(gameSession.transport.messages.slice(messagesBeforeDeparture));
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((message) => message.before === latest.sequence)).toBe(true);
    });
    await expect(page.findByText('Trading ended and setup began.')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Latest entries' }));
    expect(gameLogReads(gameSession.transport.messages).at(-1)).toEqual({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
    });
    gameSession.transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
      entries: [latest],
      more: true,
    });
    await expect(page.findByText(latest.text)).resolves.toBeVisible();
    expect(page.queryByText('Trading ended and setup began.')).toBeNull();
  },
});

export const RemovalResolution = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    return hostedStoryTransport('seat-2', removalSnapshot(), {
      logEntries: {
        audit: [
          {
            sequence: 1,
            class: 'vote',
            text: 'Twaffle keeps seat 1: Thialfi and Fectumbra voted keep; Erickenneth, Ridwan and Argelius did not vote.',
            context: 'Setup, Traitor selection',
            at: 1,
          },
        ],
      },
    });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'View vote about Twaffle' }));
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    const command = lastCommand();
    expect(command).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
    const resolved = playingSnapshot();
    resolved.removalVotes = [];
    resolved.revision += 1;
    gameSession.transport.deliver(gameSession.transport.view(resolved, command!.commandId));
    await waitFor(() => expect(page.queryByRole('button', { name: 'View vote about Twaffle' })).toBeNull());
    expect(page.queryByRole('heading', { name: 'Remove Twaffle?' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Twaffle, removal vote in progress' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Log' }));
    await userEvent.click(await page.findByRole('button', { name: 'Audit' }));
    await expect(page.findByText(/Twaffle keeps seat 1/)).resolves.toBeVisible();
  },
});

export const RemovalRejected = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'View vote about Twaffle' }));
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    gameSession.transport.deliver({
      type: 'rejected',
      requestId: lastCommand()!.commandId,
      message: 'The vote changed. Try again.',
    });
    const publicState = within(canvasElement.ownerDocument.getElementById('player-public-state')!);
    await expect(publicState.findByText('The vote changed. Try again.')).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  },
});

export const ConversationHistory = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport('seat-2', playingSnapshot(), { conversationMessages: conversationMessages() })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Twaffle' });
    page.getByRole('separator', { name: 'Resize controls panel' }).focus();
    await userEvent.keyboard('{End}');
    await userEvent.click(page.getByRole('button', { name: 'Info' }));
    const { factionId, peerId } = conversationPair();
    gameSession.transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 55, unread: 55 }],
    });
    await expect(page.findByRole('button', { name: 'Twaffle, 55 unread' })).resolves.toBeVisible();
    expect(gameSession.transport.messages.some((entry) => entry.type === 'conversation-read')).toBe(false);
    await userEvent.click(page.getByRole('button', { name: 'Conversation' }));
    await page.findByText('Shall we keep the southern route open?');
    const loadedHistory = page.getByRole('region', { name: 'Conversation history' });
    await waitFor(() =>
      expect(loadedHistory.scrollHeight - loadedHistory.scrollTop - loadedHistory.clientHeight).toBeLessThan(8)
    );
    await waitFor(() =>
      expect(
        gameSession.transport.messages.some((entry) => entry.type === 'conversation-read' && entry.through === 55)
      ).toBe(true)
    );
    gameSession.transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 55, unread: 0 }],
    });
    await userEvent.click(page.getByRole('button', { name: 'Earlier messages' }));
    await expect(page.findByText('Earlier plan 1')).resolves.toBeInTheDocument();
    page.getByText('Earlier plan 1').scrollIntoView({ block: 'center' });
    const history = page.getByRole('region', { name: 'Conversation history' });
    const readingPosition = history.scrollTop;
    const composerTop = page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top;
    gameSession.transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        ...conversationMessages()[0]!,
        sequence: 56,
        requestId: 'new-arrival',
        text: 'A new message while you read older plans.',
      },
    });
    gameSession.transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 56, unread: 1 }],
    });
    await expect(page.findByRole('button', { name: 'Twaffle, 1 unread' })).resolves.toBeVisible();
    expect(
      gameSession.transport.messages.some((entry) => entry.type === 'conversation-read' && entry.through === 56)
    ).toBe(false);
    expect(Math.abs(history.scrollTop - readingPosition)).toBeLessThan(2);
    expect(page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top).toBe(composerTop);
    history.scrollTop = history.scrollHeight;
    history.dispatchEvent(new Event('scroll'));
    gameSession.transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        ...conversationMessages()[0]!,
        sequence: 57,
        requestId: 'following-arrival',
        text: 'Follow this new message at the bottom.',
      },
    });
    await page.findByText('Follow this new message at the bottom.');
    await waitFor(() => expect(history.scrollHeight - history.scrollTop - history.clientHeight).toBeLessThan(8));
    expect(page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top).toBe(composerTop);

    await userEvent.click(page.getByRole('button', { name: 'Info' }));
    expect(page.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'fectumbra' }));
    await expect(page.findByRole('textbox', { name: 'Message' })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Thialfi' }));
    expect(page.queryByRole('button', { name: 'Conversation' })).toBeNull();
  },
});

export const ConversationDelivery = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Message' });
    await userEvent.type(page.getByRole('textbox', { name: 'Message' }), 'I can keep the southern route open.');
    await userEvent.click(page.getByRole('button', { name: /^Send$/ }));
    await expect(page.findByText('Pending', { exact: true })).resolves.toBeVisible();
    const sent = [...gameSession.transport.messages].reverse().find((entry) => entry.type === 'conversation-send')!;
    gameSession.transport.deliver({
      type: 'rejected',
      requestId: sent.requestId,
      message: 'The message could not be saved.',
    });
    await expect(page.findByText('Failed', { exact: true })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Retry$/ }));
    expect([...gameSession.transport.messages].reverse().find((entry) => entry.type === 'conversation-send')).toEqual(
      sent
    );
    const { factionId, peerId } = conversationPair();
    gameSession.transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        sequence: 1,
        requestId: sent.requestId,
        senderFactionId: factionId,
        author: 'Thialfi',
        text: sent.text,
        savedAt: Date.now() - 120_000,
      },
    });
    await expect(page.findByText('Sent', { exact: true })).resolves.toBeVisible();
    expect(page.getAllByText('I can keep the southern route open.')).toHaveLength(1);
    expect(page.getByText('2 minutes ago')).toBeVisible();
  },
});

export const ConversationOffline = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Conversation' });
    gameSession.transport.deliver({ type: 'admission', status: 'suspended' });
    await expect(page.findByRole('combobox', { name: 'Faction conversation' })).resolves.toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: 'Message' }), 'Send once I reconnect.');
    await userEvent.click(page.getByRole('button', { name: /^Send$/ }));
    await expect(page.findByText('Pending', { exact: true })).resolves.toBeVisible();
    expect(gameSession.transport.messages.filter((entry) => entry.type === 'conversation-send')).toHaveLength(0);
    await userEvent.click(page.getByRole('combobox', { name: 'Faction conversation' }));
    const peers = await page.findByRole('listbox');
    expect(peers.closest('[data-scheme-dark]')).not.toBeNull();
  },
});

/* The frame a table route shows while a view is still on its way: the status line on the dark ground, the pool of light breathing behind it. */
export const Connecting = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen', initialSnapshot(), { holdView: true });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('Connecting to the hosted table...', {}, { timeout: 30_000 });
    /* The status line eases in from transparent, so visibility is read once the ease has run. */
    await waitFor(() => expect(status).toBeVisible());
    const frame = status.closest('[data-connection]');
    expect(frame).toHaveAttribute('data-connection', 'connecting');
    expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    const view = canvasElement.ownerDocument.defaultView!;
    expect(view.getComputedStyle(frame!, '::before').animationName).toMatch(/breathe/);
    expect(canvasElement.ownerDocument.querySelector('.dune-play-shell')).toBeNull();
  },
});

/* The motion verdict keeps the waiting frame still. */
export const ConnectingStill = meta.story({
  parameters: parameters('ready'),
  globals: { motion: 'reduce' },
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen', initialSnapshot(), { holdView: true });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('Connecting to the hosted table...', {}, { timeout: 30_000 });
    const frame = status.closest('[data-connection]')!;
    const view = canvasElement.ownerDocument.defaultView!;
    expect(view.getComputedStyle(frame, '::before').animationName).toBe('none');
    expect(view.getComputedStyle(status).animationName).toBe('none');
  },
});

export const SharedPhaseControls = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen');
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Phase' })).toBeVisible());
    await openTab(page, 'Phase');
    await waitForPhase(() => {
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeDisabled();
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeEnabled();
      expect(page.getByRole('region', { name: 'Storm sector' })).toBeVisible();
      expect(page.getByRole('button', { name: `Help: ${TABLE_PHASES[0].label}` })).toBeVisible();
      expectHeaderPhase(canvasElement, 0);
    });

    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    const command = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(command?.action).toMatchObject({ kind: 'phase' });
    if (command?.action.kind === 'phase') {
      expect(command.action.direction ?? 1).toBe(1);
    }
    playingSession.transport.deliver(
      playingSession.transport.view({ ...initialSnapshot(), phase: 1, revision: 1 }, command?.commandId)
    );
    await waitForPhase(() => {
      expect(page.getByRole('button', { name: `Help: ${TABLE_PHASES[1].label}` })).toBeVisible();
      expect(page.queryByRole('region', { name: 'Storm sector' })).toBeNull();
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeEnabled();
      expect(page.getByRole('button', { name: 'Replay from start' })).toBeVisible();
      expectHeaderPhase(canvasElement, 1);
    });

    playingSession.transport.deliver(
      playingSession.transport.view({ ...initialSnapshot(), phase: TABLE_PHASES.length, revision: 2 })
    );
    await waitForPhase(() => expect(page.getByText('Turn 2', { exact: true })).toBeVisible());
    await userEvent.click(controls().getByRole('button', { name: 'Previous phase' }));
    const previous = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(previous?.action).toMatchObject({ kind: 'phase', direction: -1 });
    playingSession.transport.deliver(
      playingSession.transport.view(
        { ...initialSnapshot(), phase: TABLE_PHASES.length - 1, revision: 3 },
        previous?.commandId
      )
    );
    await waitForPhase(() => {
      expect(page.getByRole('button', { name: 'Replay from start' })).toBeVisible();
      expect(page.getByRole('button', { name: `Help: ${TABLE_PHASES[TABLE_PHASES.length - 1].label}` })).toBeVisible();
      expectHeaderPhase(canvasElement, TABLE_PHASES.length - 1);
    });
  },
});

export const ObserverPhaseControls = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('neutral', { ...initialSnapshot(), phase: 5 });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Phase' })).toBeVisible());
    await openTab(page, 'Phase');
    await waitForPhase(() => {
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeDisabled();
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeDisabled();
      expect(page.getByRole('button', { name: `Help: ${TABLE_PHASES[5].label}` })).toBeVisible();
      expectHeaderPhase(canvasElement, 5);
    });
    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    expect(playingSession.transport.messages.some((message) => message.type === 'command')).toBe(false);
  },
});

export const PlaybackKeepsLivePhaseSeparate = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen', { ...initialSnapshot(), phase: 5 });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Phase' })).toBeVisible());
    await openTab(page, 'Phase');
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Replay from start' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Replay from start' }));
    expect(playingSession.transport.messages).toContainEqual({ type: 'history', step: 0 });
    playingSession.transport.deliver({ type: 'history', step: 0, lastStep: 1, snapshot: initialSnapshot() });
    await waitForPhase(() => {
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeDisabled();
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeDisabled();
    });

    playingSession.transport.deliver(playingSession.transport.view({ ...initialSnapshot(), phase: 6, revision: 1 }));
    expect(page.getByRole('button', { name: `Help: ${TABLE_PHASES[0].label}` })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Return to live' }));
    await waitForPhase(() => {
      expectHeaderPhase(canvasElement, 6);
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeEnabled();
    });
    expect(playingSession.transport.messages.some((message) => message.type === 'command')).toBe(false);
  },
});

export const MentatReadiness = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      phase: 8,
      controls: {
        ...initialSnapshot().controls!,
        seats: SIX.map((player) => player.seat),
        ready: ['seat-1', 'seat-3', 'seat-4', 'seat-5', 'seat-6'],
      },
    });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: /^Ready$/ })).toBeVisible(), { timeout: 30_000 });
    /* Readiness is a phase control: it sits in the header's phase navigation, not on a tab. */
    const navigation = page.getByRole('group', { name: 'Phase navigation' });
    expect(within(navigation).getByRole('button', { name: /^Ready$/ })).toBeVisible();
    expect(within(navigation).getByText('5 of 6 ready')).toBeVisible();
    expect(navigation.closest('header')).not.toBeNull();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    const command = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(command?.action).toEqual({ kind: 'ready', ready: true });
    playingSession.transport.deliver(
      playingSession.transport.view(
        {
          ...initialSnapshot(),
          phase: 8,
          revision: 1,
          controls: {
            ...initialSnapshot().controls!,
            seats: SIX.map((player) => player.seat),
            ready: SIX.map((player) => player.seat),
          },
        },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    expect(page.getByRole('button', { name: 'Withdraw readiness' })).toBeEnabled();
    expect(playingSession.transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    await userEvent.click(page.getByRole('button', { name: 'Withdraw readiness' }));
    expect(
      [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
    ).toEqual({
      kind: 'ready',
      ready: false,
    });
  },
});

export const PhaseCooldown = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen');
    const cleanup = activateRuntime();
    return cleanup;
  },
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    playingSession.transport.deliver({
      ...playingSession.transport.view({
        ...initialSnapshot(),
        phase: 1,
        revision: 1,
        controls: {
          ...initialSnapshot().controls!,
          phaseChangedAt: playingSession.transport.runtime.now() - 3_600_000,
        },
      }),
      phaseCooldownMs: 8000,
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled());
    expect(page.getByRole('button', { name: 'Previous phase' })).toBeDisabled();
    const toolbar = canvasElement.ownerDocument.querySelector('.seated-toolbar');
    expect(toolbar?.lastElementChild).toHaveAttribute('aria-label', 'Phase navigation');
    playingSession.transport.deliver({
      ...playingSession.transport.view({
        ...initialSnapshot(),
        phase: 1,
        revision: 2,
        controls: {
          ...initialSnapshot().controls!,
          phaseChangedAt: playingSession.transport.runtime.now() + 3_600_000,
        },
      }),
      phaseCooldownMs: 20,
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    expect(page.getByRole('button', { name: 'Previous phase' })).toBeEnabled();
  },
});

export const SharedInventoryRequests = meta.story({
  parameters: parameters('ready'),
  beforeEach: pendingRequestTransport,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared inventory');
    await expect(page.findByRole('button', { name: 'Approve' }, { timeout: 30_000 })).resolves.toBeEnabled();
    expect(page.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
    expect(page.getByRole('button', { name: 'Drag House Atreides tokens onto the table' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Approve' }));
    expect(
      [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
    ).toEqual({
      kind: 'spawn-approve',
      requestId: 'pending-token',
    });
    await userEvent.click(page.getByRole('button', { name: 'Dismiss' }));
    expect(
      [...playingSession.transport.messages].reverse().find((message) => message.type === 'command')?.action
    ).toEqual({
      kind: 'spawn-dismiss',
      requestId: 'pending-token',
    });
    const initial = initialSnapshot();
    playingSession.transport.deliver(
      playingSession.transport.view({
        ...initial,
        revision: 1,
        controls: {
          ...initialSnapshot().controls!,
          seats: SIX.map((player) => player.seat),
          requests: [
            {
              id: 'own-request',
              requesterSeat: 'seat-2',
              requesterName: 'Thialfi',
              contents: {
                assetId: 'recovery',
                name: 'House Atreides token',
                type: 'token-disc',
                members: [{ assetId: 'recovery', count: 1 }],
                definitions: [],
                pieces: [initial.table.pieces[0]],
              },
            },
          ],
        },
      })
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled());
    expect(page.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  },
});

/** At phone width the panel's prose stays: request labels, readiness and status are functional text. */
export const SharedInventoryNarrow = meta.story({
  parameters: parameters('ready'),
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: pendingRequestTransport,
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await openTab(page, 'Shared inventory');
    await waitForPhase(() => {
      expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
      expect(page.getByText('House Atreides tokens requested by Twaffle')).toBeVisible();
    });
    await userEvent.hover(page.getByRole('button', { name: 'Help: Shared inventory' }));
    await waitFor(() => expect(page.getByText(/Shared inventory\. Drag an item onto the table/)).toBeVisible());
    await userEvent.unhover(page.getByRole('button', { name: 'Help: Shared inventory' }));
    await openTab(page, 'Phase');
    await userEvent.hover(page.getByRole('button', { name: 'Help: Storm' }));
    await waitFor(() => expect(page.getByText(/Storm\. Move the storm using the storm controls/)).toBeVisible());
    await userEvent.unhover(page.getByRole('button', { name: 'Help: Storm' }));
  },
});

/**
 * The accepted frame (#1147): one rail of tabs beside the content it opens, in the accepted order, the host's tabs ahead of the fixture's own.
 * Switching a tab swaps the content and moves the contour;
 * the rail stays where it is.
 */
export const ControlsPanelTabs = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 4 },
    });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared inventory');
    const rail = () => page.getByRole('navigation', { name: 'Controls' });
    await settled(() => {
      expect(
        within(rail())
          .getAllByRole('button')
          .map((item) => item.getAttribute('aria-label'))
      ).toEqual(['Hand', 'Shared inventory', 'Spice', 'Log', 'Phase']);
      expect(page.getByRole('button', { name: 'Shared inventory' })).toHaveAttribute('aria-current', 'true');
      expect(page.getByRole('region', { name: 'Shared inventory' })).toBeVisible();
      expect(page.queryByRole('heading', { name: 'Faction bank' })).toBeNull();
    });
    /* Compared as plain numbers: two DOMRects have no own enumerable properties, so toEqual on the rects themselves is always true. */
    const railBox = rail().getBoundingClientRect().toJSON();

    await openTab(page, 'Spice');
    await settled(() => {
      expect(page.getByRole('region', { name: 'Faction bank' })).toBeVisible();
      expect(page.getByRole('region', { name: 'Public spice transfers' })).toBeVisible();
      expect(page.queryByRole('heading', { name: 'Shared inventory' })).toBeNull();
    });

    await openTab(page, 'Phase');
    await settled(() => {
      expect(page.getByRole('button', { name: 'Replay from start' })).toBeVisible();
      expect(page.queryByRole('button', { name: 'Help: Hosted connection' })).toBeNull();
      expect(page.queryByRole('heading', { name: 'Faction bank' })).toBeNull();
      expect(rail().getBoundingClientRect().toJSON()).toEqual(railBox);
    });
    /* The phase controls stay in the header, outside the tabs. */
    expect(page.getByRole('group', { name: 'Phase navigation' }).closest('header')).not.toBeNull();
  },
});

/**
 * The panel is a dark-scheme island: its title, eyebrow, prose and controls paint the same in both page schemes, and that paint is the dark tokens, the app's and Mantine's alike.
 * The page scheme is flipped on the document mid-story, which is what the app's own scheme bridge does, so one mount proves both schemes.
 * A floating pane opened on the island, a piece's menu here, paints the island's glass in the light page although it portals out of the shell.
 * (Page stories take their scheme from the app chrome, not from the Storybook global.)
 */
export const PanelSchemeIsland = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport();
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    const balance = await page.findByLabelText('Banked spice');
    const button = page.getByRole('button', { name: 'Withdraw spice' });
    const island = balance.closest<HTMLElement>('[data-scheme-dark]')!;
    const root = canvasElement.ownerDocument.documentElement;
    const view = canvasElement.ownerDocument.defaultView!;
    const paint = () => [view.getComputedStyle(balance).color, view.getComputedStyle(button).backgroundColor];
    root.setAttribute('data-mantine-color-scheme', 'light');
    const light = paint();
    expect(light[0]).toBe(paintedColor(island, view.getComputedStyle(island).getPropertyValue('--color-text').trim()));
    const deck = initialSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const menu = await openPieceMenu(canvasElement.ownerDocument, deck);
    expect(menu).toHaveAttribute('aria-label', 'Deck actions');
    expect(view.getComputedStyle(menu).backgroundColor).toBe(
      paintedColor(island, view.getComputedStyle(island).getPropertyValue('--glass-overlay').trim())
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
    root.setAttribute('data-mantine-color-scheme', 'dark');
    expect(paint()).toEqual(light);
    await userEvent.hover(page.getByRole('button', { name: 'Help: Faction bank' }));
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent('Only you see this balance');
    await userEvent.unhover(page.getByRole('button', { name: 'Help: Faction bank' }));
  },
});

/**
 * Right-clicks a piece on the table, in the map view, until its menu opens.
 * The right-click is a pointerdown and then a `contextmenu` PointerEvent with the same pointer id, because the scene fires a click on an object only when the pointerdown with that id hit it;
 * user-event's `[MouseRight]` sends its `contextmenu` without a pointer id, and no menu opens.
 * The events go to the canvas `mapViewPoint` projects against, the document's first.
 * The menu is found by role alone: Mantine labels it by its empty anchor, which hides its `aria-label` from the name lookup.
 */
async function openPieceMenu(document: Document, piece: TablePiece) {
  const page = within(document.body);
  const [clientX, clientY] = mapViewPoint(document, [
    piece.position[0],
    piece.position[1] + stackTopHeight(piece),
    piece.position[2],
  ]);
  const press = { clientX, clientY, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 2 };
  return waitFor(
    () => {
      const scene = document.querySelector('canvas');
      if (scene && !page.queryByRole('menu')) {
        scene.dispatchEvent(new PointerEvent('pointerdown', { ...press, buttons: 2 }));
        scene.dispatchEvent(new PointerEvent('contextmenu', { ...press, buttons: 2 }));
        scene.dispatchEvent(new PointerEvent('pointerup', { ...press, buttons: 0 }));
      }
      const menu = page.getByRole('menu');
      expect(menu).toBeVisible();
      return menu;
    },
    { timeout: 30_000 }
  );
}

export const Controls = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 37 },
    });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: 'Spice' })).toBeVisible(), {
      timeout: 30_000,
    });
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByRole('region', { name: 'Faction bank' })).toBeVisible());
    expect(page.getByLabelText('Banked spice')).toHaveTextContent('37');
    expect(page.queryByRole('button', { name: 'Take into bank' })).toBeNull();
    const amount = page.getByRole('textbox', { name: 'Spice to withdraw' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '38');
    expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '37');
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    const command = [...playingSession.transport.messages].reverse().find((message) => message.type === 'command');
    expect(command?.action).toEqual({ kind: 'bank-withdraw', amount: 37 });
    playingSession.transport.deliver(
      playingSession.transport.view(
        { ...initialSnapshot(), revision: 1, bank: { factionId: 'house-harkonnen', balance: 0 } },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByLabelText('Banked spice')).toHaveTextContent('0'));
    expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    const observerSnapshot = initialSnapshot('neutral');
    delete observerSnapshot.hand;
    delete observerSnapshot.bank;
    const observer = playingSession.transport.view({ ...observerSnapshot, revision: 2 });
    playingSession.transport.deliver({ ...observer, viewer: { ...observer.viewer, viewerSeat: 'neutral' } });
    await waitFor(() => expect(page.queryByRole('region', { name: 'Faction bank' })).toBeNull());
  },
});

export const ControlsNarrow = meta.story({
  parameters: parameters('ready'),
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: () => {
    playingSession.transport = hostedStoryTransport('atreides', {
      ...initialSnapshot('seat-1'),
      bank: { factionId: 'house-atreides', balance: 0 },
    });
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Spice' })).toBeVisible());
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByLabelText('Banked spice')).toBeVisible());
    await userEvent.hover(page.getByRole('button', { name: 'Help: Faction bank' }));
    await waitFor(() => expect(page.getByText(/^Faction bank\. Only you see this balance\./)).toBeVisible());
    await userEvent.unhover(page.getByRole('button', { name: 'Help: Faction bank' }));
    expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    expect(page.queryByRole('button', { name: 'Take into bank' })).toBeNull();
  },
});

export const TreacheryDeck = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = initialSnapshot();
    const face = (name: string) => new URL(`/play-fixtures/dreamrules/${name}.jpg`, location.origin).href;
    const card = (index: number, name: string, faceUp: boolean) => ({
      id: `dreamrules-${index}`,
      faceUp,
      artwork: { ...(faceUp ? { front: face(name), name } : {}), back: face('cardback'), type: 'card-treachery' },
    });
    const dealt = [
      'supplies',
      'shield',
      'shield',
      'shield',
      'shield',
      'shield',
      'snooper',
      'snooper',
      'snooper',
      'snooper',
    ];
    for (const piece of snapshot.table.pieces) {
      if (piece.id === 'treachery-deck') {
        piece.items = dealt.map((name, index) => card(index + 1, name, false));
      }
      if (piece.id === 'treachery-card-loose') {
        piece.items = [card(11, 'snooper', true)];
      }
    }
    dealtSnapshot = snapshot;
    playingSession.transport = hostedStoryTransport('harkonnen', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('group', { name: 'Table view' })).toBeVisible());
    /*
     * The test browser draws no textures, so the faces are checked where the scene reads them: the
     * served snapshot's treachery pieces carry the fixture fronts and the deck's back, ten hidden
     * and one shown, under the fixture's own piece ids.
     */
    const pieces = dealtSnapshot.table.pieces.filter((piece) => piece.stackKey === 'cards:treachery');
    expect(pieces.map((piece) => [piece.id, piece.items.length])).toEqual([
      ['treachery-deck', 10],
      ['treachery-card-loose', 1],
    ]);
    for (const item of pieces.flatMap((piece) => piece.items)) {
      expect(item.artwork?.back).toContain('/play-fixtures/dreamrules/cardback.jpg');
      if (item.faceUp) {
        expect(item.artwork?.front).toContain('/play-fixtures/dreamrules/snooper.jpg');
      } else {
        expect(item.artwork?.front).toBeUndefined();
        expect(item.artwork?.name).toBeUndefined();
      }
    }
    expect(pieces.flatMap((piece) => piece.items).filter((item) => item.faceUp)).toHaveLength(1);
  },
});

export const HiddenDeckBacks = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = initialSnapshot();
    const card = {
      ...snapshot.table.pieces.find((piece) => piece.kind === 'card')!,
      id: 'hidden-inventory-deck',
      label: 'Treachery deck',
      inventory: 'shared' as const,
      items: [
        {
          id: 'opaque-card',
          faceUp: false,
          artwork: { back: cardBack(), type: 'card-treachery' },
        },
      ],
    };
    snapshot.table.pieces.push(card, {
      ...card,
      id: 'hidden-board-card',
      inventory: undefined,
      position: [0, 0.38, 0],
    });
    playingSession.transport = hostedStoryTransport('harkonnen', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared inventory');
    await waitFor(
      () => expect(page.getByRole('button', { name: 'Drag Treachery deck onto the table' })).toBeVisible(),
      {
        timeout: 30_000,
      }
    );
    expect(page.getByRole('img', { name: 'Treachery deck' })).toHaveAttribute('src', cardBack());
    expect(page.getByRole('button', { name: 'Drag Treachery deck onto the table' })).toBeEnabled();
  },
});

export const PrivateDrawAndDeal = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    const snapshot = initialSnapshot();
    const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
    snapshot.hand!.push({ ...card, owner: 'house-harkonnen' });
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    playingSession.transport = hostedStoryTransport('seat-2', snapshot);
    return activateRuntime();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: /^Hand$/ }));
    await expect(page.findByRole('button', { name: 'Drag Snooper from hand' })).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Drag Feyd Rautha from hand' })).toBeVisible();
  },
});
