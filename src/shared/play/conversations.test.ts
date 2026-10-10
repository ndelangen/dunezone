import { expect, test } from 'vitest';

import {
  conversationMembers,
  conversationPeerFor,
  conversationPeerSchema,
  groupConversationId,
  TABLE_CONVERSATION,
} from './conversations';

const seated = ['atreides', 'emperor', 'fremen', 'guild'];

test('a pair reaches its two factions, the table every seated faction, and a group its members', () => {
  expect(conversationMembers('atreides', 'fremen', seated)).toEqual(['atreides', 'fremen']);
  expect(conversationMembers('atreides', TABLE_CONVERSATION, seated)).toEqual(seated);
  const group = groupConversationId(['fremen', 'atreides', 'emperor']);
  expect(group).toBe('@group.atreides.emperor.fremen');
  expect(conversationMembers('emperor', group, seated)).toEqual(['atreides', 'emperor', 'fremen']);
});

test('nobody reaches a conversation they are not in, nor one with an unseated faction', () => {
  const group = groupConversationId(['atreides', 'emperor', 'fremen']);
  expect(conversationMembers('guild', group, seated)).toBeUndefined();
  expect(conversationMembers('atreides', 'atreides', seated)).toBeUndefined();
  expect(conversationMembers('atreides', 'harkonnen', seated)).toBeUndefined();
  expect(conversationMembers('harkonnen', TABLE_CONVERSATION, seated)).toBeUndefined();
  expect(conversationMembers('atreides', groupConversationId(['atreides', 'emperor', 'harkonnen']), seated)).toBe(
    undefined
  );
});

test('a group is three or more distinct factions, named in sorted order', () => {
  expect(conversationMembers('atreides', '@group.atreides.emperor', seated)).toBeUndefined();
  expect(conversationMembers('atreides', '@group.fremen.atreides.emperor', seated)).toBeUndefined();
  expect(conversationMembers('atreides', '@group.atreides.atreides.emperor', seated)).toBeUndefined();
  expect(conversationPeerSchema.safeParse('@group.atreides.emperor').success).toBe(false);
  expect(conversationPeerSchema.safeParse('@group.atreides.emperor.fremen').success).toBe(true);
  expect(conversationPeerSchema.safeParse(TABLE_CONVERSATION).success).toBe(true);
});

test('each member names a channel by its id, and a pair by its other side', () => {
  expect(conversationPeerFor('fremen', 'atreides', TABLE_CONVERSATION)).toBe(TABLE_CONVERSATION);
  expect(conversationPeerFor('fremen', 'atreides', 'fremen')).toBe('atreides');
  expect(conversationPeerFor('atreides', 'atreides', 'fremen')).toBe('fremen');
});
