/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('faction catalogue page', () => {
  test('returns active enriched factions, all active rulesets, and distinct spotlights', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Catalogue owner' });
      const advancedId = await ctx.db.insert('rulesets', {
        name: 'Advanced',
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug: 'advanced',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      await ctx.db.insert('rulesets', {
        name: 'Empty',
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug: 'empty',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      await ctx.db.insert('rulesets', {
        name: 'Deleted',
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug: 'deleted',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: true,
        image_cover: null,
      });
      const arrivalId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...assetPublishingFaction, name: 'New arrival' },
        slug: 'new-arrival',
        created_at: '2026-07-20T00:00:00.000Z',
        updated_at: '2026-07-20T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
      const updatedId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...assetPublishingFaction, name: 'Recently updated' },
        slug: 'recently-updated',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-21T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
      await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...assetPublishingFaction, name: 'Deleted faction' },
        slug: 'deleted-faction',
        created_at: '2026-07-22T00:00:00.000Z',
        updated_at: '2026-07-22T00:00:00.000Z',
        is_deleted: true,
        group_id: null,
      });
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: advancedId,
        faction_id: arrivalId,
      });
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: advancedId,
        faction_id: updatedId,
      });
    });

    const catalogue = await t.query(api.factions.cataloguePage, {});

    expect(catalogue.factions.map((faction) => faction.data.name).sort()).toEqual(['New arrival', 'Recently updated']);
    expect(catalogue.rulesets.map((ruleset) => ruleset.name)).toEqual(['Advanced', 'Empty']);
    expect(catalogue.factions[0]?.rulesets.map((ruleset) => ruleset.name)).toEqual(['Advanced']);
    expect(catalogue.spotlights.newArrival?.data.name).toBe('New arrival');
    expect(catalogue.spotlights.freshlyUpdated?.data.name).toBe('Recently updated');
  });

  test('ships what the catalogue draws and leaves the rest of the blob behind', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Narrowing owner' });
      await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...assetPublishingFaction, name: 'Full blob' },
        slug: 'full-blob',
        created_at: '2026-07-20T00:00:00.000Z',
        updated_at: '2026-07-20T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
    });

    const catalogue = await t.query(api.factions.cataloguePage, {});
    const row = catalogue.factions[0];

    expect(Object.keys(row ?? {}).sort()).toEqual(['_id', 'created_at', 'data', 'rulesets', 'slug', 'updated_at']);
    expect(Object.keys(row?.data ?? {}).sort()).toEqual([
      'background',
      'complexity',
      'hero',
      'leaders',
      'logo',
      'name',
    ]);
    /* The stored fixture really does carry the dropped fields, or the assertions above pass for the wrong reason. */
    expect(Object.keys(assetPublishingFaction)).toEqual(expect.arrayContaining(['rules', 'troops', 'colors']));
  });

  test('rejects malformed faction data at the query boundary', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Malformed owner' });
      await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: {},
        slug: 'malformed',
        created_at: '2026-07-20T00:00:00.000Z',
        updated_at: '2026-07-20T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
    });

    await expect(t.query(api.factions.cataloguePage, {})).rejects.toThrow();
  });
});
