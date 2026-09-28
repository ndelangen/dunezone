/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { renewFactionComponentIds } from '../src/shared/factions/componentIdentity';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { createFactionTroopId } from '../src/shared/factions/troopIdentity';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function authoringTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { name: 'Troop identity owner' });
    await ctx.db.insert('profiles', {
      user_id: id,
      username: 'Troop identity owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'troop-identity-owner',
      created_at: '2026-09-28T00:00:00.000Z',
      updated_at: '2026-09-28T00:00:00.000Z',
    });
    return id;
  });
  return { t, author: t.withIdentity({ subject: userId }) };
}

/** Two troop types, so a reorder is observable. */
function twoTroopFaction() {
  const [regular] = structuredClone(assetPublishingFaction.troops);
  return {
    ...structuredClone(assetPublishingFaction),
    troops: [regular!, { ...regular!, name: 'Elite troop', count: 5, star: undefined }],
  };
}

function troopIds(data: { troops: Array<{ troopId?: string }> }) {
  return data.troops.map((troop) => troop.troopId);
}

describe('persistent faction troop identities (#1227)', () => {
  test('assigns identities once and keeps them through rename, reorder, repeated saves and reload', async () => {
    const { t, author } = await authoringTest();
    const created = await author.mutation(api.factions.create, { data: twoTroopFaction(), group_id: null });
    const assigned = troopIds(created.data);
    expect(assigned.every((id) => typeof id === 'string')).toBe(true);
    expect(new Set(assigned).size).toBe(2);

    const edited = structuredClone(created.data);
    edited.troops.reverse();
    edited.troops[0]!.name = 'Renamed elite';
    const saved = await author.mutation(api.factions.update, { id: created._id, data: edited });
    const again = await author.mutation(api.factions.update, { id: created._id, data: saved.data });
    expect(troopIds(saved.data)).toEqual([assigned[1], assigned[0]]);
    expect(troopIds(again.data)).toEqual(troopIds(saved.data));
    const reloaded = await t.query(api.factions.getBySlug, { slug: created.slug });
    expect(troopIds(reloaded!.faction!.data)).toEqual(troopIds(saved.data));
  });

  test('a removed troop stays distinct from one added back with the same name, and a copy gets new troops', async () => {
    const { author } = await authoringTest();
    const created = await author.mutation(api.factions.create, { data: twoTroopFaction(), group_id: null });
    const draft = structuredClone(created.data);
    const removed = draft.troops[0]!;
    draft.troops[0] = { ...removed, troopId: createFactionTroopId() };
    const saved = await author.mutation(api.factions.update, { id: created._id, data: draft });
    expect(saved.data.troops[0]!.troopId).not.toBe(removed.troopId);
    expect(saved.data.troops[0]!.name).toBe(removed.name);

    const copied = await author.mutation(api.factions.update, {
      id: created._id,
      data: renewFactionComponentIds(created.data),
    });
    expect(troopIds(copied.data).some((id) => troopIds(created.data).includes(id))).toBe(false);
  });

  test('rejects an old tab that would erase adopted troop identities, and duplicate identities', async () => {
    const { author } = await authoringTest();
    const created = await author.mutation(api.factions.create, { data: twoTroopFaction(), group_id: null });
    const stale = structuredClone(created.data);
    stale.troops = stale.troops.map(({ troopId: _troopId, ...troop }) => troop);
    await expect(author.mutation(api.factions.update, { id: created._id, data: stale })).rejects.toThrow(
      /Reload this page before saving\. This faction now uses persistent troop identities/
    );
    const duplicated = structuredClone(created.data);
    duplicated.troops[1]!.troopId = duplicated.troops[0]!.troopId;
    await expect(author.mutation(api.factions.update, { id: created._id, data: duplicated })).rejects.toThrow(
      /troop IDs must be unique/
    );
  });
});
