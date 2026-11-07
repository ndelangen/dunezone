import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { PANEL_WINDOWS } from '../panelWindows';
import {
  conversationPanelMeta,
  pendingMessage,
  playerChatArgs,
  savedPage,
  tableChatArgs,
  tableChatNamingArgs,
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

/** The table's chat: behind each writer's name, their faction's token and name. */
export const WithTheTable = meta.story({
  args: tableChatArgs(),
  parameters: { panelWindow: { ...PANEL_WINDOWS.tableChat, fill: true } },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getByText('Who is bidding on this one?')).toBeVisible();
    /* Each message names its writer's faction beside the faction's token face as it lies on the table. */
    const headers = [...canvasElement.querySelectorAll<HTMLElement>('[data-message-sender]')];
    await expect(headers).toHaveLength(args.page!.entries.length);
    for (const header of headers) {
      const token = args.senders![header.dataset.messageSender!]!;
      await expect(within(header).getByText(token.name)).toBeVisible();
      await expect(header.querySelector('img')).toHaveAttribute('src', token.src);
    }
  },
});

/** Typing @ at the table suggests every other seat: its faction, with its token and player beside it. */
export const SuggestsMentions = meta.story({
  args: tableChatArgs(),
  parameters: { panelWindow: { ...PANEL_WINDOWS.tableChat, fill: true } },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), '@');
    const options = await within(document.body).findAllByRole('option');
    await expect(options.map((option) => option.textContent)).toEqual(
      args.mentions!.filter((mention) => !mention.own).map((mention) => `${mention.label}${mention.detail ?? ''}`)
    );
  },
});

/** A message that names a seat after an @ underlines it; hovering it, or a writer's token, shows the seat's card (see Mention card). */
export const NamesASeat = meta.story({
  args: tableChatNamingArgs(),
  parameters: { panelWindow: { ...PANEL_WINDOWS.tableChat, fill: true } },
  play: async ({ canvasElement }) => {
    const named = canvasElement.querySelector<HTMLElement>('[data-mention]');
    await expect(named).toBeVisible();
    await expect(named!.textContent).toMatch(/^@/);
  },
});

/** Nobody has written yet. */
export const Empty = meta.story({
  args: { page: savedPage([]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No messages yet.')).toBeVisible();
  },
});

/** The viewer cleared this chat, so its empty history says so; the other side still has every message. */
export const Cleared = meta.story({
  args: { page: savedPage([]), cleared: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('You cleared this chat.')).toBeVisible();
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
