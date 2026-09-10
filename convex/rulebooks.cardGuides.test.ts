// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1 } from '../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../src/shared/rulebooks/projectRenderDocument';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const cardData = (name: string) => ({
  name,
  about: '',
  subName: 'Weapon - Projectile',
  head: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    invert: true,
    definition: 0,
    influence: 0.5,
  },
  icon: [
    { image: '/image/texture/015.jpg', colors: ['#4B4C0D', '#262B04'], invert: true, definition: 0, influence: 0.5 },
    '/vector/icon/projectile.svg',
  ],
  decals: [],
  text: 'Play against one leader.',
});

async function cardGuideFixture() {
  const fixture = await rulebookFixture();
  const { t, owner, ids } = fixture;
  const created = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Card guide',
    source: { kind: 'starter' },
  });
  const assetIds = await t.run(async (ctx) => {
    const cards = [];
    for (const [slug, name] of [
      ['lasgun', 'Lasgun'],
      ['maula', 'Maula Pistol'],
      ['crysknife', 'Crysknife'],
    ]) {
      const assetId = await ctx.db.insert('assets', {
        owner_id: ids.ownerId,
        group_id: null,
        slug,
        is_deleted: false,
        type: 'card-treachery',
        data: cardData(name),
        created_at: '2026-09-10',
        updated_at: '2026-09-10',
      });
      await ctx.db.insert('publication_assets', {
        asset_type: 'card-treachery',
        asset_id: assetId,
        cache_token: 'initial',
        published_at: 1,
      });
      cards.push(assetId);
    }
    return cards;
  });
  const source = (index: number) => ({ kind: 'asset' as const, assetId: assetIds[index]! });
  const blocks: RulebookBlockDraft[] = [
    { id: 'CARD', kind: 'card-entry', source: source(0), text: 'Keep the individual guidance.', quantity: 1 },
    {
      id: 'GRUP',
      kind: 'card-group',
      title: 'Projectile weapons',
      text: 'Shared *guidance*.',
      variant: 'featured-member',
      featuredItemId: 'second',
      itemOrder: ['second', 'first'],
      itemsById: {
        first: { id: 'first', source: source(1), text: 'Maula guidance.', quantity: 2 },
        second: { id: 'second', source: source(2), text: 'Crysknife guidance.', quantity: 0 },
      },
    },
    { id: 'EMPT', kind: 'card-group', title: '', text: '', variant: 'gallery', itemOrder: [], itemsById: {} },
    { id: 'BLNK', kind: 'card-entry', text: '' },
  ];
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'cards',
        title: 'Cards',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: blocks.map(({ id }) => id) },
        blocksById: Object.fromEntries(blocks.map((block) => [block.id, block])),
      },
    },
  });
  return {
    ...fixture,
    created,
    contents,
    assetIds,
    locator: { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug },
  };
}

async function publish(fixture: Awaited<ReturnType<typeof cardGuideFixture>>) {
  const { owner, created, contents } = fixture;
  await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
  expect(
    await owner.mutation(api.rulebooks.publish, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    })
  ).toMatchObject({ kind: 'published' });
}

describe('Rulebook Card guide persistence and publication', () => {
  test('publishes individual, grouped, blank and empty guides through the reader, HTML and PDF projections', async () => {
    const fixture = await cardGuideFixture();
    const { t, owner, created, assetIds, contents, locator } = fixture;
    expect(await owner.query(api.rulebooks.editorPage, { ...locator, reference_asset_ids: assetIds })).toMatchObject({
      assetsById: {
        [assetIds[0]!]: { name: 'Lasgun', type: 'card-treachery' },
        [assetIds[1]!]: { name: 'Maula Pistol', type: 'card-treachery' },
      },
    });
    for (const work of await t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {})) {
      await t.mutation(internal.rulebookHtmlPublication.completeHtmlWork, { artifactId: work.artifactId });
    }
    for (const work of await t.mutation(internal.rulebookPdfPublication.takePdfWork, {})) {
      await t.mutation(internal.rulebookPdfPublication.completePdfWork, { artifactId: work.artifactId });
    }
    await publish(fixture);
    const reader = await t.query(api.rulebooks.readerPage, locator);
    if (!reader) {
      throw new Error('Expected the published reader');
    }
    expect(reader.edition.contents).toEqual(contents);
    const [html, pdf] = await Promise.all([
      t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {}),
      t.mutation(internal.rulebookPdfPublication.takePdfWork, {}),
    ]);
    const documents = [
      projectRulebookRenderDocument(reader.edition.contents, reader.assetsById, reader.edition.settings),
      html.find((work) => work.rulebookId === created.rulebook._id && work.editionNumber === 2)?.document,
      pdf.find((work) => work.rulebookId === created.rulebook._id && work.editionNumber === 2)?.document,
    ];
    for (const document of documents) {
      expect(document?.pagesById.PAGE.regions[0]?.blocks).toMatchObject([
        {
          kind: 'card-entry',
          source: { status: 'ready', name: 'Lasgun' },
          text: 'Keep the individual guidance.',
          quantity: 1,
        },
        {
          kind: 'card-group',
          title: 'Projectile weapons',
          text: 'Shared *guidance*.',
          featuredItemId: 'second',
          items: [
            { id: 'second', source: { status: 'ready', name: 'Crysknife' }, text: 'Crysknife guidance.', quantity: 0 },
            { id: 'first', source: { status: 'ready', name: 'Maula Pistol' }, text: 'Maula guidance.', quantity: 2 },
          ],
        },
        { kind: 'card-group', title: '', text: '', items: [] },
        { kind: 'card-entry', text: '', source: { status: 'unselected' } },
      ]);
    }
  });

  test('clones group identities and the featured member together while preserving live references and authored content', async () => {
    const fixture = await cardGuideFixture();
    const { owner, ids, created, assetIds, contents } = fixture;
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    const cloned = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Cloned Card guide',
      source: { kind: 'clone', rulebook_id: created.rulebook._id },
    });
    const clone = rulebookContentsV1Schema.parse(cloned.draft.contents);
    const page = clone.pagesById[clone.pageOrder[0]!];
    const group = Object.values(page.blocksById).find((block) => block.kind === 'card-group' && block.title);
    if (group?.kind !== 'card-group') {
      throw new Error('Expected the cloned Card group');
    }
    expect(clone.pageOrder).not.toContain('PAGE');
    expect(Object.keys(page.blocksById)).not.toContain('GRUP');
    expect(group.itemOrder.some((id) => id === 'first' || id === 'second')).toBe(false);
    expect(group.featuredItemId).toBe(group.itemOrder[0]);
    expect(group.itemsById[group.featuredItemId!]).toMatchObject({
      source: { kind: 'asset', assetId: assetIds[2] },
      text: 'Crysknife guidance.',
      quantity: 0,
    });
    expect(group.itemsById[group.itemOrder[1]!]).toMatchObject({
      source: { kind: 'asset', assetId: assetIds[1] },
      text: 'Maula guidance.',
      quantity: 2,
    });
    expect(group.text).toBe('Shared *guidance*.');
  });

  test('completed source replacement updates the live reader through the same image address without rewriting the Edition', async () => {
    const fixture = await cardGuideFixture();
    const { t, owner, contents, assetIds, locator } = fixture;
    await publish(fixture);
    const assetId = assetIds[0]!;
    const before = await t.query(api.rulebooks.readerPage, locator);
    await owner.mutation(api.assets.update, { id: assetId, data: cardData('Updated Lasgun') });
    await t.run((ctx) =>
      ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: { 'card-treachery': 1 },
        updated_at: Date.now(),
      })
    );
    const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
    const job = assignment.items.find((item) => item.assetId === assetId && item.assetType === 'card-treachery');
    if (!job) {
      throw new Error('Expected the Card replacement capture');
    }
    const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: job.jobId });
    if (!snapshot) {
      throw new Error('Expected the Card capture snapshot');
    }
    const cacheToken = '10000000-1000-4000-8000-100000000002';
    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId: job.jobId,
        payloadHash: snapshot.payloadHash,
        cacheToken,
      })
    ).toMatchObject({ status: 'completed' });
    const after = await t.query(api.rulebooks.readerPage, locator);
    expect(after?.edition.contents).toEqual(contents);
    expect(after?.assetsById[assetId]).toMatchObject({
      name: 'Updated Lasgun',
      imageUrl: publishedHref('card-treachery', assetId, cacheToken),
    });
    expect(new URL(after!.assetsById[assetId].imageUrl!, 'https://dune.zone').pathname).toBe(
      new URL(before!.assetsById[assetId].imageUrl!, 'https://dune.zone').pathname
    );
    await t.run((ctx) => ctx.db.patch('assets', assetId, { is_deleted: true }));
    const unavailable = await t.query(api.rulebooks.readerPage, locator);
    const render = projectRulebookRenderDocument(
      unavailable!.edition.contents,
      unavailable!.assetsById,
      unavailable!.edition.settings
    );
    expect(render.pagesById.PAGE.regions[0]?.blocks[0]).toMatchObject({
      source: { status: 'unavailable', reference: { kind: 'asset', assetId } },
      text: 'Keep the individual guidance.',
      quantity: 1,
    });
    const draft: RulebookContentsDraftV1 = structuredClone(contents);
    const missingCard = draft.pagesById.PAGE.blocksById.CARD;
    if (missingCard.kind !== 'card-entry') {
      throw new Error('Expected the unavailable Card entry');
    }
    missingCard.text = 'Updated guidance for the unavailable Card.';
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: fixture.created.rulebook._id,
      expected_revision: 2,
      contents: draft,
    });
    expect(
      await owner.mutation(api.rulebooks.publish, {
        rulebook_id: fixture.created.rulebook._id,
        expected_revision: 3,
        confirmed: true,
      })
    ).toMatchObject({ kind: 'published' });
  });
});
