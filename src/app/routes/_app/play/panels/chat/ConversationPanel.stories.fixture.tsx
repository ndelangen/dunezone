import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ConversationMessage } from '@shared/play/conversations';
import type { Decorator } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { conversationMessages, conversationPair, tableMessages } from '../../game.stories.fixture';
import { factionToken } from '../../multiplayer/FactionTokenFace';
import { ServerClockContext } from '../../multiplayer/useServerNow';
import { playingSnapshot } from '../../product.stories.fixture';
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
