import { testingPreview } from '@sb/preview';
import type { LogEntry } from '@shared/play/log';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
  AUDIT_LOG,
  GAME_LOG,
  gameLogReads,
  gameMeta,
  install,
  revealedPredictionSnapshot,
  session,
} from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { productTransport, playingSnapshot } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Log',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

export const Audit = meta.story({
  beforeEach: install(() => {
    const snapshot = playingSnapshot();
    snapshot.removalVotes = [];
    return productTransport('seat-2', snapshot, { logEntries: { audit: AUDIT_LOG } });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Game log');
    await openTab(page, 'Audit');
    const log = await page.findByRole('region', { name: 'Audit log' });
    await expect(within(log).findByText(/Central keeps seat 1/)).resolves.toBeVisible();
    await expect(within(log).getByText('[deleted user] left seat 6 when the account was deleted.')).toBeVisible();
    await expect(page.queryByRole('tab', { name: 'Central, removal vote in progress' })).toBeNull();
  },
});

export const Pagination = meta.story({
  beforeEach: install(() => productTransport('seat-6', revealedPredictionSnapshot(), { holdLogHistory: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Game log');
    await waitFor(() => expect(gameLogReads(session.transport.messages).length).toBeGreaterThan(0));
    const latest = GAME_LOG[0]!;
    const older: LogEntry = {
      sequence: 1,
      class: 'phase',
      text: 'Trading ended and setup began.',
      context: 'Swapping',
      at: 1,
    };
    session.transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
      entries: [latest],
      more: true,
    });
    await userEvent.click(await page.findByRole('button', { name: 'Earlier entries' }));
    const messagesBeforeUpdate = session.transport.messages.length;
    const updated = revealedPredictionSnapshot();
    updated.revision += 1;
    session.transport.deliver(session.transport.view(updated));
    await waitFor(async () => {
      const later = gameLogReads(session.transport.messages.slice(messagesBeforeUpdate));
      await expect(later.length).toBeGreaterThan(0);
      await expect(later.every((message) => message.before === latest.sequence)).toBe(true);
    });
    session.transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: latest.sequence,
      entries: [older],
      more: false,
    });
    await expect(page.findByText('Trading ended and setup began.')).resolves.toBeVisible();
    const messagesBeforeDeparture = session.transport.messages.length;
    const departed = session.transport.view({ ...updated, revision: updated.revision + 1 });
    departed.viewer = { ...departed.viewer, viewerSeat: SPECTATOR_SEAT };
    delete departed.snapshot.bank;
    delete departed.snapshot.hand;
    session.transport.deliver(departed);
    await waitFor(async () => {
      const reads = gameLogReads(session.transport.messages.slice(messagesBeforeDeparture));
      await expect(reads.length).toBeGreaterThan(0);
      await expect(reads.every((message) => message.before === latest.sequence)).toBe(true);
    });
    await expect(page.findByText('Trading ended and setup began.')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Latest entries' }));
    await expect(gameLogReads(session.transport.messages).at(-1)).toEqual({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
    });
    session.transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
      entries: [latest],
      more: true,
    });
    await expect(page.findByText(latest.text)).resolves.toBeVisible();
    await expect(page.queryByText('Trading ended and setup began.')).toBeNull();
  },
});
