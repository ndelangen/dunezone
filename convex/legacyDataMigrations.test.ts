/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { internal } from './_generated/api';
import { factionTest, insertStoredFactions, storedFactionData } from './factions.test.fixture';

const leader = { name: 'Paul', image: '/image/leader/official/paul.png', strength: 5 };

const troop = {
  name: 'Regular troop',
  image: '/vector/troop/atreides.svg',
  description: '',
  count: 20,
};

describe('faction hero key drop', () => {
  test('drops the copied `hero` key once, keeps every other field and the edit timestamp', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [
      { slug: 'copied', data: { retiredField: 'kept', factionLeader: leader, hero: leader } },
      { slug: 'current', data: { factionLeader: leader }, isDeleted: true },
    ]);

    await t.mutation(internal.legacyDataMigrations.faction_hero_key_drop_v1, {});
    const first = await storedFactionData(t, ids);
    await t.mutation(internal.legacyDataMigrations.faction_hero_key_drop_v1, { reset: true });
    await t.mutation(internal.legacyDataMigrations.faction_hero_key_drop_verify_v1, {});
    const second = await storedFactionData(t, ids);

    expect(first[0]!.data).toMatchObject({ retiredField: 'kept', factionLeader: leader });
    expect(first[0]!.data).not.toHaveProperty('hero');
    expect(first[0]!.updated_at).toBe('2026-09-28T00:00:00.000Z');
    expect(first[1]!.data).toMatchObject({ factionLeader: leader });
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_hero_key_drop_v1', 'faction_hero_key_drop_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('a row with only `hero` keeps it, and verification refuses it', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [{ slug: 'unmigrated', data: { hero: leader } }]);

    await t.mutation(internal.legacyDataMigrations.faction_hero_key_drop_v1, {});
    expect((await storedFactionData(t, ids))[0]!.data).toMatchObject({ hero: leader });
    await t.mutation(internal.legacyDataMigrations.faction_hero_key_drop_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_hero_key_drop_verify_v1'] })
    ).rejects.toThrow(/faction_hero_key_drop_verify_v1\(failed/);
  });
});

describe('faction troop red star', () => {
  test('moves a `-red` star to its base star with the red as hue, on fronts and backs, keeping a set hue', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [
      {
        slug: 'legacy',
        data: {
          troops: [
            {
              ...troop,
              star: '/vector/troop_modifier/star-left-red.svg',
              back: { ...troop, name: 'Back', star: '/vector/troop_modifier/star-right-red.svg', hue: '#123456' },
            },
            { ...troop, name: 'Plain', star: '/vector/troop_modifier/star-left.svg' },
          ],
        },
      },
    ]);

    await t.mutation(internal.legacyDataMigrations.faction_troop_red_star_v1, {});
    const first = await storedFactionData(t, ids);
    await t.mutation(internal.legacyDataMigrations.faction_troop_red_star_v1, { reset: true });
    await t.mutation(internal.legacyDataMigrations.faction_troop_red_star_verify_v1, {});
    const second = await storedFactionData(t, ids);

    const [front, plain] = first[0]!.data.troops;
    expect(front.star).toBe('/vector/troop_modifier/star-left.svg');
    expect(front.hue).toBe('#ff0000');
    expect(front.back).toEqual({
      ...troop,
      name: 'Back',
      star: '/vector/troop_modifier/star-right.svg',
      hue: '#123456',
    });
    expect(plain).toEqual({ ...troop, name: 'Plain', star: '/vector/troop_modifier/star-left.svg' });
    expect(first[0]!.updated_at).toBe('2026-09-28T00:00:00.000Z');
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_troop_red_star_v1', 'faction_troop_red_star_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('verification refuses a faction that still has a `-red` star', async () => {
    const t = factionTest();
    await insertStoredFactions(t, [
      {
        slug: 'unmigrated',
        data: { troops: [{ ...troop, back: { ...troop, star: '/vector/troop_modifier/star-left-red.svg' } }] },
      },
    ]);

    await t.mutation(internal.legacyDataMigrations.faction_troop_red_star_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_troop_red_star_verify_v1'] })
    ).rejects.toThrow(/faction_troop_red_star_verify_v1\(failed/);
  });
});
