import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../factions/schema';
import type { FactionCapture } from './capture';
import { factionSupply } from './setupSupply';
import type { SupplyDependencies } from './setupSupply';
import { isCollisionFreePosition } from './tablePhysics';
import { tableSeatAngles } from './tableSettings';

const FACTION = { id: 'k17ag3gr1h60n7mmh88kj56avs8a1j7x', slug: 'house-atreides', name: 'House Atreides' };

function capture(
  troops: FactionCapture['components']['troops'],
  token: FactionCapture['components']['token'] = { front: null, back: null }
): FactionCapture {
  return {
    faction: FACTION,
    capturedAt: 0,
    definition: toStoredHeroKey(assetPublishingFaction),
    components: {
      token,
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

  test('the faction token and up to four kinds of troop reserves are dealt clear of each other and on the table, so each can be rotated where it lands', () => {
    let next = 0;
    const dependencies: SupplyDependencies = { id: () => `piece-${next++}`, shuffle: (items) => items };
    const troop = (name: string) => ({ troopId: name, name, count: 2, front: null, back: null });
    for (const kinds of [1, 2, 3, 4]) {
      const troops = Array.from({ length: kinds }, (_, index) => troop(`Kind ${index}`));
      for (const angle of tableSeatAngles(6)) {
        const supply = factionSupply(
          capture(troops, { front: 'token-front', back: 'token-back' }),
          angle,
          dependencies
        );
        const pieces = [...supply.token, ...supply.reserves];
        expect(supply.token).toHaveLength(1);
        for (const piece of pieces) {
          const others = pieces.filter((other) => other !== piece);
          expect(isCollisionFreePosition(piece, piece.position, others), piece.label).toBe(true);
        }
      }
    }
  });
});
