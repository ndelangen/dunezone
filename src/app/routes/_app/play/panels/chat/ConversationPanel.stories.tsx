import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { PANEL_WINDOWS } from '../panelWindows';
import {
  conversationPanelMeta,
  pendingMessage,
  playerChatArgs,
  savedPage,
  tableChatArgs,
} from './ConversationPanel.stories.fixture';

/*
 * A chat window on its own, as seat 2 sees it: the conversation's saved history, the viewer's messages on their way, and the composer.
 * Each story shows one state of one conversation.
 */
const meta = preview.meta({ ...conversationPanelMeta, title: 'Play/Panels/Chat' });

/** A private chat with Central, with earlier messages still to load above the newest fifty. */
export const WithAPlayer = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Shall we keep the southern route open?')).toBeVisible();
  },
});

/** The table's chat: every message also names its writer's faction. */
export const WithTheTable = meta.story({
  args: tableChatArgs(),
  parameters: { panelWindow: { ...PANEL_WINDOWS.tableChat, fill: true } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Who is bidding on this one?')).toBeVisible();
  },
});

/** Nobody has written yet. */
export const Empty = meta.story({
  args: { page: savedPage([]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No messages yet.')).toBeVisible();
  },
});

/** The history is loading for the first time. */
export const Loading = meta.story({
  args: { page: { entries: [], more: false, load: { state: 'loading', requestId: 'history-one', before: 0 } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Loading messages...')).toBeVisible();
  },
});

/** The history could not be loaded, and can be asked for again. */
export const HistoryFailed = meta.story({
  args: {
    page: { entries: [], more: false, load: { state: 'failed', error: 'The history could not be read.', before: 0 } },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Retry history' })).toBeVisible();
  },
});

/** The viewer's message waits to be saved. */
export const Pending = meta.story({
  args: { pending: [pendingMessage({ state: 'sent' })] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Pending')).toBeVisible();
  },
});

/** The viewer's message could not be saved: the reason, and a way to send it again. */
export const FailedSend = meta.story({
  args: { pending: [pendingMessage({ state: 'failed', error: 'The message could not be saved.' })] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('The message could not be saved.');
  },
});

/** The table is out of reach: what the viewer writes waits until it is back. */
export const Offline = meta.story({
  args: { ...playerChatArgs(), online: false, pending: [pendingMessage({ state: 'unsent' })] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Offline\. Pending messages will send/)).toBeVisible();
  },
});
