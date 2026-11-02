/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { CARD_FRONT_PUBLICATION_REVISIONS, INITIAL_CARD_FRONT_PRESETS } from '../src/shared/assets/cardFrontPresets';
import { GF9_LEADER_SKILLS } from '../src/shared/assets/gf9LeaderSkills';
import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { GF9_STRONGHOLD_CARDS } from '../src/shared/assets/gf9StrongholdDeck';
import { EXAMPLE_HOMEWORLD_CARD } from '../src/shared/assets/homeworldTemplate';
import { standardStormCard } from '../src/shared/assets/standardStormDeck';
import { TREACHERY_STYLES } from '../src/shared/assets/treacheryStyles';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

afterEach(() => vi.useRealTimers());
const stronghold = INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === 'stronghold')!;
async function fixture(revisions: Record<string, number> = CARD_FRONT_PUBLICATION_REVISIONS) {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => ({
    admin: await ctx.db.insert('users', { isAdmin: true }),
    author: await ctx.db.insert('users', {}),
  }));
  await t.mutation(internal.publicationAdmin.initialize, { rendererRevisions: revisions });
  return {
    t,
    authorId: ids.author,
    admin: t.withIdentity({ subject: ids.admin }),
    author: t.withIdentity({ subject: ids.author }),
  };
}

test('front presets require Administrator access, an activated renderer and the saved revision', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  const args = { key: stronghold.key, style: stronghold.style, revision: 0 };
  await expect(t.mutation(api.cardFrontPresets.save, args)).rejects.toThrow('Not authenticated');
  await expect(author.mutation(api.cardFrontPresets.save, args)).rejects.toThrow('Not authorized');
  expect(await admin.mutation(api.cardFrontPresets.save, args)).toBe(1);
  await expect(admin.mutation(api.cardFrontPresets.save, args)).rejects.toThrow('changed elsewhere');
  await expect(
    admin.mutation(api.cardFrontPresets.save, { ...args, revision: 1, style: { ...args.style, iconBackground: null } })
  ).rejects.toThrow('Choose an icon background');
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const unactivated = await fixture({ 'card-stronghold': 3 });
  await expect(unactivated.admin.mutation(api.cardFrontPresets.save, args)).rejects.toThrow('not ready yet');
});

const families = [
  { type: 'card-homeworld', card: EXAMPLE_HOMEWORLD_CARD, key: 'homeworld' },
  { type: 'card-stronghold', card: GF9_STRONGHOLD_CARDS[0]!, key: 'stronghold' },
  { type: 'card-storm', card: standardStormCard(3), key: 'storm' },
  { type: 'card-nexus', card: GF9_NEXUS_CARDS[0]!, key: 'nexus' },
  { type: 'card-leaderability', card: GF9_LEADER_SKILLS[0]!, key: 'leader-skill' },
  ...TREACHERY_STYLES.map((style) => ({
    type: 'card-treachery',
    key: `treachery-${style.key}`,
    card: {
      name: `Test ${style.key}`,
      about: '',
      subName: style.label,
      head: style.head,
      icon: [style.striped, '/vector/icon/projectile.svg'],
      decals: [],
      text: 'Rules.',
    },
  })),
];

async function linkedNexusCard({ t, authorId }: Awaited<ReturnType<typeof fixture>>) {
  const nexus = GF9_NEXUS_CARDS[0]!;
  const factionId = await t.run((ctx) =>
    ctx.db.insert('factions', {
      owner_id: authorId,
      data: {
        ...assetPublishingFaction,
        name: nexus.faction,
        logo: nexus.factionSymbol.image,
        background: nexus.factionSymbol.background,
      },
      slug: 'atreides',
      created_at: '2026-10-13T00:00:00Z',
      updated_at: '2026-10-13T00:00:00Z',
      is_deleted: false,
      group_id: null,
    })
  );
  return { ...nexus, factionLink: { id: factionId, slug: 'atreides' } };
}

test.each(families)('$key captures its shared style without changing authored data', async (family) => {
  vi.useFakeTimers();
  const context = await fixture();
  const { t, admin, author } = context;
  const card = family.type === 'card-nexus' ? await linkedNexusCard(context) : family.card;
  const preset = INITIAL_CARD_FRONT_PRESETS.find((entry) => entry.key === family.key)!;
  const created = await author.mutation(api.assets.create, { type: family.type, data: card });
  const style = { ...preset.style, head: { ...preset.style.head, influence: 0.91 } };
  await admin.mutation(api.cardFrontPresets.save, { key: preset.key, style, revision: 0 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const page = await t.query(api.assets.page, { type: family.type, slug: created.slug });
  expect(page?.asset.data).toEqual(card);
  expect(page?.cardFrontPresets.find((entry) => entry.key === preset.key)).toMatchObject({ style, revision: 1 });
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', family.type).eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data.frontPreset).toEqual({ style, revision: 1 });
  if (family.type === 'card-nexus') {
    expect(job?.asset_data.card.factionSymbol).toEqual(GF9_NEXUS_CARDS[0]!.factionSymbol);
  }
});

test('Custom cards retain their authored style when shared standards are available', async () => {
  const { t, author } = await fixture();
  const customData = {
    name: 'Custom retains style',
    subName: '',
    about: '',
    head: stronghold.style.head,
    icon: [stronghold.style.iconBackground, '/vector/icon/stronghold.svg'],
    format: 'plain',
    layers: [],
  };
  const custom = await author.mutation(api.assets.create, { type: 'card-custom', data: customData });
  const customJob = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', custom.id))
      .unique()
  );
  expect(customJob?.asset_data.frontPreset.style).toEqual({
    head: customData.head,
    iconBackground: customData.icon[0],
  });
});

test('rapid saves serialize captures and keep the older snapshot immutable until its replacement starts', async () => {
  vi.useFakeTimers();
  const { t, admin, author } = await fixture();
  const card = await author.mutation(api.assets.create, { type: 'card-stronghold', data: GF9_STRONGHOLD_CARDS[0]! });
  await admin.mutation(api.publicationAdmin.setPickupEnabled, { enabled: true });
  const first = await t.mutation(internal.publicationJobs.takeWork, {});
  expect(first.items).toHaveLength(1);
  const firstJob = first.items[0]!.jobId;
  const before = await t.query(internal.publicationJobs.readJobForRender, { jobId: firstJob });
  const style = { ...stronghold.style, iconBackground: { ...stronghold.style.iconBackground!, influence: 0.87 } };
  await admin.mutation(api.cardFrontPresets.save, { key: 'stronghold', style, revision: 0 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.mutation(internal.publicationJobs.takeWork, {})).items).toHaveLength(0);
  expect(await t.query(internal.publicationJobs.readJobForRender, { jobId: firstJob })).toEqual(before);
  expect(
    await t.mutation(internal.publicationJobs.completeJob, {
      jobId: firstJob,
      cacheToken: 'first',
      payloadHash: before!.payloadHash,
    })
  ).toMatchObject({ status: 'completed' });
  const publication = await t.run((ctx) =>
    ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-stronghold').eq('asset_id', card.id))
      .unique()
  );
  expect(publication?.cache_token).toBe('first');
  const next = await t.mutation(internal.publicationJobs.takeWork, {});
  expect(next.items).toHaveLength(1);
  const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: next.items[0]!.jobId });
  expect(snapshot?.payload).toMatchObject({ frontPreset: { style, revision: 1 } });
  expect(snapshot?.payloadHash).not.toBe(before?.payloadHash);
});

test('pre-activation card saves keep payloads compatible with the deployed publisher', async () => {
  const { t, author } = await fixture({ 'card-stronghold': 3 });
  const created = await author.mutation(api.assets.create, { type: 'card-stronghold', data: GF9_STRONGHOLD_CARDS[0]! });
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-stronghold').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data).not.toHaveProperty('frontPreset');
});
