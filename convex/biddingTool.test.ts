import { expect, test } from 'vite-plus/test';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { publishingCustomDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import { applicationTest } from './application.test.fixture';
/* Compile the query's server dependencies during collection, outside the database behavior timeout. */
import './biddingTool';

const stamp = '2026-11-10T00:00:00.000Z';

async function seed(ctx: MutationCtx) {
  const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
  const base = { owner_id: owner, group_id: null, is_deleted: false, created_at: stamp, updated_at: stamp };
  const ruleset = (slug: string, is_deleted = false) =>
    ctx.db.insert('rulesets', { ...base, name: slug, slug, about: '', image_cover: null, is_deleted });
  const id = await ruleset('gf9');
  const faction = async (slug: string, position: number, is_deleted = false, malformed = false) => {
    const factionId = await ctx.db.insert('factions', {
      ...base,
      slug,
      is_deleted,
      data: malformed ? {} : { ...assetPublishingFaction, name: slug },
    });
    await ctx.db.insert('ruleset_factions', { ruleset_id: id, faction_id: factionId, position });
    return factionId;
  };
  const deletedFaction = await faction('deleted', -2, true);
  await faction('malformed', -1, false, true);
  /* Created out of order, so the result has to follow the configured positions. */
  const harkonnen = await faction('house-harkonnen', 2);
  const emperor = await faction('emperor', 1);
  const atreides = await faction('house-atreides', 0);
  await faction('fremen', 3);
  await faction('spacing-guild', 4);
  await faction('bene-gesserit', 5);
  await faction('ixians', 6);
  const publication = (type: string, assetId: string) =>
    ctx.db.insert('publication_assets', {
      asset_type: type,
      asset_id: assetId,
      cache_token: 'published',
      published_at: 1,
    });
  await publication('faction-token', atreides);
  const deck = await ctx.db.insert('assets', {
    ...base,
    type: 'deck',
    slug: 'treachery',
    data: { name: 'Treachery', about: '', cardback: publishingCustomDeckCardback },
  });
  await publication('deck', deck);
  await ctx.db.insert('ruleset_asset_slots', { ruleset_id: id, asset_id: deck, slot: 'treachery' });
  return {
    ruleset: id,
    deck,
    atreides,
    emperor,
    harkonnen,
    deletedFaction,
    deletedRuleset: await ruleset('retired', true),
    hiddenRuleset: await ruleset('test'),
    emptyRuleset: await ruleset('empty'),
  };
}

test('captures six live factions in seating order and only the selected deck back', async () => {
  const t = applicationTest();
  const ids = await t.run(seed);
  const setup = await t.query(api.biddingTool.setup, { rulesetId: ids.ruleset });
  expect(setup?.seats.map(({ name }) => name)).toEqual([
    'house-atreides',
    'emperor',
    'house-harkonnen',
    'fremen',
    'spacing-guild',
    'bene-gesserit',
  ]);
  expect(setup?.seats[0]).toEqual({
    id: ids.atreides,
    name: 'house-atreides',
    src: publishedHref('faction-token', ids.atreides, 'published'),
    color: assetPublishingFaction.themeColor,
    peeks: true,
    paid: false,
    initialHand: 1,
  });
  expect(setup?.seats[1]).toMatchObject({ src: null, paid: true, initialHand: 1 });
  expect(setup?.seats[2]).toMatchObject({ src: null, initialHand: 2 });
  expect(setup?.deck).toEqual({ name: 'Treachery', back: publishedHref('deck', ids.deck, 'published') });
  expect(setup).not.toHaveProperty('cards');
});

test('refuses missing, deleted and hidden rulesets and preserves an empty live setup', async () => {
  const t = applicationTest();
  const ids = await t.run(seed);
  for (const rulesetId of ['not-an-id', ids.deletedRuleset, ids.hiddenRuleset]) {
    expect(await t.query(api.biddingTool.setup, { rulesetId })).toBeNull();
  }
  expect(await t.query(api.biddingTool.setup, { rulesetId: ids.emptyRuleset })).toMatchObject({
    ruleset: { id: ids.emptyRuleset, name: 'empty' },
    seats: [],
    deck: null,
  });
});

test('custom choices return known reminders by slug and never return deleted factions', async () => {
  const t = applicationTest();
  const ids = await t.run(seed);
  expect(await t.query(api.biddingTool.faction, { factionId: ids.atreides })).toMatchObject({ peeks: true });
  const custom = await t.run(async (ctx) => {
    const original = await ctx.db.get('factions', ids.atreides);
    const { _id: _originalId, _creationTime: _created, ...fields } = original!;
    return await ctx.db.insert('factions', { ...fields, slug: 'custom-atreides' });
  });
  expect(await t.query(api.biddingTool.faction, { factionId: custom })).toMatchObject({
    peeks: false,
    paid: false,
    initialHand: 1,
  });
  for (const factionId of ['not-an-id', ids.deletedFaction]) {
    expect(await t.query(api.biddingTool.faction, { factionId })).toBeNull();
  }
});

test('a removed deck no longer supplies a card back', async () => {
  const t = applicationTest();
  const ids = await t.run(seed);
  await t.run((ctx) => ctx.db.patch('assets', ids.deck, { is_deleted: true }));
  expect(await t.query(api.biddingTool.setup, { rulesetId: ids.ruleset })).toMatchObject({ deck: null });
});
