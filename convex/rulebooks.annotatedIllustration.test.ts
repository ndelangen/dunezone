/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const revision = '10000000-1000-4000-8000-100000000002';
const endpoint = '/asset-publishing/executor/rulebook-illustration/resolve-delivery';

beforeEach(() => {
  vi.stubEnv('ASSET_PUBLISHER_EXECUTOR_SECRET', 'executor-secret');
  vi.stubEnv('ASSET_PUBLISHER_ACTIVATION_SECRET', 'activation-secret');
});
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const f = await rulebookFixture();
  const created = await f.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: f.ids.rulesetId,
    name: 'Annotated guide',
    source: { kind: 'starter' },
  });
  const assetId = await f.t.run(async (ctx) => {
    const id = await ctx.db.insert('assets', {
      owner_id: f.ids.ownerId,
      group_id: null,
      slug: 'explained-card',
      type: 'card-treachery',
      is_deleted: false,
      data: { name: 'Explained Card' },
      created_at: '2026-09-10',
      updated_at: '2026-09-10',
    });
    await ctx.db.insert('publication_assets', {
      asset_type: 'card-treachery',
      asset_id: id,
      cache_token: revision,
      published_at: 1000,
      component_geometry: {
        width: 900,
        height: 1263,
        parts: [{ key: 'name', x: 0.1, y: 0.1, width: 0.8, height: 0.1 }],
      },
    });
    return id;
  });
  const source = { kind: 'asset' as const, assetId };
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'anatomy',
        title: 'Anatomy',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['BLC2'] },
        blocksById: {
          BLC2: {
            id: 'BLC2',
            kind: 'asset-explainer',
            source,
            caption: 'Captured caption',
            numbering: 'automatic',
            colorMode: 'manual',
            itemOrder: ['first'],
            itemsById: {
              first: {
                id: 'first',
                label: 'kept',
                color: '#123456',
                text: 'Captured explanation',
                target: { kind: 'named', key: 'name', source },
              },
            },
          },
        },
      },
    },
  });
  const identity = { rulebookId: created.rulebook._id, editionNumber: 2, pageId: 'PAGE', blockId: 'BLC2' };
  return { ...f, created, contents, source, assetId, identity };
}

async function publish(f: Awaited<ReturnType<typeof fixture>>) {
  await f.owner.mutation(api.rulebooks.save, {
    rulebook_id: f.created.rulebook._id,
    expected_revision: 1,
    contents: f.contents,
  });
  await f.owner.mutation(api.rulebooks.publish, {
    rulebook_id: f.created.rulebook._id,
    expected_revision: 2,
    confirmed: true,
  });
}

describe('immutable annotated illustration delivery', () => {
  test('reads only a published Edition and follows the live source without exposing draft changes or prose', async () => {
    const f = await fixture();
    await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 1,
      contents: f.contents,
    });
    expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity)).toEqual({
      ok: true,
      status: 'missing',
    });
    await f.owner.mutation(api.rulebooks.publish, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });
    const first = await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity);
    expect(first).toMatchObject({
      status: 'found',
      design: 'illustrated',
      configuration: {
        source: f.source,
        numbering: 'automatic',
        colorMode: 'manual',
        items: [{ id: 'first', label: 'kept', target: { key: 'name' } }],
      },
      source: { status: 'published', assetType: 'card-treachery', assetId: f.assetId, revision },
    });
    expect(JSON.stringify(first)).not.toContain('Captured explanation');
    expect(JSON.stringify(first)).not.toContain('Captured caption');
    const draft = structuredClone(f.contents);
    const block = draft.pagesById.PAGE!.blocksById.BLC2!;
    if (block.kind !== 'asset-explainer') {
      throw new Error('Expected explainer');
    }
    block.itemsById.first!.label = 'draft only';
    await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 2,
      contents: draft,
    });
    expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity)).toEqual(first);
    await f.t.run(async (ctx) => {
      await ctx.db.patch('assets', f.assetId, { data: { name: 'Current source name' } });
    });
    expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity)).toMatchObject({
      source: { name: 'Current source name' },
    });
    await f.t.run(async (ctx) => {
      await ctx.db.patch('assets', f.assetId, { is_deleted: true });
    });
    expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity)).toMatchObject({
      source: { status: 'unavailable' },
      configuration: { items: [{ id: 'first', label: 'kept' }] },
    });
  });

  test('Rulebook and Ruleset deletion gate retained annotations, and missing identities do not fall back', async () => {
    const f = await fixture();
    await publish(f);
    for (const identity of [
      { ...f.identity, editionNumber: 1 },
      { ...f.identity, pageId: 'MISS' },
      { ...f.identity, blockId: 'MISS' },
      { ...f.identity, editionNumber: 2.5 },
    ]) {
      expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, identity)).toEqual({
        ok: true,
        status: 'missing',
      });
    }
    await f.t.run(async (ctx) => {
      await ctx.db.patch('rulebooks', f.created.rulebook._id, { is_deleted: true });
    });
    expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity)).toEqual({
      ok: true,
      status: 'missing',
    });
    await f.t.run(async (ctx) => {
      await ctx.db.patch('rulebooks', f.created.rulebook._id, { is_deleted: false });
      await ctx.db.patch('rulesets', f.ids.rulesetId, { is_deleted: true });
    });
    expect(await f.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, f.identity)).toEqual({
      ok: true,
      status: 'missing',
    });
  });

  test('stock and deck references resolve only maintained or live sources', async () => {
    const stock = await fixture();
    const block = stock.contents.pagesById.PAGE!.blocksById.BLC2!;
    if (block.kind !== 'asset-explainer') {
      throw new Error('Expected explainer');
    }
    block.source = { kind: 'stock', artworkId: '/vector/logo/atreides.svg' };
    block.itemsById.first!.target = { kind: 'position', x: 0.25, y: 0.75, source: block.source };
    await publish(stock);
    expect(await stock.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, stock.identity)).toMatchObject({
      source: { status: 'stock', artworkId: '/vector/logo/atreides.svg' },
    });
    const deck = await fixture();
    await deck.t.run(async (ctx) => {
      await ctx.db.patch('assets', deck.assetId, { type: 'deck' });
      await ctx.db.insert('publication_assets', {
        asset_type: 'deck',
        asset_id: deck.assetId,
        cache_token: revision,
        published_at: 1000,
      });
    });
    await publish(deck);
    expect(await deck.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, deck.identity)).toMatchObject({
      source: { status: 'image', assetType: 'deck', revision },
    });
    await deck.t.run(async (ctx) => {
      await ctx.db.patch('assets', deck.assetId, { is_deleted: true });
    });
    expect(await deck.t.query(internal.rulebookAnnotatedIllustration.resolveDelivery, deck.identity)).toMatchObject({
      source: { status: 'unavailable' },
    });
  });

  test('the backend boundary requires executor credentials and rejects arbitrary payloads and oversized bodies', async () => {
    const f = await fixture();
    await publish(f);
    const request = (body: unknown, secret?: string) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body),
    });
    const body = { schemaVersion: 1, ...f.identity };
    for (const secret of [undefined, 'activation-secret', 'wrong']) {
      expect((await f.t.fetch(endpoint, request(body, secret))).status).toBe(404);
    }
    const response = await f.t.fetch(endpoint, request(body, 'executor-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'found' });
    for (const invalid of [
      { ...body, pageId: '../x' },
      { ...body, editionNumber: 0 },
      { ...body, sourceUrl: 'https://evil.invalid' },
      { ...body, annotations: [] },
    ]) {
      expect((await f.t.fetch(endpoint, request(invalid, 'executor-secret'))).status).toBe(400);
    }
    expect(
      (await f.t.fetch(endpoint, request({ ...body, padding: 'x'.repeat(17_000) }, 'executor-secret'))).status
    ).toBe(413);
  });
});
