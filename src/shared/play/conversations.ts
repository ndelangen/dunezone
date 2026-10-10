import { z } from 'zod';

import { tableCountSchema as count, tableIdSchema as id } from './schema';

/* Channels are the conversations beyond a faction pair; their ids use characters a faction id never holds, so they never collide with one. */
export const TABLE_CONVERSATION = '@table';
const GROUP_PREFIX = '@group.';
export const conversationPeerSchema = z.union([
  id,
  z.literal(TABLE_CONVERSATION),
  z
    .string()
    .max(4000)
    .regex(/^@group(\.[a-zA-Z0-9_-]{1,160}){3,}$/),
]);

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

/** A group's id names its members, sorted, so the same factions always meet in the same group whoever starts it. */
export function groupConversationId(members: readonly string[]) {
  return GROUP_PREFIX + [...new Set(members)].sort().join('.');
}

/** The factions in a group, or undefined when `peerId` is not a group. */
export function groupMembers(peerId: string): string[] | undefined {
  return peerId.startsWith(GROUP_PREFIX) ? peerId.slice(GROUP_PREFIX.length).split('.') : undefined;
}

/** Whether `peerId` is a channel rather than another faction. */
export function isChannel(peerId: string) {
  return peerId === TABLE_CONVERSATION || groupMembers(peerId) !== undefined;
}

/**
 * Who a conversation reaches: the pair, every seated faction for the table, or a group's members.
 * Undefined when `factionId` may not take part in it.
 */
export function conversationMembers(factionId: string, peerId: string, seated: readonly string[]) {
  if (!seated.includes(factionId)) {
    return undefined;
  }
  if (peerId === TABLE_CONVERSATION) {
    return [...seated];
  }
  const group = groupMembers(peerId);
  if (group) {
    const valid =
      group.length >= 3 &&
      new Set(group).size === group.length &&
      groupConversationId(group) === peerId &&
      group.includes(factionId) &&
      group.every((member) => seated.includes(member));
    return valid ? group : undefined;
  }
  return peerId !== factionId && seated.includes(peerId) ? [factionId, peerId] : undefined;
}

/** How `viewer` names a conversation `sender` wrote in: a channel is the same for every member, a pair is named by its other side. */
export function conversationPeerFor(viewer: string, sender: string, peerId: string) {
  if (isChannel(peerId) || viewer === sender) {
    return peerId;
  }
  return sender;
}
