/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { CHECKED_IN_RENDERER_REVISIONS } from '../src/shared/asset-publishing/renderer-revisions';
import { INITIAL_CARDBACK_PRESETS } from '../src/shared/assets/cardbackPresets';
import { INITIAL_CARD_FRONT_PRESETS } from '../src/shared/assets/cardFrontPresets';
import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import {
  publishingCustomDeckCardback,
  publishingDeckCardback,
} from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { standardStormCard } from '../src/shared/assets/standardStormDeck';
import { DISCOVERY_FAMILIES } from '../src/shared/backgrounds/families';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

afterEach(() => vi.useRealTimers());
async function fixture(initialize = true) {
  vi.useFakeTimers();
  const t = applicationTest();
  const ids = await t.run(async (ctx) => ({
    admin: await ctx.db.insert('users', { isAdmin: true }),
    author: await ctx.db.insert('users', {}),
  }));
  await t.run((ctx) =>
    ctx.db.insert('profiles', {
      user_id: ids.author,
      username: 'Author',
      avatar_url: null,
      account_state: 'active',
      slug: 'author',
      created_at: '2026-10-21T00:00:00Z',
      updated_at: '2026-10-21T00:00:00Z',
    })
  );
  await t.mutation(internal.publicationAdmin.initialize, { rendererRevisions: CHECKED_IN_RENDERER_REVISIONS });
  const admin = t.withIdentity({ subject: ids.admin });
  if (initialize) {
    await t.run(async (ctx) => {
      for (const preset of INITIAL_CARD_FRONT_PRESETS) {
        await ctx.db.insert('card_front_presets', { key: preset.key, style: preset.style, revision: 1, updated_at: 0 });
      }
      for (const preset of INITIAL_CARDBACK_PRESETS) {
        await ctx.db.insert('cardback_presets', {
          key: preset.key,
          cardback: preset.cardback,
          revision: 1,
          updated_at: 0,
        });
      }
      for (const family of DISCOVERY_FAMILIES) {
        await ctx.db.insert('discovery_presets', {
          key: family.key,
          label: family.label,
          front: publishingTokenFace,
          back: publishingTokenFace,
          revision: 1,
          updated_at: 0,
        });
      }
    });
    await admin.mutation(api.presetLibrary.initialize, {});
  }
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    for (const job of await ctx.db.query('publication_jobs').collect()) {
      await ctx.db.delete(job._id);
    }
  });
  return { t, admin, author: t.withIdentity({ subject: ids.author }) };
}
const background = {
  key: 'custom/test-standard',
  name: 'Test standard',
  value: publishingTokenFace.background,
  revision: 0,
};
const linked = { ...background.value, source: { kind: 'preset' as const, key: background.key } };
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
  await admin.mutation(api.backgroundPresets.save, { ...background, revision: 1, name: 'Renamed standard' });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query('publication_jobs').take(100))).toEqual([]);
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
  await admin.mutation(api.backgroundPresets.save, {
    ...background,
    revision: 1,
    value: { ...background.value, colors: ['#abc123', '#def456'] },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const propagated = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  expect(propagated.map((job) => job.asset_id)).toEqual([follower.id]);
  expect(propagated[0]?.asset_data.frontPreset.style.head.colors).toEqual(['#abc123', '#def456']);

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

test('renderer activation keeps current named back values, and old admin saves retain unchanged links', async () => {
  vi.useFakeTimers();
  const { t, admin } = await fixture();
  const key = 'back/treachery';
  const preset = (await t.query(api.backgroundPresets.list, {})).find((p) => p.key === key)!;
  const colors: [string, string] = ['#135791', '#246802'];
  await admin.mutation(api.backgroundPresets.save, { ...preset, value: { ...preset.value, colors } });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.mutation(internal.publicationRegeneration.scan, {
    assetType: 'cardback-preset',
    cursor: null,
    scanned: 0,
    enqueued: 0,
  });
  const job = (await t.run((ctx) => ctx.db.query('publication_jobs').collect())).find(
    (j) => j.asset_type === 'cardback-preset' && j.asset_id === 'treachery'
  )!;
  expect(job.asset_data.cardback.background.colors).toEqual(colors);
  const effective = (await t.query(api.cardbackPresets.list, {})).find((p) => p.key === 'treachery')!;
  await admin.mutation(api.cardbackPresets.save, {
    key: effective.key,
    revision: effective.revision,
    cardback: { ...effective.cardback, name: 'Changed label' },
  });
  const unchanged = (await t.query(api.presetLibrary.page, {})).families.find((p) => p.backKey === 'treachery')!;
  expect(unchanged.cardback.background.source).toEqual({ kind: 'preset', key });
  await admin.mutation(api.cardbackPresets.save, {
    key: 'treachery',
    revision: unchanged.backRevision,
    cardback: {
      ...effective.cardback,
      background: { ...effective.cardback.background, colors: ['#abcdef', '#fedcba'] },
    },
  });
  const changed = (await t.query(api.cardbackPresets.list, {})).find((p) => p.key === 'treachery')!;
  expect(changed.cardback.background.colors).toEqual(['#abcdef', '#fedcba']);
  expect((await t.query(api.backgroundPresets.list, {})).find((p) => p.key === key)?.value.colors).toEqual(colors);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('old front editor changes become Custom without changing previously linked backgrounds', async () => {
  vi.useFakeTimers();
  const { t, admin } = await fixture();
  const key = 'front/storm/header';
  const preset = (await t.query(api.backgroundPresets.list, {})).find((p) => p.key === key)!;
  await admin.mutation(api.backgroundPresets.save, {
    ...preset,
    value: { ...preset.value, colors: ['#111222', '#333444'] },
  });
  const front = (await t.query(api.cardFrontPresets.list, {})).find((p) => p.key === 'storm')!;
  await admin.mutation(api.cardFrontPresets.save, {
    key: 'storm',
    revision: front.revision,
    style: { ...front.style, head: { ...front.style.head, colors: ['#123456', '#654321'] } },
  });
  expect((await t.query(api.cardFrontPresets.list, {})).find((p) => p.key === 'storm')?.style.head.colors).toEqual([
    '#123456',
    '#654321',
  ]);
  const raw = (await t.query(api.presetLibrary.page, {})).families.find((p) => p.key === 'storm')!;
  expect(raw.style.head.source).toEqual({ kind: 'custom' });
  expect(raw.style.iconBackground?.source).toEqual({ kind: 'preset', key: 'front/storm/icon' });
  expect((await t.query(api.backgroundPresets.list, {})).find((p) => p.key === key)?.value.colors).toEqual([
    '#111222',
    '#333444',
  ]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('public bundle previews resolve current values while authoring keeps raw links and only referenced definitions', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  const asset = await author.mutation(api.assets.create, {
    type: 'bundle',
    data: { name: 'Linked bundle', about: '', band: { label: 'Tokens', background: linked } },
  });
  await admin.mutation(api.backgroundPresets.save, {
    ...background,
    revision: 1,
    value: { ...background.value, colors: ['#123456', '#654321'] },
  });
  const catalogue = await t.query(api.assets.catalogue, { type: 'bundle' });
  expect(catalogue.entries[0]?.data.band.background.colors).toEqual(['#123456', '#654321']);
  const page = await t.query(api.assets.page, { type: 'bundle', slug: asset.slug });
  expect(page?.asset.data.band.background).toEqual(linked);
  expect(page?.backgrounds.map((p) => p.key)).toEqual([background.key]);
  expect(page?.backgrounds[0]?.value.colors).toEqual(['#123456', '#654321']);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('changing the Traitor family recaptures only Traitor faces', async () => {
  vi.useFakeTimers();
  const { t, admin } = await fixture();
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', {});
    await ctx.db.insert('factions', {
      data: assetPublishingFaction,
      slug: 'traitor-proof',
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-21T00:00:00Z',
      updated_at: '2026-10-21T00:00:00Z',
    });
  });
  const family = (await t.query(api.presetLibrary.page, {})).families.find((p) => p.key === 'traitor')!;
  await admin.mutation(api.presetLibrary.saveFamily, {
    ...family,
    style: {
      ...family.style,
      head: { ...family.style.head, colors: ['#123456', '#654321'], source: { kind: 'custom' } },
    },
    backgrounds: [],
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  expect(jobs.length).toBeGreaterThan(0);
  expect(new Set(jobs.map((j) => j.asset_type))).toEqual(new Set(['faction-traitor']));
});

test('a shared edit paginates every use and recaptures Storm and Spice cards embedding those tokens', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  const first = await author.mutation(api.assets.create, { type: 'token-disc', data: token('First use', linked) });
  const second = await author.mutation(api.assets.create, { type: 'token-disc', data: token('Second use', linked) });
  const board = await author.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Arrakis', about: '', board: arrakisBoard() },
  });
  const storm = await author.mutation(api.assets.create, {
    type: 'card-storm',
    data: {
      ...standardStormCard(3),
      layers: [
        {
          kind: 'token',
          layerId: crypto.randomUUID(),
          asset_id: first.id,
          offset: [0, 0],
          scale: 1,
          opacity: 1,
          rotation: 0,
        },
      ],
    },
  });
  const spice = await author.mutation(api.assets.create, {
    type: 'card-spice',
    data: {
      ...publishingSpiceCard,
      board: {
        asset_id: board.id,
        tints: [],
        tokens: [{ layerId: 'placed', asset_id: second.id, x: 100, y: 100, size: 30, rotation: 0 }],
      },
    },
  });
  await admin.mutation(api.backgroundPresets.save, {
    ...background,
    revision: 1,
    value: { ...background.value, colors: ['#123456', '#654321'] },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  for (const asset of [first, second]) {
    expect(jobs.find((j) => j.asset_id === asset.id)?.asset_data.face.background.colors).toEqual([
      '#123456',
      '#654321',
    ]);
  }
  expect(jobs.find((j) => j.asset_id === storm.id)?.asset_data.tokens[first.id].face.background.colors).toEqual([
    '#123456',
    '#654321',
  ]);
  const spiceData = jobs.find((j) => j.asset_id === spice.id)?.asset_data;
  expect(JSON.stringify(spiceData)).toContain('#123456');
  expect(JSON.stringify(spiceData)).not.toContain('"source"');
}, 30_000);

test('faction catalogue cards, spotlights and sheet preview projections follow the current background', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  await admin.mutation(api.backgroundPresets.save, background);
  const faction = await author.mutation(api.factions.create, {
    data: { ...assetPublishingFaction, background: linked },
  });
  await admin.mutation(api.backgroundPresets.save, {
    ...background,
    revision: 1,
    value: { ...background.value, colors: ['#123456', '#654321'] },
  });
  const catalogue = await t.query(api.factions.cataloguePage, {});
  expect(catalogue.factions[0]?.data.background.colors).toEqual(['#123456', '#654321']);
  expect(catalogue.spotlights.newArrival?.data.background.colors).toEqual(['#123456', '#654321']);
  const homepage = await t.query(api.homepage.get, {});
  expect(homepage.spotlights.newArrival?.data.background.colors).toEqual(['#123456', '#654321']);
  const page = await t.query(api.factions.pageBySlug, { slug: faction.slug });
  expect(page?.faction.data.background).toEqual(linked);
  expect(page?.backgrounds).toEqual([
    expect.objectContaining({
      key: background.key,
      value: expect.objectContaining({ colors: ['#123456', '#654321'] }),
    }),
  ]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('family and Discovery saves reject duplicate background definitions atomically', async () => {
  const { t, admin } = await fixture();
  const library = await t.query(api.presetLibrary.page, {});
  const backgrounds = [background, background];
  const before = await t.run((ctx) => ctx.db.query('background_presets').collect());
  await expect(admin.mutation(api.presetLibrary.saveFamily, { ...library.families[0]!, backgrounds })).rejects.toThrow(
    'Choose each background only once'
  );
  await expect(
    admin.mutation(api.presetLibrary.saveDiscovery, {
      key: 'discovery-hiereg',
      label: 'Hiereg Discovery',
      front: publishingTokenFace,
      back: publishingTokenFace,
      revision: 0,
      backgrounds,
    })
  ).rejects.toThrow('Choose each background only once');
  expect(await t.run((ctx) => ctx.db.query('background_presets').collect())).toEqual(before);
});

test('an explicit import saves DB artwork once and source edits cannot change shared standards', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture(false);
  const value = { ...background.value, colors: ['#123456', '#654321'] };
  const source = await author.mutation(api.assets.create, { type: 'token-disc', data: token('Cistern', value) });
  await author.mutation(api.assets.create, { type: 'token-disc', data: token('Ornithopter', value) });
  await author.mutation(api.assets.create, {
    type: 'card-treachery',
    data: { ...publishingTreacheryCard, name: 'Prediction', subName: 'Prediction - Reveal', head: value },
  });
  for (const name of ['Homeworld', 'Stronghold', 'Nexus', 'Leader Skill']) {
    await author.mutation(api.assets.create, {
      type: 'deck',
      data: { name: `${name} Deck`, about: '', cardback: { ...publishingCustomDeckCardback, background: value } },
    });
  }
  await expect(author.mutation(api.presetLibrary.initialize, {})).rejects.toThrow('Not authorized');
  expect((await t.query(api.presetLibrary.page, {})).ready).toBe(false);
  await admin.mutation(api.presetLibrary.initialize, {});
  const library = await t.query(api.presetLibrary.page, {});
  expect(library.ready).toBe(true);
  expect(library.discovery).toHaveLength(2);
  expect(library.discovery[0]?.front.background.colors).toEqual(value.colors);
  expect(library.families.find((p) => p.key === 'prediction')?.style.head.colors).toEqual(value.colors);
  expect(library.families.find((p) => p.key === 'homeworld')?.cardback.background.colors).toEqual(value.colors);
  const updated = { ...value, colors: ['#abcdef', '#fedcba'] };
  await t.run((ctx) =>
    ctx.db.patch(source.id, { data: token('Cistern', updated), slug: 'renamed-cistern', is_deleted: true })
  );
  expect((await t.query(api.presetLibrary.page, {})).discovery[0]?.front.background.colors).toEqual(value.colors);
  await admin.mutation(api.presetLibrary.initialize, {});
  expect((await t.query(api.presetLibrary.page, {})).discovery[0]?.revision).toBe(library.discovery[0]?.revision);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('an incomplete DB import rolls back every new preset', async () => {
  const { t, admin } = await fixture(false);
  expect(await t.query(api.backgroundPresets.list, {})).toEqual([]);
  await expect(admin.mutation(api.presetLibrary.initialize, {})).rejects.toThrow('source');
  expect(await t.run((ctx) => ctx.db.query('card_front_presets').collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query('cardback_presets').collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query('background_presets').collect())).toEqual([]);
});

test('importing a missing native back recaptures it even when its shared background already exists', async () => {
  const { t, admin, author } = await fixture();
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', 'homeworld'))
      .unique();
    await ctx.db.delete(row!._id);
  });
  await author.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Homeworld Deck', about: '', cardback: publishingCustomDeckCardback },
  });
  await admin.mutation(api.presetLibrary.initialize, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'cardback-preset').eq('asset_id', 'homeworld'))
      .first()
  );
  expect(job?.asset_data.cardback.image).toBe(publishingDeckCardback.image);
});

test('importing a referenced deck back copies its authored target and survives target deletion', async () => {
  const { t, admin, author } = await fixture();
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', 'homeworld'))
      .unique();
    await ctx.db.delete(row!._id);
  });
  const target = await author.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'All Homeworlds Deck', about: '', cardback: publishingCustomDeckCardback },
  });
  await author.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Homeworld Deck', about: '', cardback: { mode: 'reference', asset_id: target.id } },
  });
  await t.run((ctx) => ctx.db.patch(target.id, { is_deleted: true }));
  await expect(admin.mutation(api.presetLibrary.initialize, {})).rejects.toThrow('referenced deck no longer exists');
  expect((await t.query(api.presetLibrary.page, {})).ready).toBe(false);
  await t.run((ctx) => ctx.db.patch(target.id, { is_deleted: false }));
  await admin.mutation(api.presetLibrary.initialize, {});
  await t.run((ctx) => ctx.db.patch(target.id, { is_deleted: true }));
  const saved = await t.run((ctx) =>
    ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', 'homeworld'))
      .unique()
  );
  expect(saved?.cardback).toEqual(publishingDeckCardback);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test('importing a deck preset copies its current shared background', async () => {
  const { t, admin, author } = await fixture();
  const value: typeof background.value = { ...background.value, colors: ['#123456', '#654321'] };
  await admin.mutation(api.backgroundPresets.save, { ...background, key: 'back/stronghold', revision: 1, value });
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', 'homeworld'))
      .unique();
    await ctx.db.delete(row!._id);
  });
  await author.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Homeworld Deck', about: '', cardback: { mode: 'preset', key: 'stronghold' } },
  });
  await admin.mutation(api.presetLibrary.initialize, {});
  const saved = await t.run((ctx) =>
    ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', 'homeworld'))
      .unique()
  );
  expect(saved?.cardback.background.colors).toEqual(value.colors);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});
