import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../factions/schema';
import type { FactionCapture } from './capture';
import { factionSupply } from './setupSupply';
import type { SupplyDependencies } from './setupSupply';

const FACTION = { id: 'k17ag3gr1h60n7mmh88kj56avs8a1j7x', slug: 'house-atreides', name: 'House Atreides' };

function capture(troops: FactionCapture['components']['troops']): FactionCapture {
  return {
    faction: FACTION,
    capturedAt: 0,
    definition: toStoredHeroKey(assetPublishingFaction),
    components: {
      token: { front: null, back: null },
      leaders: [],
      troops,
      alliance: { front: null, back: null },
      traitors: { back: null, cards: [] },
    },
    extras: [],
    readiness: { ready: true, problems: [] },
  };
}

describe('faction setup supply', () => {
  test('a troop reserve is keyed by its troop identity, so its order in the faction does not matter (#1227)', () => {
    let next = 0;
    const dependencies: SupplyDependencies = { id: () => `piece-${next++}`, shuffle: (items) => items };
    const regular = { troopId: 'regular-id', name: 'Regular', count: 2, front: null, back: null };
    const elite = { troopId: 'elite-id', name: 'Elite', count: 1, front: null, back: null };
    const keys = (troops: FactionCapture['components']['troops']) =>
      Object.fromEntries(
        factionSupply(capture(troops), 0, dependencies).reserves.map((reserve) => [reserve.label, reserve.stackKey])
      );

    expect(keys([regular, elite])).toEqual(keys([elite, regular]));
    expect(keys([regular, elite])).toEqual({
      Regular: `troops:${FACTION.id}:regular-id`,
      Elite: `troops:${FACTION.id}:elite-id`,
    });
    const { troopId: _troopId, ...legacy } = regular;
    expect(keys([legacy])).toEqual({ Regular: `troops:${FACTION.id}:0` });
  });
});
