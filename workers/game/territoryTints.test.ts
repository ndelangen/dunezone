import { expect, test } from 'vite-plus/test';

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

test('a seated faction makes a tint, paints territories in and out, and removes it', () => {
  const table = room();
  const send = (action: Parameters<Room['command']>[1]) =>
    table.accept(table.command(bob, action, table.snapshot.revision, LATER));
  send({ kind: 'tint-create', tintId: 'zone', name: 'Fremen deployment', color: '#2f7fe0', territories: ['tabr'] });
  send({ kind: 'tint-paint', tintId: 'zone', territory: 'carthag', name: 'Carthag' });
  expect(table.snapshot.tints).toEqual([
    { id: 'zone', name: 'Fremen deployment', color: '#2f7fe0', territories: ['tabr', 'carthag'] },
  ]);
  send({ kind: 'tint-paint', tintId: 'zone', territory: 'tabr', name: 'Tabr' });
  expect(table.snapshot.tints?.[0]?.territories).toEqual(['carthag']);
  expect(table.snapshot.table.events[0]?.message).toBe('Took Tabr out of the Fremen deployment tint.');
  send({ kind: 'tint-remove', tintId: 'zone' });
  expect(table.snapshot.tints).toEqual([]);
});

test('a spectator, a repeated tint and a missing tint are refused', () => {
  const table = room();
  const create = { kind: 'tint-create', tintId: 'zone', name: 'Red', color: '#d63a2a', territories: [] } as const;
  expect(() => table.command(spectator, create, table.snapshot.revision, LATER)).toThrow(
    'Spectators can watch but cannot change the table'
  );
  table.accept(table.command(bob, create, table.snapshot.revision, LATER));
  expect(() => table.command(bob, create, table.snapshot.revision, LATER)).toThrow(
    'That tint is already on the table.'
  );
  expect(() => table.command(bob, { kind: 'tint-remove', tintId: 'other' }, table.snapshot.revision, LATER)).toThrow(
    'That tint is no longer on the table.'
  );
});
