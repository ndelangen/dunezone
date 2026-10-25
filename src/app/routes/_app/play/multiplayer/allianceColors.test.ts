import { expect, test } from 'vite-plus/test';

import { alliedFactionColors, allianceRingStyle } from './allianceColors';

const snapshot = {
  alliances: { groups: [{ members: ['a', 'b', 'c'], mark: 7 }], offers: [] },
  roster: {
    seats: [
      { faction: { id: 'a', color: '#123456' } },
      { faction: { id: 'b', color: '#abcdef' } },
      { faction: { id: 'c', color: '#987654' } },
    ],
  },
  table: { pieces: [{ stackKey: 'faction-token:b', color: '#654321' }] },
};

test('alliance markers use each allied faction colour from data, excluding the faction itself', () => {
  expect(alliedFactionColors(snapshot, 'a')).toEqual(['#abcdef', '#987654']);
  expect(alliedFactionColors(snapshot, 'b')).toEqual(['#123456', '#987654']);
  expect(
    alliedFactionColors(
      { ...snapshot, alliances: { ...snapshot.alliances, groups: [{ ...snapshot.alliances.groups[0], mark: 0 }] } },
      'a'
    )
  ).toEqual(['#abcdef', '#987654']);
});

test('retained token colours cover older data, while missing factions invent no colour', () => {
  expect(alliedFactionColors({ ...snapshot, roster: undefined }, 'a')).toEqual(['#654321']);
  expect(alliedFactionColors(snapshot, 'unallied')).toEqual([]);
  expect(alliedFactionColors(snapshot, undefined)).toEqual([]);
});

test('multi-faction rings give every ally a segment at a constant width', () => {
  expect(allianceRingStyle(['#123456', '#abcdef'])).toMatchObject({
    padding: 2,
    background: 'conic-gradient(#123456 0% 50%, #abcdef 50% 100%)',
  });
  expect(allianceRingStyle([])).toBeUndefined();
});
