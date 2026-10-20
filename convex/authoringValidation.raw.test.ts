/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

describe('raw authoring reference checks', () => {
  test('requires authentication and writes nothing for valid faction data', async () => {
    const t = applicationTest();
    const args = { kind: 'faction' as const, text: JSON.stringify(assetPublishingFaction) };
    await expect(t.query(api.authoringValidation.raw, args)).rejects.toThrow();
    const id = await t.run((ctx) => ctx.db.insert('users', { name: 'Author' }));
    const viewer = t.withIdentity({ subject: id });
    await expect(viewer.query(api.authoringValidation.raw, args)).resolves.toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.query('factions').collect()).toEqual([]);
      expect(await ctx.db.query('user_image_ingest_tokens').collect()).toEqual([]);
      expect(await ctx.db.query('publication_jobs').collect()).toEqual([]);
    });
  });
  test('rejects unavailable typed faction Extras before Load', async () => {
    const t = applicationTest();
    const id = await t.run((ctx) => ctx.db.insert('users', { name: 'Author' }));
    await expect(
      t.withIdentity({ subject: id }).query(api.authoringValidation.raw, {
        kind: 'faction',
        text: JSON.stringify({ ...assetPublishingFaction, extras: [{ type: 'deck', slug: 'missing' }] }),
      })
    ).rejects.toThrow('$.extras.0');
  });
});
