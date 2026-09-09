/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { parsePublicationAssetData } from '../src/shared/asset-publishing/publication';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import {
  createFactionMemberId,
  ensureFactionMemberIds,
  renewFactionMemberIds,
} from '../src/shared/factions/memberIdentity';
import { IdentifiedFactionStoredSchema } from '../src/shared/factions/schema';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function authoringTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { name: 'Member identity owner' });
    await ctx.db.insert('profiles', {
      user_id: id,
      username: 'Member identity owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'member-identity-owner',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    });
    return id;
  });
  return { t, author: t.withIdentity({ subject: userId }) };
}

function ids(data: typeof assetPublishingFaction) {
  return [data.hero.memberId, ...data.leaders.map((leader) => leader.memberId)];
}

describe('persistent faction member identities', () => {
  test('imports old data once and preserves identities through rename, reorder, Save and reload', async () => {
    const { t, author } = await authoringTest();
    const created = await author.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const identified = IdentifiedFactionStoredSchema.parse(created.data);
    expect(new Set(ids(identified)).size).toBe(identified.leaders.length + 1);

    const edited = structuredClone(identified);
    edited.hero.name = 'Renamed ruler';
    edited.leaders.reverse();
    edited.leaders[0]!.name = 'Renamed leader';
    edited.leaders[0]!.strength = 9;
    const saved = await author.mutation(api.factions.update, { id: created._id, data: edited });
    expect(ids(saved.data)).toEqual(ids(edited));
    const reloaded = await t.query(api.factions.getBySlug, { slug: created.slug });
    expect(ids(reloaded!.faction!.data)).toEqual(ids(edited));
  });

  test('rejects an old tab that would erase an adopted roster and rejects duplicate identities', async () => {
    const { author } = await authoringTest();
    const created = await author.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    await expect(
      author.mutation(api.factions.update, { id: created._id, data: assetPublishingFaction })
    ).rejects.toThrow(/Reload this page/);
    const duplicated = structuredClone(created.data);
    duplicated.leaders[0]!.memberId = duplicated.hero.memberId;
    await expect(author.mutation(api.factions.update, { id: created._id, data: duplicated })).rejects.toThrow(/unique/);
  });

  test('a removed member stays distinct from an added or copied member with the same name', async () => {
    const { author } = await authoringTest();
    const created = await author.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const draft = structuredClone(created.data);
    const original = draft.leaders[0]!;
    draft.leaders[0] = { ...original, memberId: createFactionMemberId() };
    const saved = await author.mutation(api.factions.update, { id: created._id, data: draft });
    expect(saved.data.leaders[0]!.memberId).not.toBe(original.memberId);
    expect(saved.data.leaders[0]!.name).toBe(original.name);

    const replacement = renewFactionMemberIds(created.data);
    const replaced = await author.mutation(api.factions.update, { id: created._id, data: replacement });
    expect(ids(replaced.data).some((id) => ids(created.data).includes(id))).toBe(false);
  });

  test('identified import round trips retain member IDs while whole-faction clones have a distinct faction identity', async () => {
    const { author } = await authoringTest();
    const imported = ensureFactionMemberIds(structuredClone(assetPublishingFaction));
    const created = await author.mutation(api.factions.create, { data: imported, group_id: null });
    const clone = await author.mutation(api.factions.create, {
      data: { ...imported, name: 'A separate faction' },
      group_id: null,
    });
    expect(ids(created.data)).toEqual(ids(imported));
    expect(clone._id).not.toBe(created._id);
    expect(ids(clone.data)).toEqual(ids(created.data));
  });

  test('frozen faction sheets written before IDs remain decodable without inventing snapshot IDs', () => {
    const historical = { factionId: 'historical-faction', slug: 'historical-faction', faction: assetPublishingFaction };
    expect(parsePublicationAssetData('faction_sheet', historical)).toEqual(historical);
  });
});
