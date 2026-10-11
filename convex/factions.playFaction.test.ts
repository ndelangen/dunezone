/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('a Play seat finds a live faction page and its rules by the id it carries, and nothing for a deleted or unknown faction', async () => {
  const t = convexTest(schema, modules);
  const now = '2026-10-11T09:30:00.000Z';
  const { live, deleted } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', {});
    const row = (slug: string, is_deleted: boolean) => ({
      owner_id: ownerId,
      data: { ...assetPublishingFaction, name: slug },
      slug,
      created_at: now,
      updated_at: now,
      is_deleted,
      group_id: null,
    });
    return {
      live: await ctx.db.insert('factions', row('atreides', false)),
      deleted: await ctx.db.insert('factions', row('old-atreides', true)),
    };
  });

  await expect(t.query(api.factions.playFaction, { id: live })).resolves.toMatchObject({
    slug: 'atreides',
    data: { name: 'atreides' },
  });
  await expect(t.query(api.factions.playFaction, { id: deleted })).resolves.toBeNull();
  /* The local fixtures seat factions under plain names, which are no faction id at all. */
  await expect(t.query(api.factions.playFaction, { id: 'harkonnen' })).resolves.toBeNull();
});
