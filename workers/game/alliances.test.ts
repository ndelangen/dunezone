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

/* The id of the offer `from` made to `to`, as the answering player sees it. */
function offerId(table: Room, from: string, to: string) {
  return table.snapshot.alliances?.offers.find((offer) => offer.from === from && offer.to === to)?.id ?? 0;
}

test('an offer, once accepted, allies the two factions, and either may break the alliance', () => {
  const table = room();
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  expect(table.snapshot.alliances).toMatchObject({ groups: [], offers: [{ from: 'atreides', to: 'harkonnen' }] });
  send(table, harkonnen, {
    kind: 'alliance-accept',
    factionId: 'atreides',
    offer: offerId(table, 'atreides', 'harkonnen'),
  });
  expect(table.snapshot.alliances).toEqual({ groups: [{ members: ['atreides', 'harkonnen'], mark: 0 }], offers: [] });
  send(table, harkonnen, { kind: 'alliance-break', factionId: 'atreides' });
  expect(table.snapshot.alliances).toEqual({ groups: [], offers: [] });
});

test('a break sent against a table that has changed since is turned away', () => {
  const table = room();
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  send(table, harkonnen, {
    kind: 'alliance-accept',
    factionId: 'atreides',
    offer: offerId(table, 'atreides', 'harkonnen'),
  });
  const seen = table.snapshot.revision;
  send(table, harkonnen, { kind: 'alliance-break', factionId: 'atreides' });
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  send(table, harkonnen, {
    kind: 'alliance-accept',
    factionId: 'atreides',
    offer: offerId(table, 'atreides', 'harkonnen'),
  });
  expect(() => table.command(atreides, { kind: 'alliance-break', factionId: 'harkonnen' }, seen)).toThrow(/changed/);
});

test('a command that changes nothing keeps the revision', () => {
  const table = room();
  const before = table.snapshot.revision;
  send(table, atreides, { kind: 'alliance-withdraw', factionId: 'harkonnen', offer: 0 });
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

test('a late accept of a withdrawn offer is turned away, even once the same faction offers again', () => {
  const table = room();
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  const seen = table.snapshot.revision;
  const offer = offerId(table, 'atreides', 'harkonnen');
  send(table, atreides, { kind: 'alliance-withdraw', factionId: 'harkonnen', offer });
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  expect(() => table.command(harkonnen, { kind: 'alliance-accept', factionId: 'atreides', offer }, seen)).toThrow(
    /withdrawn/
  );
  expect(table.snapshot.alliances?.groups).toEqual([]);
});

test('a late withdrawal from another tab leaves an offer made again since', () => {
  const table = room();
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  const seen = table.snapshot.revision;
  const offer = offerId(table, 'atreides', 'harkonnen');
  send(table, atreides, { kind: 'alliance-withdraw', factionId: 'harkonnen', offer });
  send(table, atreides, { kind: 'alliance-offer', factionId: 'harkonnen' });
  table.accept(table.command(atreides, { kind: 'alliance-withdraw', factionId: 'harkonnen', offer }, seen));
  expect(table.snapshot.alliances?.offers).toMatchObject([{ from: 'atreides', to: 'harkonnen' }]);
});
