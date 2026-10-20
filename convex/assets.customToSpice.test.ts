/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { describe, expect, test, vi } from 'vite-plus/test';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { resolveRulebookReferences } from './lib/rulebookReferences';
import { rulebookFixture } from './rulebooks.test.fixture';

const sourceData = { ...publishingCustomCard, name: 'Discovery proof' };
const destination = {
  ...publishingSpiceCard,
  name: sourceData.name,
  text: '*Spice blow:* Take 6 spice.\n\n*Discovery:* Place a Hiereg token.',
};
async function fixture() {
  const world = await rulebookFixture();
  const { t, owner } = world;
  await t.run((ctx) =>
    ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: { 'card-custom': 4, 'card-spice': 4 },
      updated_at: 1,
    })
  );
  const card = await owner.mutation(api.assets.create, {
    type: 'card-custom',
    data: sourceData,
    group_id: world.ids.groupId,
  });
  return { ...world, card };
}

const jobs = (t: Awaited<ReturnType<typeof fixture>>['t'], id: string, type: string) =>
  t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', type).eq('asset_id', id))
      .take(10)
  );

describe('authenticated Custom to Spice conversion', () => {
  test('requires normal edit permission and rename permission only when the name changes', async () => {
    const { t, member, outsider, card, ids } = await fixture();
    await expect(t.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination })).rejects.toThrow();
    await expect(
      outsider.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination })
    ).rejects.toThrow('Not authorized');
    await expect(
      member.mutation(api.assets.convertCustomToSpice, { id: card.id, data: { ...destination, name: 'Renamed' } })
    ).rejects.toThrow('Not authorized');
    const converted = await member.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination });
    expect(converted).toEqual(card);
    expect(await t.run((ctx) => ctx.db.get(card.id))).toMatchObject({
      type: 'card-spice',
      owner_id: ids.ownerId,
      group_id: ids.groupId,
    });
  });

  test('rejects incomplete or unrecognised destination data, invalid sources and repeated conversions without partial writes', async () => {
    const { t, owner, card } = await fixture();
    const { amount: _amount, ...incomplete } = destination;
    for (const data of [incomplete, { ...destination, type: 'card-spice' }, { ...destination, layers: [] }]) {
      await expect(owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data })).rejects.toThrow();
    }
    expect(await t.run((ctx) => ctx.db.get(card.id))).toMatchObject({ type: 'card-custom', data: sourceData });
    await t.run((ctx) => ctx.db.patch(card.id, { data: { name: sourceData.name } }));
    await expect(owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination })).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(card.id, { data: sourceData, is_deleted: true }));
    await expect(owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination })).rejects.toThrow(
      'Only a live custom'
    );
    await t.run((ctx) => ctx.db.patch(card.id, { is_deleted: false }));
    await owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination });
    await expect(owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination })).rejects.toThrow(
      'Only a live custom'
    );
  });

  test('refuses live and deleted destination collisions explicitly, then preserves every former type address through later renames', async () => {
    const { t, owner, card } = await fixture();
    const other = await owner.mutation(api.assets.create, { type: 'card-spice', data: destination });
    for (const deleted of [false, true]) {
      if (deleted) {
        await owner.mutation(api.assets.softDelete, { id: other.id });
      }
      await expect(owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination })).rejects.toThrow(
        'already reserves'
      );
    }
    await owner.mutation(api.assets.update, { id: card.id, data: { ...sourceData, name: 'Old custom name' } });
    const converted = await owner.mutation(api.assets.convertCustomToSpice, {
      id: card.id,
      data: { ...destination, name: 'Native discovery' },
    });
    expect(converted.id).toBe(card.id);
    expect(converted.slug).toBe('native-discovery');
    await owner.mutation(api.assets.update, { id: card.id, data: { ...destination, name: 'Final discovery' } });
    for (const [type, slug] of [
      ['card-custom', card.slug],
      ['card-custom', 'old-custom-name'],
      ['card-spice', 'native-discovery'],
    ]) {
      expect(await t.query(api.formerAddresses.resolve, { address: { kind: 'asset', type, slug } })).toBe(
        '/assets/card-spice/final-discovery'
      );
    }
  });

  test('preserves identity and container quantities while replacing reverse dependencies and publication work', async () => {
    vi.useFakeTimers();
    try {
      const { t, owner, card, ids } = await fixture();
      const token = await owner.mutation(api.assets.create, {
        type: 'token-disc',
        data: { name: 'Marker', about: '', front: publishingTokenFace, back: { mode: 'same' } },
      });
      const board = await owner.mutation(api.assets.create, {
        type: 'board',
        data: { name: 'Arrakis', about: '', board: arrakisBoard() },
      });
      await owner.mutation(api.assets.update, {
        id: card.id,
        data: {
          ...sourceData,
          layers: [
            {
              kind: 'token',
              layerId: '20000000-2000-4000-8000-200000000004',
              asset_id: token.id,
              offset: [0, 0],
              scale: 1,
              opacity: 1,
              rotation: 0,
            },
          ],
        },
      });
      const deck = await owner.mutation(api.assets.create, {
        type: 'deck',
        data: { name: 'Discovery deck', about: '', cardback: { mode: 'preset', key: 'spice' } },
      });
      await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: card.id, count: 6 });
      await owner.mutation(api.rulesets.setAssetSlot, { ruleset_id: ids.rulesetId, asset_id: deck.id, slot: 'spice' });
      const slotsBefore = await t.run((ctx) =>
        ctx.db
          .query('ruleset_asset_slots')
          .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ids.rulesetId).eq('slot', 'spice'))
          .take(2)
      );
      const before = await t.run((ctx) => ctx.db.get(card.id));
      const [capturing] = await jobs(t, card.id, 'card-custom');
      await t.run(async (ctx) => {
        await ctx.db.patch(capturing._id, { status: 'in_progress', expires_at: Date.now() + 60_000 });
        await ctx.db.insert('publication_jobs', {
          asset_type: 'card-custom',
          asset_id: card.id,
          asset_data: capturing.asset_data,
          status: 'pending',
          attempt_counter: 0,
          created_at: 1,
          updated_at: 1,
        });
        await ctx.db.insert('publication_assets', {
          asset_type: 'card-custom',
          asset_id: card.id,
          cache_token: 'historical',
          published_at: 1,
        });
      });
      const data = {
        ...destination,
        board: {
          asset_id: board.id,
          look: { style: 'textured-burn', strength: 1 },
          typeToken: { asset_id: token.id },
          tokens: [
            {
              layerId: '20000000-2000-4000-8000-200000000004',
              asset_id: token.id,
              x: 100,
              y: 100,
              size: 40,
              rotation: 0,
            },
          ],
          tints: [],
        },
      };
      await owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data });
      const after = await t.run((ctx) => ctx.db.get(card.id));
      expect(after).toMatchObject({
        _id: before!._id,
        _creationTime: before!._creationTime,
        owner_id: ids.ownerId,
        group_id: ids.groupId,
        created_at: before!.created_at,
        type: 'card-spice',
        data,
      });
      const relations = await t.run((ctx) =>
        ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) => q.eq('from_asset_id', card.id))
          .take(10)
      );
      expect(relations.map((r) => [r.kind, r.to_asset_id]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual(
        [
          ['spice-card-board', board.id],
          ['spice-card-token', token.id],
        ].sort((a, b) => a[0].localeCompare(b[0]))
      );
      const page = await t.query(api.assets.page, { type: 'deck', slug: deck.slug });
      expect(page?.members).toHaveLength(1);
      expect(
        await t.run((ctx) =>
          ctx.db
            .query('ruleset_asset_slots')
            .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ids.rulesetId).eq('slot', 'spice'))
            .take(2)
        )
      ).toEqual(slotsBefore);
      expect(page?.members[0]).toMatchObject({ count: 6, member: { id: card.id, type: 'card-spice' } });
      expect(await jobs(t, card.id, 'card-custom')).toMatchObject([{ _id: capturing._id, status: 'in_progress' }]);
      const [queued] = await jobs(t, card.id, 'card-spice');
      expect(queued.asset_data).toMatchObject({
        assetId: card.id,
        card: data,
        tokens: { [token.id]: { face: publishingTokenFace } },
        board: { nodes: expect.any(Object) },
      });
      /* Finishing an already running old capture affects only its historic type's artifact. */
      await expect(
        t.mutation(internal.publicationJobs.completeJob, { jobId: capturing._id, cacheToken: 'finished-old' })
      ).resolves.toMatchObject({ status: 'completed' });
      expect(
        await t.run((ctx) =>
          ctx.db
            .query('publication_assets')
            .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', card.id))
            .unique()
        )
      ).toMatchObject({ cache_token: 'finished-old' });
      expect(await jobs(t, card.id, 'card-spice')).toMatchObject([{ _id: queued._id, status: 'pending' }]);
      await owner.mutation(api.assets.update, {
        id: token.id,
        data: { name: 'Marker', about: '', front: { ...publishingTokenFace, symbolScale: 2 }, back: { mode: 'same' } },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await jobs(t, card.id, 'card-spice'))[0].asset_data.tokens[token.id].face.symbolScale).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);

  test('validates every new board and token dependency before changing the source', async () => {
    const { t, owner, card } = await fixture();
    const token = await owner.mutation(api.assets.create, {
      type: 'token-disc',
      data: { name: 'Marker', about: '', front: publishingTokenFace, back: { mode: 'same' } },
    });
    await expect(
      owner.mutation(api.assets.convertCustomToSpice, {
        id: card.id,
        data: { ...destination, board: { asset_id: token.id, tokens: [], tints: [] } },
      })
    ).rejects.toThrow('available board');
    const board = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis', about: '', board: arrakisBoard() },
    });
    await expect(
      owner.mutation(api.assets.convertCustomToSpice, {
        id: card.id,
        data: {
          ...destination,
          board: { asset_id: board.id, typeToken: { asset_id: card.id }, tokens: [], tints: [] },
        },
      })
    ).rejects.toThrow('available token');
    expect(await t.run((ctx) => ctx.db.get(card.id))).toMatchObject({ type: 'card-custom' });
  }, 30_000);

  test('a published Rulebook reference follows the same asset ID and uses its current type and publication', async () => {
    const { t, owner, ids, card } = await fixture();
    const book = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Discovery book',
      source: { kind: 'starter' },
    });
    const contents = structuredClone(book.draft.contents);
    const page = contents.pagesById.RULE;
    page.blocksById.CARD = {
      id: 'CARD',
      kind: 'referenced-illustration',
      source: { kind: 'asset', assetId: card.id },
      caption: 'Discovery card',
    };
    page.blockOrderByRegion.content.push('CARD');
    await owner.mutation(api.rulebooks.save, { rulebook_id: book.rulebook._id, expected_revision: 1, contents });
    await owner.mutation(api.rulebooks.publish, {
      rulebook_id: book.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });
    await owner.mutation(api.assets.convertCustomToSpice, { id: card.id, data: destination });
    await t.run((ctx) =>
      ctx.db.insert('publication_assets', {
        asset_type: 'card-spice',
        asset_id: card.id,
        cache_token: 'native',
        published_at: 2,
      })
    );
    const resolved = await t.run((ctx) => resolveRulebookReferences(ctx, contents, { assetIds: [card.id] }));
    expect(resolved.assetsById[card.id]).toMatchObject({
      assetId: card.id,
      type: 'card-spice',
      imageUrl: publishedHref('card-spice', card.id, 'native'),
    });
    const reader = await t.query(api.rulebooks.readerPage, {
      ruleset_slug: 'rulebook-test-rules',
      rulebook_slug: book.rulebook.slug,
    });
    expect(reader?.assetsById[card.id]).toMatchObject({
      assetId: card.id,
      type: 'card-spice',
      imageUrl: publishedHref('card-spice', card.id, 'native'),
    });
  });
});
