/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const STAMP = '2026-09-28T00:00:00.000Z';
const storedLeader = assetPublishingFaction.factionLeader;

/*
 * The glossary term is "Faction leader"; rows store it as `factionLeader`, and the game catalogue answer keeps the old `hero` literal.
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
    const first = await row('first', assetPublishingFaction);
    const second = await row('second', assetPublishingFaction);
    return { ownerId, first, second };
  });
  return { t, ids, viewer: t.withIdentity({ subject: ids.ownerId }) };
}

function expectLeaderKey(data: Record<string, unknown>) {
  expect(data.factionLeader).toEqual(storedLeader);
  expect(data).not.toHaveProperty('hero');
}

describe('faction reads name the Faction leader by their wire contract', () => {
  test('the group page, detail page, list, catalogue and load picker answer with `factionLeader`', async () => {
    const { viewer } = await seed();

    const group = await viewer.query(api.groups.detailPage, { slug: 'leaders-group' });
    expect(group.factions).toHaveLength(2);
    group.factions.forEach((row) => expectLeaderKey(row.data));

    for (const slug of ['first', 'second']) {
      const page = await viewer.query(api.factions.pageBySlug, { slug });
      expectLeaderKey(page.faction.data);
    }

    const list = await viewer.query(api.factions.list, {});
    list.forEach((row) => expectLeaderKey(row.data));

    const catalogue = await viewer.query(api.factions.cataloguePage, {});
    expect(catalogue.factions).toHaveLength(2);
    catalogue.factions.forEach((row) => expectLeaderKey(row.data));

    const paged = await viewer.query(api.factions.catalogue, {});
    expect(paged.cards).toHaveLength(2);
    paged.cards.forEach((row) => expectLeaderKey(row.data));

    const picker = await viewer.query(api.factions.listForLoadPicker, {});
    expect(picker.rows).toHaveLength(2);
    picker.rows.forEach((row) => expectLeaderKey(row.data));
    /* The picker labels each row with its group's name and its owner's username, read beside the faction data. */
    expect(picker.rows.map((row) => ({ groupLabel: row.groupLabel, ownerUsername: row.ownerUsername }))).toEqual([
      { groupLabel: 'Leaders Group', ownerUsername: 'Owner' },
      { groupLabel: 'Leaders Group', ownerUsername: 'Owner' },
    ]);

    const homepage = await viewer.query(api.homepage.get, {});
    expect(homepage.spotlights.newArrival?.data).not.toHaveProperty('hero');
  });

  test('the game catalogue answer keeps the `hero` literal for a Worker one deploy behind', async () => {
    const { viewer, ids } = await seed();

    const definition = await viewer.query(api.playCatalogue.factionDefinition, { factionId: ids.first });
    expect(definition?.data?.hero).toEqual(storedLeader);
    expect(definition?.data).not.toHaveProperty('factionLeader');
  });
});
