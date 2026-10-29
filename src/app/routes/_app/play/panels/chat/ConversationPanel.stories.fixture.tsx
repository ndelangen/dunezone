import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ConversationMessage } from '@shared/play/conversations';
import type { Decorator } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { conversationMessages, conversationPair, tableMessages } from '../../game.stories.fixture';
import { ServerClockContext } from '../../multiplayer/useServerNow';
import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { ConversationPanel } from './ConversationPanel';
import type { ConversationPanelProps } from './ConversationPanel';

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

/** The table's chat as seat 2 reads it: several factions talking, each message naming its writer's faction. */
export function tableChatArgs(): ConversationPanelProps {
  const seats = playingSnapshot().roster!.seats;
  return {
    ...playerChatArgs(),
    peerId: TABLE_CONVERSATION,
    page: savedPage(tableMessages()),
    senders: Object.fromEntries(seats.flatMap((seat) => (seat.faction ? [[seat.faction.id, seat.faction.name]] : []))),
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
