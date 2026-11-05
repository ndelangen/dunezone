/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { TroopBattleValues, withSupportNames } from '../src/shared/factions/schema';
import { api } from './_generated/api';
import { factionTest, insertStoredFactions } from './factions.test.fixture';

describe('faction troop support names', () => {
  test('reads rename the funded values, a supported value wins, and the write contract accepts only the supported names', () => {
    expect(withSupportNames({ strength: 1, fundedStrength: 2, fundingCost: 0 })).toEqual({
      strength: 1,
      supportedStrength: 2,
      supportCost: 0,
    });
    expect(
      withSupportNames({
        strength: 1,
        fundedStrength: 2,
        supportedStrength: 3,
      })
    ).toEqual({
      strength: 1,
      supportedStrength: 3,
    });
    expect(TroopBattleValues.safeParse({ strength: 1, fundedStrength: 2 }).success).toBe(false);
  });
  test('a client reading an unmigrated faction receives the supported names', async () => {
    const t = factionTest();
    const faction = structuredClone(assetPublishingFaction);
    const [front, ...rest] = faction.troops;
    await insertStoredFactions(t, [
      {
        slug: 'legacy-read',
        data: {
          ...faction,
          troops: [
            {
              ...front!,
              combat: { strength: 0.5, fundedStrength: 1, fundingCost: 0 },
              back: { image: front!.image, name: 'Back', description: '', combat: { strength: 1, fundedStrength: 2 } },
            },
            ...rest,
          ],
        },
      },
    ]);

    const [row] = await t.query(api.factions.list, {});
    const [troop] = row!.data.troops;
    expect(troop!.combat).toEqual({ strength: 0.5, supportedStrength: 1, supportCost: 0 });
    expect(troop!.back!.combat).toEqual({ strength: 1, supportedStrength: 2 });
    expect(JSON.stringify(row!.data)).not.toMatch(/fundedStrength|fundingCost/);
  });
});
