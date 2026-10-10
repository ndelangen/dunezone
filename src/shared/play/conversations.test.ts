import { expect, test } from 'vitest';

import { conversationMembers, conversationPeerFor, conversationPeerSchema, TABLE_CONVERSATION } from './conversations';

const seated = ['atreides', 'emperor', 'fremen'];

test('a pair reaches its two factions, and the table every seated faction', () => {
  expect(conversationMembers('atreides', 'fremen', seated)).toEqual(['atreides', 'fremen']);
  expect(conversationMembers('atreides', TABLE_CONVERSATION, seated)).toEqual(seated);
});

test('nobody reaches a conversation with themselves, an unseated faction, or the table without a seat', () => {
  expect(conversationMembers('atreides', 'atreides', seated)).toBeUndefined();
  expect(conversationMembers('atreides', 'harkonnen', seated)).toBeUndefined();
  expect(conversationMembers('harkonnen', TABLE_CONVERSATION, seated)).toBeUndefined();
  expect(conversationPeerSchema.safeParse('@group.atreides.emperor.fremen').success).toBe(false);
});

test('everyone names the table by its id, and a pair by its other side', () => {
  expect(conversationPeerFor('fremen', 'atreides', TABLE_CONVERSATION)).toBe(TABLE_CONVERSATION);
  expect(conversationPeerFor('fremen', 'atreides', 'fremen')).toBe('atreides');
  expect(conversationPeerFor('atreides', 'atreides', 'fremen')).toBe('fremen');
});
