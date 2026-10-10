import { z } from 'zod';

import { tableCountSchema as count, tableIdSchema as id } from './schema';

/* The whole table's conversation; its id holds a character a faction id never does, so it never collides with one. */
export const TABLE_CONVERSATION = '@table';
export const conversationPeerSchema = z.union([id, z.literal(TABLE_CONVERSATION)]);

export const conversationTextSchema = z.string().trim().min(1).max(2000);
export const conversationMessageSchema = z.object({
  sequence: count,
  requestId: id,
  senderFactionId: id,
  author: z.string(),
  text: z.string(),
  savedAt: count,
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export const conversationSummarySchema = z.object({ peerId: conversationPeerSchema, latest: count, unread: count });
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** Conversations open once assigned factions enter setup and remain readable after play ends. */
export function conversationsAvailable(stage: string | undefined) {
  return stage === 'setup' || stage === 'play' || stage === 'finished';
}

/**
 * Who a conversation reaches: the pair, or every seated faction for the table.
 * Undefined when `factionId` may not take part in it.
 */
export function conversationMembers(factionId: string, peerId: string, seated: readonly string[]) {
  if (!seated.includes(factionId)) {
    return undefined;
  }
  if (peerId === TABLE_CONVERSATION) {
    return [...seated];
  }
  return peerId !== factionId && seated.includes(peerId) ? [factionId, peerId] : undefined;
}

/** How `viewer` names a conversation `sender` wrote in: the table is the same for everyone, a pair is named by its other side. */
export function conversationPeerFor(viewer: string, sender: string, peerId: string) {
  if (peerId === TABLE_CONVERSATION || viewer === sender) {
    return peerId;
  }
  return sender;
}
