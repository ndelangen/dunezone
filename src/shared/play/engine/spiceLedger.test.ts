import { expect, test } from 'vite-plus/test';

import type { CommitMessage, GameSnapshot, Viewer } from '../protocol';
import { SpiceLedger } from './spiceLedger';

/* Describing a transfer reads no storage; the ledger only creates its table. */
const ledger = new SpiceLedger({ sql: { exec: () => undefined } } as unknown as DurableObjectStorage);
const snapshot = { revision: 4, table: { pieces: [] } } as unknown as GameSnapshot;
const viewer = { userId: 'user-1', displayName: 'Alia' } as Viewer;
const gift = {
  type: 'drop',
  commandId: 'give',
  carryId: 'carry',
  position: [0, 0, 0],
  orientation: 0,
  give: { as: 'payment', factionId: 'atreides' },
} as unknown as CommitMessage;

test('a gift records the faction it came from beside the name of the player who gave it', () => {
  expect(ledger.describe(snapshot, { ...snapshot, revision: 5 }, gift, viewer, 'harkonnen', 3)).toEqual({
    revision: 5,
    actor: 'Alia',
    kind: 'payment',
    amount: 3,
    source: 'table',
    destination: 'atreides',
    giver: 'harkonnen',
  });
});

test('a gift from a player the room seats at no faction records no giver', () => {
  expect(ledger.describe(snapshot, { ...snapshot, revision: 5 }, gift, viewer, undefined, 3)).not.toHaveProperty(
    'giver'
  );
});
