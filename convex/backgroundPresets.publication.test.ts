/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { CHECKED_IN_RENDERER_REVISIONS } from '../src/shared/asset-publishing/renderer-revisions';
import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

afterEach(() => vi.useRealTimers());
async function fixture() {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => ({
    admin: await ctx.db.insert('users', { isAdmin: true }),
    author: await ctx.db.insert('users', {}),
  }));
  await t.mutation(internal.publicationAdmin.initialize, { rendererRevisions: CHECKED_IN_RENDERER_REVISIONS });
  return { t, admin: t.withIdentity({ subject: ids.admin }), author: t.withIdentity({ subject: ids.author }) };
}
const background = {
  key: 'custom/test-standard',
  name: 'Test standard',
  value: publishingTokenFace.background,
  revision: 0,
};
const linked = { ...background.value, source: { kind: 'preset', key: background.key } };
const token = (name: string, value: unknown) => ({
  name,
  about: '',
  front: { ...publishingTokenFace, background: value },
  back: { mode: 'custom', face: publishingTokenFace },
});

test('only administrators save definitions, revisions prevent lost edits, and bad links roll back asset creation', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await expect(t.mutation(api.backgroundPresets.save, background)).rejects.toThrow('Not authenticated');
  await expect(author.mutation(api.backgroundPresets.save, background)).rejects.toThrow('Not authorized');
  expect(await admin.mutation(api.backgroundPresets.save, background)).toBe(1);
  await expect(admin.mutation(api.backgroundPresets.save, background)).rejects.toThrow('changed elsewhere');
  await expect(
    author.mutation(api.assets.create, {
      type: 'token-disc',
      data: token('Missing standard', { ...linked, source: { kind: 'preset', key: 'custom/missing' } }),
    })
  ).rejects.toThrow('no longer exists');
  expect(await t.run((ctx) => ctx.db.query('assets').take(10))).toHaveLength(0);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('linked changes recapture token faces and embedded cards, preserve raw choices and leave Custom captures alone', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const shared = await author.mutation(api.assets.create, { type: 'token-disc', data: token('Shared token', linked) });
  const custom = await author.mutation(api.assets.create, {
    type: 'token-disc',
    data: token('Custom token', { ...background.value, source: { kind: 'custom' } }),
  });
  const card = await author.mutation(api.assets.create, {
    type: 'card-custom',
    data: {
      ...publishingCustomCard,
      layers: [
        {
          kind: 'token',
          layerId: '30000000-3000-4000-8000-300000000001',
          asset_id: shared.id,
          scale: 1,
          offset: [0, 0],
          opacity: 1,
          rotation: 0,
        },
      ],
    },
  });
  const before = await t.run(async (ctx) => ({
    jobs: await ctx.db.query('publication_jobs').take(100),
    uses: await ctx.db.query('background_uses').take(100),
  }));
  expect(before.uses).toEqual([expect.objectContaining({ key: background.key, subject: shared.id })]);
  const customJob = before.jobs.find((job) => job.asset_id === custom.id)!;
  await admin.mutation(api.backgroundPresets.save, {
    ...background,
    revision: 1,
    value: { ...background.value, colors: ['#112233', '#445566'] },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const result = await t.run(async (ctx) => ({
    jobs: await ctx.db.query('publication_jobs').take(100),
    row: await ctx.db.get(shared.id),
  }));
  expect(result.row?.data.front.background).toEqual(linked);
  expect(result.jobs.find((job) => job.asset_id === shared.id)?.asset_data.face.background.colors).toEqual([
    '#112233',
    '#445566',
  ]);
  expect(
    result.jobs.find((job) => job.asset_id === card.id)?.asset_data.tokens[shared.id].face.background.colors
  ).toEqual(['#112233', '#445566']);
  expect(result.jobs.find((job) => job.asset_id === custom.id)).toEqual(customJob);
  expect(JSON.stringify(result.jobs.map((job) => job.asset_data))).not.toContain('"source"');
});

test('renaming a definition creates no captures and changing a link to Custom removes its dependency', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const asset = await author.mutation(api.assets.create, { type: 'token-disc', data: token('Custom choice', linked) });
  await t.run(async (ctx) => {
    for (const job of await ctx.db.query('publication_jobs').take(100)) {
      await ctx.db.delete(job._id);
    }
  });
  const before = [];
  await admin.mutation(api.backgroundPresets.save, { ...background, revision: 1, name: 'Renamed standard' });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query('publication_jobs').take(100))).toEqual(before);
  await author.mutation(api.assets.update, {
    id: asset.id,
    data: token('Custom choice', { ...background.value, source: { kind: 'custom' } }),
  });
  expect(await t.run((ctx) => ctx.db.query('background_uses').take(100))).toEqual([]);
});

test('family followers change with their family while direct preset links and legacy Custom cards keep their designs', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const family = (await t.query(api.presetLibrary.page, {})).families.find((preset) => preset.key === 'custom')!;
  const follower = await author.mutation(api.assets.create, {
    type: 'card-custom',
    data: {
      ...publishingCustomCard,
      name: 'Family follower',
      head: { ...publishingCustomCard.head, source: { kind: 'family' } },
      icon: [{ ...publishingCustomCard.icon[0], source: { kind: 'custom' } }, publishingCustomCard.icon[1]],
    },
  });
  const explicit = await author.mutation(api.assets.create, {
    type: 'card-custom',
    data: {
      ...publishingCustomCard,
      name: 'Direct background link',
      head: { ...family.style.head },
      icon: [{ ...publishingCustomCard.icon[0], source: { kind: 'custom' } }, publishingCustomCard.icon[1]],
    },
  });
  await author.mutation(api.assets.create, {
    type: 'card-custom',
    data: { ...publishingCustomCard, name: 'Legacy custom card' },
  });
  const old = (await t.query(api.backgroundPresets.list, {})).find((preset) => preset.key === 'front/custom/header')!;
  await t.run(async (ctx) => {
    for (const job of await ctx.db.query('publication_jobs').take(100)) {
      await ctx.db.delete(job._id);
    }
  });
  await admin.mutation(api.presetLibrary.saveFamily, {
    ...family,
    style: { ...family.style, head: linked },
    backgrounds: [],
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').take(100));
  expect(jobs.map((job) => job.asset_id)).toEqual([follower.id]);
  expect(jobs[0]?.asset_data.frontPreset.style.head).toEqual(background.value);
  expect((await t.query(api.backgroundPresets.list, {})).find((preset) => preset.key === old.key)?.value).toEqual(
    old.value
  );
  const page = await t.query(api.assets.page, { type: 'card-custom', slug: explicit.slug });
  expect(page?.asset.data.head.source).toEqual({ kind: 'preset', key: old.key });
});

test('Family is rejected outside card headers and icons, including inside shared family definitions', async () => {
  const { author, admin } = await fixture();
  await expect(
    author.mutation(api.assets.create, {
      type: 'token-disc',
      data: token('Wrong source', { ...background.value, source: { kind: 'family' } }),
    })
  ).rejects.toThrow('only for a card header');
  const family = (await admin.query(api.presetLibrary.page, {})).families.find((preset) => preset.key === 'custom')!;
  await expect(
    admin.mutation(api.presetLibrary.saveFamily, {
      ...family,
      style: { ...family.style, head: { ...family.style.head, source: { kind: 'family' } } },
      backgrounds: [],
    })
  ).rejects.toThrow('only for a card header');
});

test('a running capture retains its frozen values while a preset change queues its replacement', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const asset = await author.mutation(api.assets.create, { type: 'token-disc', data: token('Frozen token', linked) });
  const original = await t.run(async (ctx) => {
    const job = (await ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'token-disc').eq('asset_id', asset.id))
      .unique())!;
    await ctx.db.patch(job._id, { status: 'in_progress' });
    return job;
  });
  await admin.mutation(api.backgroundPresets.save, {
    ...background,
    revision: 1,
    value: { ...background.value, influence: 0.91 },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobs = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'token-disc').eq('asset_id', asset.id))
      .take(10)
  );
  expect(jobs.find((job) => job.status === 'in_progress')?.asset_data).toEqual(original.asset_data);
  expect(jobs.find((job) => job.status === 'pending')?.asset_data.face.background.influence).toBe(0.91);
});
