/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { TroopBattleValues, withSupportNames } from '../src/shared/factions/schema';
import { battleFaceSchema } from '../src/shared/play/battle';
import { api, internal } from './_generated/api';
import { factionTest, insertStoredFactions, storedFactionData } from './factions.test.fixture';

const troop = {
  name: 'Regular troop',
  image: '/vector/troop/atreides.svg',
  description: '',
  count: 20,
};

describe('faction troop support names migration', () => {
  test('renames funded values on fronts and backs once, keeps every other field and the edit timestamp', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [
      {
        slug: 'legacy',
        data: {
          retiredField: 'kept',
          troops: [
            {
              ...troop,
              combat: { strength: 0.5, fundedStrength: 1, fundingCost: 0 },
              back: {
                ...troop,
                name: 'Back',
                combat: { strength: -0.5, fundedStrength: 2 },
              },
            },
            { ...troop, name: 'Unauthored troop' },
          ],
        },
      },
      {
        slug: 'current',
        data: {
          troops: [
            {
              ...troop,
              combat: { strength: 1, supportedStrength: 2, supportCost: 2 },
            },
          ],
        },
        isDeleted: true,
      },
    ]);

    await t.mutation(internal.migrations.faction_troop_support_names_v1, {});
    const first = await storedFactionData(t, ids);
    await t.mutation(internal.migrations.faction_troop_support_names_v1, {
      reset: true,
    });
    await t.mutation(internal.migrations.faction_troop_support_names_verify_v1, {});
    const second = await storedFactionData(t, ids);

    const [legacyRow, currentRow] = first;
    expect(legacyRow!.data.retiredField).toBe('kept');
    expect(legacyRow!.updated_at).toBe('2026-09-28T00:00:00.000Z');
    expect(legacyRow!.data.troops[0].combat).toEqual({
      strength: 0.5,
      supportedStrength: 1,
      supportCost: 0,
    });
    expect(legacyRow!.data.troops[0].back.combat).toEqual({
      strength: -0.5,
      supportedStrength: 2,
    });
    expect(legacyRow!.data.troops[1]).toEqual({
      ...troop,
      name: 'Unauthored troop',
    });
    expect(currentRow!.data.troops[0].combat).toEqual({
      strength: 1,
      supportedStrength: 2,
      supportCost: 2,
    });
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_troop_support_names_v1', 'faction_troop_support_names_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('verification refuses a faction whose troop faces still carry funded names', async () => {
    const t = factionTest();
    await insertStoredFactions(t, [
      {
        slug: 'unmigrated',
        data: {
          troops: [
            {
              ...troop,
              back: { ...troop, combat: { strength: 1, fundingCost: 1 } },
            },
          ],
        },
      },
    ]);

    await t.mutation(internal.migrations.faction_troop_support_names_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_troop_support_names_verify_v1'],
      })
    ).rejects.toThrow(/faction_troop_support_names_verify_v1\(failed/);
  });

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
    /* A game's stored faces predate the rename too. */
    expect(
      battleFaceSchema.parse({
        id: 'troop-0-front',
        name: 'Guard',
        strength: 0.5,
        fundedStrength: 1,
      })
    ).toEqual({
      id: 'troop-0-front',
      name: 'Guard',
      capable: true,
      strength: 0.5,
      supportedStrength: 1,
      supportCost: 1,
    });
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
