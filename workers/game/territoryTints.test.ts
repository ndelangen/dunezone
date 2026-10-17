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
  send({ kind: 'tint-paint', tintId: 'zone', territory: 'carthag', name: 'Carthag', painted: true });
  expect(table.snapshot.tints).toEqual([
    { id: 'zone', name: 'Fremen deployment', color: '#2f7fe0', territories: ['tabr', 'carthag'] },
  ]);
  send({ kind: 'tint-paint', tintId: 'zone', territory: 'tabr', name: 'Tabr', painted: false });
  expect(table.snapshot.tints?.[0]?.territories).toEqual(['carthag']);
  expect(table.snapshot.table.events[0]?.message).toBe('Took Tabr out of Fremen deployment.');
  send({ kind: 'tint-remove', tintId: 'zone' });
  expect(table.snapshot.tints).toEqual([]);
});

test('a spectator, a repeated tint and a missing tint are refused', () => {
  const table = room();
  const create: Parameters<Room['command']>[1] = {
    kind: 'tint-create',
    tintId: 'zone',
    name: 'Red',
    color: '#d63a2a',
    territories: [],
  };
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

test('a paint that crossed another for the same territory is refused rather than undoing it', () => {
  const table = room();
  table.accept(
    table.command(
      bob,
      { kind: 'tint-create', tintId: 'zone', name: 'Blue tint', color: '#2f7fe0', territories: ['carthag'] },
      table.snapshot.revision,
      LATER
    )
  );
  expect(() =>
    table.command(
      bob,
      { kind: 'tint-paint', tintId: 'zone', territory: 'carthag', name: 'Carthag', painted: true },
      table.snapshot.revision,
      LATER
    )
  ).toThrow('Carthag is already in Blue tint.');
  expect(table.snapshot.tints?.[0]?.territories).toEqual(['carthag']);
});

test('a tint is hidden and shown, and outlined, and takes city and spice stickers in a set order', () => {
  const table = room();
  const send = (action: Parameters<Room['command']>[1]) =>
    table.accept(table.command(bob, action, table.snapshot.revision, LATER));
  send({ kind: 'tint-create', tintId: 'zone', name: 'Shield Wall', color: '#1b1b1b', territories: ['shield_wall'] });
  send({ kind: 'tint-set', tintId: 'zone', setting: 'spice', on: true });
  send({ kind: 'tint-set', tintId: 'zone', setting: 'city', on: true });
  send({ kind: 'tint-set', tintId: 'zone', setting: 'hidden', on: true });
  expect(table.snapshot.tints?.[0]).toMatchObject({ stamps: ['city', 'spice'], hidden: true });
  expect(table.snapshot.table.events[0]?.message).toBe('Hid Shield Wall.');
  send({ kind: 'tint-set', tintId: 'zone', setting: 'hidden', on: false });
  send({ kind: 'tint-set', tintId: 'zone', setting: 'city', on: false });
  expect(table.snapshot.table.events[0]?.message).toBe('Took the city stickers off Shield Wall.');
  send({ kind: 'tint-set', tintId: 'zone', setting: 'outline', on: true });
  expect(table.snapshot.table.events[0]?.message).toBe('Outlined Shield Wall.');
  expect(table.snapshot.tints?.[0]).toEqual({
    id: 'zone',
    name: 'Shield Wall',
    color: '#1b1b1b',
    stamps: ['spice'],
    outline: true,
    territories: ['shield_wall'],
  });
  expect(() =>
    table.command(bob, { kind: 'tint-set', tintId: 'zone', setting: 'spice', on: true }, table.snapshot.revision, LATER)
  ).toThrow('Someone changed Shield Wall first.');
});

test('a tint takes any colour, and the same colour again is refused', () => {
  const table = room();
  const send = (action: Parameters<Room['command']>[1]) =>
    table.accept(table.command(bob, action, table.snapshot.revision, LATER));
  send({ kind: 'tint-create', tintId: 'zone', name: 'Zone', color: '#2f7fe0', territories: [] });
  send({ kind: 'tint-color', tintId: 'zone', color: '#7a3e9d' });
  expect(table.snapshot.tints?.[0]?.color).toBe('#7a3e9d');
  expect(table.snapshot.table.events[0]?.message).toBe('Recoloured Zone.');
  expect(() =>
    table.command(bob, { kind: 'tint-color', tintId: 'zone', color: '#7a3e9d' }, table.snapshot.revision, LATER)
  ).toThrow('Zone is already that colour.');
});
