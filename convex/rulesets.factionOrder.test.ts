/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { RULESET_FACTION_LIMIT } from './lib/rulesetDetailPage';

const ABOUT = 'A house ruleset used to prove its factions keep the order its maintainers give them.';

/** An owner, an outsider, a ruleset and five factions linked in alphabetical order, through the triggers so the catalogue counts them. */
async function orderFixture(names = ['Atreides', 'Bene Gesserit', 'Choam', 'Duncan', 'Ecaz']) {
  const t = applicationTest();
  const { ownerId, outsiderId, factionIds } = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ownerId = await ctx.db.insert('users', { name: 'Ruleset owner' });
    const outsiderId = await ctx.db.insert('users', { name: 'Outsider' });
    const factionIds: Id<'factions'>[] = [];
    for (const name of names) {
      factionIds.push(
        await ctx.db.insert('factions', {
          owner_id: ownerId,
          data: { ...assetPublishingFaction, name },
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          is_deleted: false,
          group_id: null,
        })
      );
    }
    return { ownerId, outsiderId, factionIds };
  });
  const owner = t.withIdentity({ subject: ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'OrderedRuleset',
    about: ABOUT,
    group_id: null,
    image_cover: null,
  });
  for (const factionId of factionIds) {
    await owner.mutation(api.rulesets.addFaction, { ruleset_id: ruleset._id, faction_id: factionId });
  }
  return { t, owner, outsider: t.withIdentity({ subject: outsiderId }), ruleset, factionIds };
}

type Fixture = Awaited<ReturnType<typeof orderFixture>>;

async function editOrder({ t, ruleset }: Fixture, limit = 50) {
  const { factions } = await t.query(api.rulesets.orderedFactions, { rulesetId: ruleset._id, limit });
  return factions.map((faction) => faction.name);
}

async function railNames({ t, ruleset }: Fixture) {
  const page = await t.query(api.rulesets.detailPage, { slug: ruleset.slug });
  return { names: page!.factionPreview.map((faction) => faction.data.name), count: page!.factionCount };
}

describe('a ruleset’s faction order', () => {
  test('starts in the order the factions were added, and the page shows the first three of all five', async () => {
    const fixture = await orderFixture();
    expect(await editOrder(fixture)).toEqual(['Atreides', 'Bene Gesserit', 'Choam', 'Duncan', 'Ecaz']);
    expect(await railNames(fixture)).toEqual({ names: ['Atreides', 'Bene Gesserit', 'Choam'], count: 5 });
  });

  test('follows a reorder on the edit list and on the page, and appends a faction added afterwards', async () => {
    const fixture = await orderFixture(['Atreides', 'Bene Gesserit', 'Choam', 'Duncan']);
    const [a, b, c, d] = fixture.factionIds;
    await fixture.owner.mutation(api.rulesets.reorderFactions, {
      ruleset_id: fixture.ruleset._id,
      faction_ids: [d, b, a, c],
    });
    expect(await editOrder(fixture)).toEqual(['Duncan', 'Bene Gesserit', 'Atreides', 'Choam']);
    expect((await railNames(fixture)).names).toEqual(['Duncan', 'Bene Gesserit', 'Atreides']);

    const late = await fixture.t.run(async (rawCtx) =>
      applicationTriggers.wrapDB(rawCtx).db.insert('factions', {
        owner_id: fixture.ruleset.owner_id,
        data: { ...assetPublishingFaction, name: 'Arrival' },
        slug: 'arrival',
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      })
    );
    await fixture.owner.mutation(api.rulesets.addFaction, { ruleset_id: fixture.ruleset._id, faction_id: late });
    expect(await editOrder(fixture)).toEqual(['Duncan', 'Bene Gesserit', 'Atreides', 'Choam', 'Arrival']);
  });

  test('keeps what a stale or partial order leaves out after what it names, and ignores what is no longer linked', async () => {
    const fixture = await orderFixture(['Atreides', 'Bene Gesserit', 'Choam', 'Duncan']);
    const [a, b, c] = fixture.factionIds;
    await fixture.owner.mutation(api.rulesets.removeFaction, { ruleset_id: fixture.ruleset._id, faction_id: b });
    await fixture.owner.mutation(api.rulesets.reorderFactions, {
      ruleset_id: fixture.ruleset._id,
      faction_ids: [c, b, a],
    });
    expect(await editOrder(fixture)).toEqual(['Choam', 'Atreides', 'Duncan']);
  });

  test('loads the edit list a slice at a time and says when more remain', async () => {
    const fixture = await orderFixture();
    expect(await fixture.t.query(api.rulesets.orderedFactions, { rulesetId: fixture.ruleset._id, limit: 2 })).toEqual({
      factions: [
        expect.objectContaining({
          name: 'Atreides',
          logo: assetPublishingFaction.logo,
          background: assetPublishingFaction.background,
        }),
        expect.objectContaining({ name: 'Bene Gesserit' }),
      ],
      hasMore: true,
    });
    expect(
      (await fixture.t.query(api.rulesets.orderedFactions, { rulesetId: fixture.ruleset._id, limit: 5 })).hasMore
    ).toBe(false);
  });

  test('skips a soft-deleted faction on the page and the edit list', async () => {
    const fixture = await orderFixture(['Atreides', 'Bene Gesserit', 'Choam', 'Duncan']);
    await fixture.t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(fixture.factionIds[0], { is_deleted: true });
    });
    expect(await editOrder(fixture)).toEqual(['Bene Gesserit', 'Choam', 'Duncan']);
    expect(await railNames(fixture)).toEqual({ names: ['Bene Gesserit', 'Choam', 'Duncan'], count: 3 });
  });

  test('fills the page past any number of soft-deleted factions at the top', async () => {
    const names = [...Array.from({ length: 14 }, (_, index) => `Gone ${index}`), 'Atreides', 'Bene Gesserit'];
    const fixture = await orderFixture(names);
    await fixture.t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      for (const factionId of fixture.factionIds.slice(0, 14)) {
        await ctx.db.patch(factionId, { is_deleted: true });
      }
    });
    expect(await railNames(fixture)).toEqual({ names: ['Atreides', 'Bene Gesserit'], count: 2 });
  });

  test('refuses a faction past the limit, so the edit list never has more than it can load', async () => {
    const fixture = await orderFixture(['Atreides', 'Bene Gesserit']);
    const [atreides, beneGesserit] = fixture.factionIds;
    await fixture.owner.mutation(api.rulesets.removeFaction, {
      ruleset_id: fixture.ruleset._id,
      faction_id: beneGesserit,
    });
    await fixture.t.run(async (ctx) => {
      for (let index = 0; index < RULESET_FACTION_LIMIT - 1; index++) {
        await ctx.db.insert('ruleset_factions', {
          ruleset_id: fixture.ruleset._id,
          faction_id: atreides,
          position: index,
        });
      }
    });
    await expect(
      fixture.owner.mutation(api.rulesets.addFaction, { ruleset_id: fixture.ruleset._id, faction_id: beneGesserit })
    ).rejects.toThrow(`at most ${RULESET_FACTION_LIMIT} factions`);
    const { hasMore } = await fixture.t.query(api.rulesets.orderedFactions, {
      rulesetId: fixture.ruleset._id,
      limit: RULESET_FACTION_LIMIT,
    });
    expect(hasMore).toBe(false);
  });

  test('refuses a reorder from someone who cannot maintain the ruleset', async () => {
    const fixture = await orderFixture(['Atreides', 'Bene Gesserit']);
    await expect(
      fixture.outsider.mutation(api.rulesets.reorderFactions, {
        ruleset_id: fixture.ruleset._id,
        faction_ids: [...fixture.factionIds].reverse(),
      })
    ).rejects.toThrow();
    expect(await editOrder(fixture)).toEqual(['Atreides', 'Bene Gesserit']);
  });

  test('a reorder leaves the catalogue untouched', async () => {
    const fixture = await orderFixture(['Atreides', 'Bene Gesserit', 'Choam']);
    await fixture.owner.mutation(api.rulesets.reorderFactions, {
      ruleset_id: fixture.ruleset._id,
      faction_ids: [...fixture.factionIds].reverse(),
    });
    const drift = await fixture.t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'faction', limit: 100 });
    expect(drift).toMatchObject({ missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] });
  });
});
