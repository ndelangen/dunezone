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
