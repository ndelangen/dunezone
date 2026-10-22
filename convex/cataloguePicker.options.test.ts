/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

test('catalogue choices page within a type, search every page, and omit deleted targets', async () => {
  const t = applicationTest();
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    const base = {
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-22T00:00:00.000Z',
      updated_at: '2026-10-22T00:00:00.000Z',
    };
    await ctx.db.insert('factions', { ...base, slug: 'atreides', data: assetPublishingFaction });
    for (const [type, name, deleted] of [
      ['card-treachery', 'Lasgun', false],
      ['card-treachery', 'Shield', false],
      ['card-treachery', 'Karama', false],
      ['card-treachery', 'Deleted card', true],
      ['token-disc', 'Karama token', false],
    ] as const) {
      await ctx.db.insert('assets', {
        ...base,
        type,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        data: { name },
        is_deleted: deleted,
      });
    }
  });
  const args = { group: 'card-treachery', q: '', paginationOpts: { numItems: 2, cursor: null } };
  const first = await t.query(api.cataloguePicker.options, args);
  const rest = await t.query(api.cataloguePicker.options, {
    ...args,
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  expect(
    [...first.page, ...rest.page].map((row) => (row.kind === 'asset' ? row.asset.name : row.faction.data.name)).sort()
  ).toEqual(['Karama', 'Lasgun', 'Shield']);
  expect(rest.isDone).toBe(true);
  const searched = await t.query(api.cataloguePicker.options, { ...args, q: 'Lasgun' });
  expect(searched.page).toMatchObject([{ kind: 'asset', asset: { name: 'Lasgun' } }]);
  const factions = await t.query(api.cataloguePicker.options, { ...args, group: 'faction' });
  expect(factions.page).toMatchObject([{ kind: 'faction' }]);
  await expect(t.query(api.cataloguePicker.options, { ...args, group: 'unknown-type' })).rejects.toThrow(
    'Unknown catalogue type'
  );
});
