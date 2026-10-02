/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../src/shared/factions/schema';
import { api } from './_generated/api';
import { factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const STAMP = '2026-09-28T00:00:00.000Z';
const storedLeader = assetPublishingFaction.leader;
const renamedLeader = { ...storedLeader, name: 'Paul Atreides' };

/*
 * The glossary term is "leader"; rows saved before `faction_leader_key_v1` store it as `hero`, and migrated rows hold both keys.
 * Every read that returns faction data must answer with the key its wire contract names.
 */
async function seed() {
  const t = factionTest();
  const ids = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ownerId = await ctx.db.insert('users', { name: 'Owner' });
    await ctx.db.insert('profiles', {
      user_id: ownerId,
      username: 'Owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'owner',
      created_at: STAMP,
      updated_at: STAMP,
    });
    const groupId = await ctx.db.insert('groups', {
      name: 'Leaders Group',
      slug: 'leaders-group',
      created_at: STAMP,
      created_by: ownerId,
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerId,
      status: 'active',
      requested_at: STAMP,
      approved_at: STAMP,
      approved_by: ownerId,
    });
    const row = (slug: string, data: Record<string, unknown>) =>
      ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...data, name: slug },
        slug,
        created_at: STAMP,
        updated_at: STAMP,
        is_deleted: false,
        group_id: groupId,
      });
    const heroOnly = await row('hero-only', toStoredHeroKey(assetPublishingFaction));
    const both = await row('both-keys', { ...toStoredHeroKey(assetPublishingFaction), leader: renamedLeader });
    return { ownerId, heroOnly, both };
  });
  return { t, ids, viewer: t.withIdentity({ subject: ids.ownerId }) };
}

const expected = { 'hero-only': storedLeader, 'both-keys': renamedLeader } as Record<string, unknown>;

function expectLeaderKey(slug: string, data: Record<string, unknown>) {
  expect(data.leader).toEqual(expected[slug]);
  expect(data).not.toHaveProperty('hero');
}

describe('faction reads across the leader key rename', () => {
  test('the group page, detail page, list, catalogue and load picker answer with `leader`', async () => {
    const { viewer } = await seed();

    const group = await viewer.query(api.groups.detailBySlug, { slug: 'leaders-group' });
    expect(group.factions).toHaveLength(2);
    group.factions.forEach((row) => expectLeaderKey(row.slug, row.data));

    for (const slug of ['hero-only', 'both-keys']) {
      const page = await viewer.query(api.factions.getBySlug, { slug });
      expectLeaderKey(slug, page.faction.data);
    }

    const list = await viewer.query(api.factions.list, {});
    list.forEach((row) => expectLeaderKey(row.slug, row.data));

    const catalogue = await viewer.query(api.factions.cataloguePage, {});
    expect(catalogue.factions).toHaveLength(2);
    catalogue.factions.forEach((row) => expectLeaderKey(row.slug, row.data));

    const picker = await viewer.query(api.factions.listForLoadPicker, {});
    expect(picker.rows).toHaveLength(2);
    picker.rows.forEach((row) => expectLeaderKey(row.slug, row.data));
  });

  test('the homepage spotlights read both rows', async () => {
    const { viewer } = await seed();

    const homepage = await viewer.query(api.homepage.get, {});
    expect(homepage.spotlights.newArrival?.data).not.toHaveProperty('hero');
  });

  test('the game catalogue answer keeps the `hero` literal for a Worker one deploy behind', async () => {
    const { viewer, ids } = await seed();

    const heroOnly = await viewer.query(api.playCatalogue.factionDefinition, { factionId: ids.heroOnly });
    const both = await viewer.query(api.playCatalogue.factionDefinition, { factionId: ids.both });
    expect(heroOnly?.data?.hero).toEqual(storedLeader);
    expect(both?.data?.hero).toEqual(renamedLeader);
    expect(heroOnly?.data).not.toHaveProperty('leader');
    expect(both?.data).not.toHaveProperty('leader');
  });
});
