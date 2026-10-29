import { expect, test } from 'vite-plus/test';

import { bugReportDescriptionSchema } from './bugReports';
import { censorKnownMessage, censorReportConversations } from './reportConversations';
import { redactReportData } from './reportRedaction';

test.each([{ description: '' }, { description: ' \n\t ' }])('rejects empty report fields %j', (input) => {
  expect(bugReportDescriptionSchema.safeParse(input).success).toBe(false);
});

test('exports hidden gameplay while removing account identities and credentials', () => {
  const output = redactReportData({
    secret: 'private key',
    userId: 'account-id',
    sessionId: 'session-id',
    privatePredictions: { atreides: { choice: 'fremen' } },
    factionInventories: { fremen: [{ label: 'Lasgun', items: [{ faceUp: false }] }] },
    battleState: { plans: [{ strength: 9 }] },
    tokenArtwork: '/image/token/fremen',
    logs: ['Bearer private-value', 'email person@example.com', 'eyJhbGciOiJIUzI1NiJ9.eyJzZWNyZXQiOiJ4In0.signature'],
  });
  expect(output).toMatchObject({
    privatePredictions: { atreides: { choice: 'fremen' } },
    battleState: { plans: [{ strength: 9 }] },
    tokenArtwork: '/image/token/fremen',
  });
  expect(JSON.stringify(output)).not.toContain('account-id');
  expect(JSON.stringify(output)).not.toContain('private-value');
  expect(JSON.stringify(output)).not.toContain('person@example.com');
});

test('preserves only exact card handles in game references while still redacting credentials and free text', () => {
  const handle = `card-${'a'.repeat(64)}`;
  const credential = 'b'.repeat(64);
  const input = {
    id: handle,
    handOrder: [handle],
    cardIds: [handle],
    selectedPieceId: handle,
    references: [{ itemId: handle, pieceId: handle }],
    token: handle,
    password: handle,
    secret: credential,
    label: handle,
    invalid: { id: `${handle}-extra` },
    other: { id: credential },
    logs: [handle, credential],
  };
  expect(redactReportData(input)).toEqual({
    id: handle,
    handOrder: [handle],
    cardIds: [handle],
    selectedPieceId: handle,
    references: [{ itemId: handle, pieceId: handle }],
    label: 'card-[redacted credential]',
    invalid: { id: 'card-[redacted credential]-extra' },
    other: { id: '[redacted credential]' },
    logs: ['card-[redacted credential]', '[redacted credential]'],
  });
});

test('censors quoted chat, preserves lengths and does not re-censor existing replacements', () => {
  const original = {
    messages: [{ text: 'Hi 🌙', author: 'Private name', sequence: 8 }],
    delivery: { state: 'failed' },
  };
  const censored = censorReportConversations(original);
  expect(censored).toMatchObject({
    messages: [{ text: '-redacted message, original length: 4-', author: '[redacted sender]', sequence: 8 }],
  });
  expect(censorReportConversations(censored)).toEqual(censored);
  const log = JSON.stringify({ text: 'a "quoted"\nmessage' });
  expect(censorKnownMessage(log, 'a "quoted"\nmessage')).toContain('-redacted message, original length: 18-');
  expect(censorKnownMessage(censorKnownMessage('a', 'a'), '-')).toBe('-redacted message, original length: 1-');
});
