import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ConversationMessage } from '@shared/play/conversations';
import type { Decorator } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { conversationMessages, conversationPair, tableMessages } from '../../../routes/_app/play/game.stories.fixture';
import { playingSnapshot } from '../../../routes/_app/play/product.stories.fixture';
import { factionToken } from '../../seats/FactionTokenFace';
import { ServerClockContext } from '../../table/useServerNow';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { ConversationPanel } from './ConversationPanel';
import type { ConversationPanelProps } from './ConversationPanel';
import { tableMentions } from './useConversationPanel';

/* Saved messages say how long ago they were saved, by the table's clock. */
const serverClock: Decorator = (Story) => (
  <ServerClockContext value={() => STORYBOOK_NOW}>
    <Story />
  </ServerClockContext>
);

/** A page of saved history, newest last, as the table hands it once loaded. */
export function savedPage(entries: ConversationMessage[], more = false): ConversationPanelProps['page'] {
  return { entries, more, load: { state: 'idle' } };
}

/** Seat 2's chat with Central in seat 1: the newest fifty of their messages, with earlier ones still to load. */
export function playerChatArgs(): ConversationPanelProps {
  const { factionId, peerId } = conversationPair();
  return {
    peerId,
    factionId,
    online: true,
    page: savedPage(conversationMessages().slice(-50), true),
    pending: [],
    senders: null,
    unread: false,
    drafts: new Map(),
    onLoad: fn(),
    onRead: fn(),
    onRetry: fn(),
    onSubmit: fn((_text: string) => true),
  };
}

/** The table's chat as seat 2 reads it: several factions talking, each message beside its writer's faction token. */
export function tableChatArgs(): ConversationPanelProps {
  const snapshot = playingSnapshot();
  const table = tableOf(snapshot);
  const factions = snapshot.roster!.seats.flatMap((seat) => (seat.faction ? [seat.faction] : []));
  const names = Object.fromEntries(factions.map((faction) => [faction.id, faction.name]));
  const senders = Object.fromEntries(factions.map((faction) => [faction.id, factionToken(table, faction.id, names)]));
  return {
    ...playerChatArgs(),
    peerId: TABLE_CONVERSATION,
    page: savedPage(tableMessages()),
    senders,
    mentions: tableMentions(
      table,
      senders,
      factions.map((faction) => faction.id)
    ),
    onMentionInfo: fn(),
    onMentionChat: fn(),
  };
}

/** The table's chat with a reply that names a seat's faction after an @, as the composer completes it. */
export function tableChatNamingArgs(): ConversationPanelProps {
  const args = tableChatArgs();
  const entries = args.page!.entries;
  const named = args.mentions!.find((mention) => !mention.own && mention.detail)!;
  const reply = {
    ...entries.at(-1)!,
    sequence: entries.length + 1,
    requestId: 'table-naming',
    text: `@${named.label} which way does the storm go?`,
    savedAt: entries.at(-1)!.savedAt + 60_000,
  };
  return { ...args, page: savedPage([...entries, reply]) };
}

/**
 * The table's chat in a game that announces private messages: between the messages, quiet lines say who wrote to whom.
 * Three notes in a row from one faction to another read as one line.
 */
export function tableChatWhispersArgs(): ConversationPanelProps {
  const args = tableChatArgs();
  const [first, second, third] = Object.keys(args.senders!);
  const whisper = (from: string, to: string) => ({ senderFactionId: from, author: '', text: '', whisperTo: to });
  const messages = args.page!.entries;
  const lines = [
    ...messages.slice(0, 2),
    whisper(first!, second!),
    ...messages.slice(2),
    whisper(second!, third!),
    whisper(second!, third!),
    whisper(second!, third!),
    whisper(third!, second!),
  ];
  const start = messages[0]!.savedAt;
  return {
    ...args,
    page: savedPage(
      lines.map((line, index) => ({
        requestId: `table-whispers-${index}`,
        ...line,
        sequence: index + 1,
        savedAt: start + index * 30_000,
      }))
    ),
  };
}

/** A message of the viewer's own on its way, in the given delivery state. */
export function pendingMessage(delivery: ConversationPanelProps['pending'][number]['delivery']) {
  const { factionId, peerId } = conversationPair();
  return {
    request: {
      type: 'conversation-send' as const,
      requestId: 'pending-one',
      factionId,
      peerId,
      text: 'Agreed, I will hold Arrakeen.',
    },
    delivery,
  };
}

/** The chat window with a player: named by its player in the table, so here by Central. */
const PLAYER_CHAT_WINDOW = { ...PANEL_WINDOWS.playerChat, label: 'Central', fill: true };

export const conversationPanelMeta = {
  ...panelMeta(PLAYER_CHAT_WINDOW),
  decorators: [serverClock, ...panelMeta(PLAYER_CHAT_WINDOW).decorators],
  component: ConversationPanel,
  args: playerChatArgs(),
};
