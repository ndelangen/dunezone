import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { openPlayer, WAIT } from './controls.stories.fixture';
import {
  conversationMessages,
  conversationPair,
  gameMeta,
  install,
  session,
  tableMessages,
} from './game.stories.fixture';
import { productTransport, playingSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Conversations',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A private conversation with another player. */
export const WithAPlayer = meta.story({
  /* Reduced motion drops the entrance iris, as History below explains. */
  globals: { motion: 'reduce' },
  beforeEach: install(() =>
    productTransport('seat-2', playingSnapshot(), { conversationMessages: conversationMessages() })
  ),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Twaffle', 'Conversation');
    await expect(page.findByText('Shall we keep the southern route open?', {}, WAIT)).resolves.toBeVisible();
  },
});

/** The whole table talking together, beside the one-to-one conversations. */
export const WithTheTable = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: install(() => productTransport('seat-2', playingSnapshot(), { conversationMessages: tableMessages() })),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Table', 'Conversation');
    await expect(page.findByText('Who is bidding on this one?', {}, WAIT)).resolves.toBeVisible();
  },
});

export const History = meta.story({
  /*
   * Reduced motion drops the shell's entrance iris, whose clip-path hides the history's end marker from the read observer until the iris has drawn open.
   * A runner that draws few frames can keep the iris closed past the read wait's bound (#1304).
   */
  globals: { motion: 'reduce' },
  beforeEach: install(() =>
    productTransport('seat-2', playingSnapshot(), { conversationMessages: conversationMessages() })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('tab', { name: 'Twaffle' });
    page.getByRole('separator', { name: 'Resize controls panel' }).focus();
    await userEvent.keyboard('{End}');
    await userEvent.click(page.getByRole('tab', { name: 'Info' }));
    const { factionId, peerId } = conversationPair();
    session.transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 55, unread: 55 }],
    });
    await expect(page.findByRole('tab', { name: 'Twaffle, 55 unread' })).resolves.toBeVisible();
    await expect(session.transport.messages.some((entry) => entry.type === 'conversation-read')).toBe(false);
    await userEvent.click(page.getByRole('tab', { name: 'Conversation' }));
    await page.findByText('Shall we keep the southern route open?');
    const loadedHistory = page.getByRole('region', { name: 'Conversation history' });
    await waitFor(() =>
      expect(loadedHistory.scrollHeight - loadedHistory.scrollTop - loadedHistory.clientHeight).toBeLessThan(8)
    );
    /*
     * The read receipt follows an IntersectionObserver entry for the history's end marker, and the browser delivers those only while it updates the rendering of a frame.
     * No wait can draw that frame, and the runner has gone more than nine seconds without one, so this wait takes a bound longer than the default ten seconds.
     */
    await waitFor(
      () =>
        expect(
          session.transport.messages.some((entry) => entry.type === 'conversation-read' && entry.through === 55)
        ).toBe(true),
      { timeout: 30_000 }
    );
    session.transport.deliver({
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
    session.transport.deliver({
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
    session.transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 56, unread: 1 }],
    });
    await expect(page.findByRole('tab', { name: 'Twaffle, 1 unread' })).resolves.toBeVisible();
    await expect(
      session.transport.messages.some((entry) => entry.type === 'conversation-read' && entry.through === 56)
    ).toBe(false);
    await expect(Math.abs(history.scrollTop - readingPosition)).toBeLessThan(2);
    await expect(page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top).toBe(composerTop);
    history.scrollTop = history.scrollHeight;
    history.dispatchEvent(new Event('scroll'));
    session.transport.deliver({
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
    await expect(page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top).toBe(composerTop);

    await userEvent.click(page.getByRole('tab', { name: 'Info' }));
    await expect(page.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await userEvent.click(page.getByRole('tab', { name: 'fectumbra' }));
    await expect(page.findByRole('textbox', { name: 'Message' })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'Thialfi' }));
    await expect(page.queryByRole('tab', { name: 'Conversation' })).toBeNull();
  },
});

export const Delivery = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Message' });
    await userEvent.type(page.getByRole('textbox', { name: 'Message' }), 'I can keep the southern route open.');
    await userEvent.click(page.getByRole('button', { name: /^Send$/ }));
    await expect(page.findByText('Pending', { exact: true })).resolves.toBeVisible();
    const sent = [...session.transport.messages].reverse().find((entry) => entry.type === 'conversation-send')!;
    session.transport.deliver({
      type: 'rejected',
      requestId: sent.requestId,
      message: 'The message could not be saved.',
    });
    await expect(page.findByText('Failed', { exact: true })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Retry$/ }));
    await expect([...session.transport.messages].reverse().find((entry) => entry.type === 'conversation-send')).toEqual(
      sent
    );
    const { factionId, peerId } = conversationPair();
    session.transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        sequence: 1,
        requestId: sent.requestId,
        senderFactionId: factionId,
        author: 'Thialfi',
        text: sent.text,
        savedAt: STORYBOOK_NOW - 120_000,
      },
    });
    await expect(page.findByText('Sent', { exact: true })).resolves.toBeVisible();
    await expect(page.getAllByText('I can keep the southern route open.')).toHaveLength(1);
    await expect(page.getByText('2 minutes ago')).toBeVisible();
  },
});

export const Offline = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('tab', { name: 'Conversation' });
    session.transport.deliver({ type: 'admission', status: 'suspended' });
    /* The locked table keeps its conversation panel, so a message written while reconnecting waits there. */
    await expect(
      page.findByText('Offline. Pending messages will send after your faction access is checked.')
    ).resolves.toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: 'Message' }), 'Send once I reconnect.');
    await userEvent.click(page.getByRole('button', { name: /^Send$/ }));
    await expect(page.findByText('Pending', { exact: true })).resolves.toBeVisible();
    await expect(session.transport.messages.filter((entry) => entry.type === 'conversation-send')).toHaveLength(0);
  },
});
