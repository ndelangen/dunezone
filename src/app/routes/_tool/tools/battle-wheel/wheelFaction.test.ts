import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { expect, test } from 'vite-plus/test';

import emperorFixture from '../../../_app/play/product.stories.fixture/factions.json';
import { wheelFactionFrom } from './wheelFaction';

const emperor = emperorFixture.find((row) => row.slug === 'emperor')!;

test('reads leaders and the troop faces that fight, with their battle values and counts', () => {
  const faction = wheelFactionFrom({
    faction: { id: emperor._id, slug: emperor.slug, name: emperor.data.name },
    data: emperor.data,
    token: null,
    cardbacks: { traitor: null, alliance: null },
    leaders: [],
  });
  expect(faction?.name).toBe('Emperor');
  expect(faction?.leaders.map((leader) => [leader.name, leader.strength])).toContainEqual(['Hasimir Fenring', 6]);
  expect(faction?.faces.map((face) => [face.name, face.strength, face.supportedStrength, face.count])).toEqual(
    expect.arrayContaining([expect.arrayContaining([1, 2, 5])])
  );
});

test('reads nothing from a faction that is gone', () => {
  expect(wheelFactionFrom(null)).toBeNull();
});

test('reads a strength stored as a digit as that number, and a strength that varies as X', () => {
  const faction = wheelFactionFrom({
    faction: { id: 'stored-as-text', slug: 'stored-as-text', name: assetPublishingFaction.name },
    data: {
      ...assetPublishingFaction,
      leaders: [
        ...assetPublishingFaction.leaders,
        { ...assetPublishingFaction.leaders[0]!, name: 'Varies', strength: 'X' },
      ],
    },
  });
  expect(faction?.leaders.map((leader) => [leader.name, leader.strength])).toEqual([
    ['Dr. Yueh', 1],
    ['Duncan Idaho', 2],
    ['Gurney Halleck', 4],
    ['Thufir Hawat', 5],
    ['Lady Jessica', 5],
    ['Varies', null],
  ]);
});
