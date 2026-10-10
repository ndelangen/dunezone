import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

type Identity = Parameters<Room['command']>[0];

const bob: Identity = {
  connectionId: 'bob-connection',
  userId: 'bob-user',
  viewerSeat: 'atreides',
  displayName: 'bob',
  color: '#d0c8b9',
};
const spectator: Identity = { ...bob, connectionId: 'eve-connection', userId: 'eve-user', viewerSeat: 'neutral' };
const LATER = Date.now();

function room() {
  return new Room(
    { ...initialSnapshot(), roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    (userId) => (userId === bob.userId ? 'atreides' : undefined)
  );
}

test('a seated faction sets the last turn, and the table logs it', () => {
  const table = room();
  expect(table.snapshot.lastTurn).toBeUndefined();
  table.accept(table.command(bob, { kind: 'last-turn', turn: 7 }, table.snapshot.revision, LATER));
  expect(table.snapshot.lastTurn).toBe(7);
  expect(table.snapshot.table.events[0]?.message).toBe('The game now ends after turn 7.');
});

test('the last turn it already has, and a spectator, are refused', () => {
  const table = room();
  expect(() => table.command(bob, { kind: 'last-turn', turn: 10 }, table.snapshot.revision, LATER)).toThrow(
    'The last turn is already turn 10.'
  );
  expect(() => table.command(spectator, { kind: 'last-turn', turn: 6 }, table.snapshot.revision, LATER)).toThrow(
    'Spectators can watch but cannot change the table'
  );
});
