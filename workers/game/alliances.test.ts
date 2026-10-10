import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

type Identity = Parameters<Room['command']>[0];

const identity = (seat: string): Identity => ({
  connectionId: `${seat}-connection`,
  userId: `${seat}-user`,
  viewerSeat: seat,
  displayName: seat,
  color: '#d0c8b9',
});
const atreides = identity('atreides');
const harkonnen = identity('harkonnen');

function room(stage: 'play' | 'drafting' = 'play') {
  return new Room(
    { ...initialSnapshot(), stage, roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    (userId) => userId.replace('-user', '')
  );
}

function send(table: Room, who: Identity, action: Parameters<Room['command']>[1]) {
  table.accept(table.command(who, action, table.snapshot.revision));
}

test('an offer, once accepted, allies the two factions, and either may break the alliance', () => {
  const table = room();
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  expect(table.snapshot.alliances).toMatchObject({ groups: [], offers: [{ from: 'atreides', to: 'harkonnen' }] });
  send(table, harkonnen, { kind: 'alliance-accept', factionId: 'atreides' });
  expect(table.snapshot.alliances).toEqual({ groups: [['atreides', 'harkonnen']], offers: [] });
  send(table, harkonnen, { kind: 'alliance-break', factionId: 'atreides' });
  expect(table.snapshot.alliances).toEqual({ groups: [], offers: [] });
});

test('a command that changes nothing keeps the revision', () => {
  const table = room();
  const before = table.snapshot.revision;
  send(table, atreides, { kind: 'alliance-withdraw', factionId: 'harkonnen' });
  expect(table.snapshot.revision).toBe(before);
});

test('alliances are turned away outside play and for factions not at the table', () => {
  expect(() => room('drafting').command(atreides, { kind: 'alliance-offer', factionId: 'harkonnen' }, 0)).toThrow(
    /not started/
  );
  const table = room();
  expect(() =>
    table.command(atreides, { kind: 'alliance-offer', factionId: 'fremen' }, table.snapshot.revision)
  ).toThrow(/another faction/);
});
