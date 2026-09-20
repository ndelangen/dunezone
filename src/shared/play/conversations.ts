import { z } from 'zod';

import { tableCountSchema as count, tableIdSchema as id } from './schema';

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
export const conversationSummarySchema = z.object({ peerId: id, latest: count, unread: count });
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** Conversations open once assigned factions enter setup and remain readable after play ends. */
export function conversationsAvailable(stage: string | undefined) {
  return stage === 'setup' || stage === 'play' || stage === 'finished';
}
