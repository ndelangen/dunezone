/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('the catalogue reads Play captures from', () => {
  test('a faction reads with its token and leader faces, keeping a face whose replacement is still pending', async () => {
    const t = convexTest(schema, modules);
    const { factionId, deletedId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert('users', { email: 'author@example.invalid' });
      const stamp = new Date().toISOString();
      const row = {
        owner_id: owner,
        data: assetPublishingFaction,
        created_at: stamp,
        updated_at: stamp,
        is_deleted: false,
        group_id: null,
      };
      const factionId = await ctx.db.insert('factions', { ...row, slug: 'atreides' });
      const deletedId = await ctx.db.insert('factions', { ...row, slug: 'gone', is_deleted: true });
      await ctx.db.insert('publication_assets', {
        asset_type: 'faction-token',
        asset_id: factionId,
        cache_token: 'token-1',
        published_at: 10,
      });
      for (const key of ['traitor', 'alliance']) {
        await ctx.db.insert('publication_assets', {
          asset_type: 'cardback-preset',
          asset_id: key,
          cache_token: key + '-1',
          published_at: 10,
        });
      }
      const [first, second] = assetPublishingFaction.leaders;
      const firstId = factionMemberPublicationId(factionId, first!.memberId);
      await ctx.db.insert('publication_assets', {
        asset_type: 'faction-leader',
        asset_id: firstId,
        cache_token: 'leader-1',
        published_at: 20,
      });
      /* A replacement in flight leaves the earlier publication usable. */
      await ctx.db.insert('publication_jobs', {
        asset_type: 'faction-leader',
        asset_id: firstId,
        asset_data: {},
        status: 'pending',
        attempt_counter: 0,
        created_at: 30,
        updated_at: 30,
      });
      await ctx.db.insert('publication_jobs', {
        asset_type: 'faction-leader',
        asset_id: factionMemberPublicationId(factionId, second!.memberId),
        asset_data: {},
        status: 'pending',
        attempt_counter: 0,
        created_at: 30,
        updated_at: 30,
      });
      return { factionId, deletedId };
    });

    const definition = await t.query(api.playCatalogue.factionDefinition, { factionId });
    expect(definition).toMatchObject({
      faction: { id: factionId, slug: 'atreides', name: assetPublishingFaction.name },
      data: assetPublishingFaction,
      cardbacks: {
        traitor: '/published/cardback-presets/traitor/cardback.jpg?v=traitor-1',
        alliance: '/published/cardback-presets/alliance/cardback.jpg?v=alliance-1',
      },
      token: `/published/faction-tokens/${factionId}/token.jpg?v=token-1`,
      /* Its blocked back has not published yet. */
      tokenBack: null,
    });
    const [first, second] = assetPublishingFaction.leaders;
    expect(definition?.leaders[0]).toEqual({
      memberId: first!.memberId,
      front: `/published/leaders/${factionMemberPublicationId(factionId, first!.memberId)}/leader.jpg?v=leader-1`,
    });
    expect(definition?.leaders[1]).toEqual({ memberId: second!.memberId, front: null });
    expect(definition?.leaders).toHaveLength(assetPublishingFaction.leaders.length);
    expect(await t.query(api.playCatalogue.factionDefinition, { factionId: deletedId })).toBeNull();
    expect(await t.query(api.playCatalogue.factionDefinition, { factionId: 'not-an-id' })).toBeNull();
  });

  test('a ruleset reads its slotted assets by slot, without soft-deleted assets', async () => {
    const t = convexTest(schema, modules);
    const { rulesetId, deletedRulesetId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert('users', { email: 'curator@example.invalid' });
      const stamp = new Date().toISOString();
      const ruleset = {
        name: 'Classic',
        about: 'The classic table, as printed.'.padEnd(60, '.'),
        created_at: stamp,
        updated_at: stamp,
        owner_id: owner,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      };
      const rulesetId = await ctx.db.insert('rulesets', { ...ruleset, slug: 'classic' });
      const deletedRulesetId = await ctx.db.insert('rulesets', { ...ruleset, slug: 'retired', is_deleted: true });
      const deck = (slug: string, is_deleted = false) =>
        ctx.db.insert('assets', {
          owner_id: owner,
          type: 'deck',
          data: { name: slug, about: '', cardback: publishingDeckCardback },
          slug,
          created_at: stamp,
          updated_at: stamp,
          is_deleted,
          group_id: null,
        });
      await ctx.db.insert('ruleset_asset_slots', {
        ruleset_id: rulesetId,
        asset_id: await deck('treachery'),
        slot: 'treachery',
      });
      await ctx.db.insert('ruleset_asset_slots', {
        ruleset_id: rulesetId,
        asset_id: await deck('spice', true),
        slot: 'spice',
      });
      await ctx.db.insert('ruleset_asset_slots', {
        ruleset_id: rulesetId,
        asset_id: await deck('house'),
        slot: 'custom',
      });
      return { rulesetId, deletedRulesetId };
    });

    const supply = await t.query(api.playCatalogue.rulesetSupply, { rulesetId });
    expect(supply?.ruleset).toEqual({ id: rulesetId, slug: 'classic', name: 'Classic' });
    expect(supply?.slots.map((entry) => [entry.slot, entry.asset.slug, entry.asset.type, entry.asset.name])).toEqual([
      ['treachery', 'treachery', 'deck', 'treachery'],
      ['custom', 'house', 'deck', 'house'],
    ]);
    expect(await t.query(api.playCatalogue.rulesetSupply, { rulesetId: deletedRulesetId })).toBeNull();
    expect(await t.query(api.playCatalogue.rulesetSupply, { rulesetId: 'not-an-id' })).toBeNull();
  });

  test('a deck reads in one query with its cardback and each live member front, which is null until published', async () => {
    const t = convexTest(schema, modules);
    const { deckId, publishedId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert('users', { email: 'curator@example.invalid' });
      const stamp = new Date().toISOString();
      const asset = (type: string, slug: string, data: unknown, is_deleted = false) =>
        ctx.db.insert('assets', {
          owner_id: owner,
          type,
          data,
          slug,
          created_at: stamp,
          updated_at: stamp,
          is_deleted,
          group_id: null,
        });
      const deckId = await asset('deck', 'house', { name: 'House', about: '', cardback: publishingDeckCardback });
      const cards = [
        { id: await asset('card-treachery', 'published', publishingTreacheryCard), count: 2 },
        { id: await asset('card-treachery', 'unpublished', publishingTreacheryCard), count: 1 },
        { id: await asset('card-treachery', 'deleted', publishingTreacheryCard, true), count: 3 },
      ];
      for (const card of cards) {
        await ctx.db.insert('asset_relations', {
          from_asset_id: deckId,
          to_asset_id: card.id,
          kind: 'deck-card',
          count: card.count,
        });
      }
      for (const [asset_type, asset_id] of [
        ['deck', deckId],
        ['card-treachery', cards[0]!.id],
      ] as const) {
        await ctx.db.insert('publication_assets', { asset_type, asset_id, cache_token: 'v1', published_at: 10 });
      }
      return { deckId, publishedId: cards[0]!.id };
    });

    const supply = await t.query(api.playCatalogue.assetSupply, { type: 'deck', slug: 'house' });
    expect(supply).toMatchObject({
      asset: { id: deckId, type: 'deck', slug: 'house' },
      back: publishedHref('deck', deckId, 'v1'),
      backMode: 'authored-cardback',
      membersTruncated: false,
    });
    expect(supply?.members.map(({ asset, count, front }) => [asset.slug, count, front])).toEqual([
      ['published', 2, publishedHref('card-treachery', publishedId, 'v1')],
      ['unpublished', 1, null],
    ]);
    expect(await t.query(api.playCatalogue.assetSupply, { type: 'deck', slug: 'missing' })).toBeNull();
  });
});
