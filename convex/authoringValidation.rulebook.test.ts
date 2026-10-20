// @vitest-environment edge-runtime
import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { RULEBOOK_BOARD_DEFINITIONS } from '../src/shared/rulebooks/boardDefinitions';
import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const absentTroop = '99999999-9999-4999-8999-999999999999';
const troopId = assetPublishingFaction.troops[0].troopId!;
const side = (factionId?: string, troops: unknown[] = []) => ({
  factionId,
  role: '',
  revealed: true,
  dial: 0,
  spice: 0,
  cards: [],
  troops,
});
const selection = (factionId?: string, id: string | undefined = troopId, face = 'front') => ({
  factionId,
  troopId: id,
  face,
});
const board = (factionId?: string, id = troopId, face = 'front') => ({
  boardId: RULEBOOK_BOARD_DEFINITIONS[0].id,
  caption: '',
  players: [],
  highlights: [],
  annotations: [],
  troops: [
    { id: 'troops', ...selection(factionId, id, face), count: 1, x: 0.5, y: 0.5, columns: 1, size: 0.1, gap: 0 },
  ],
});
const movement = (kind: 'piece-movement' | 'piece-transfer', factionId?: string, id = troopId, face = 'front') => ({
  id: 'TEST',
  kind,
  ...(kind === 'piece-movement' ? { step: '', title: '', caption: '' } : {}),
  left: { label: '', pieces: [{ id: 'troops', kind: 'troops', ...selection(factionId, id, face), count: 1 }] },
  right: { label: '', pieces: [] },
});
const battle = (factionId?: string, id = troopId, face = 'front') => ({
  step: '',
  title: '',
  caption: '',
  left: side(factionId, [{ id: 'troops', troopId: id, face, supported: 1, unsupported: 0, uncommitted: 0 }]),
  right: side(),
});

async function fixture() {
  const f = await rulebookFixture();
  const created = await f.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: f.ids.rulesetId,
    name: 'Raw destination',
    source: { kind: 'starter' },
  });
  const rows = await f.t.run(async (ctx) => {
    const common = {
      owner_id: f.ids.ownerId,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-20',
      updated_at: '2026-10-20',
    };
    const factionId = await ctx.db.insert('factions', { ...common, slug: 'first', data: assetPublishingFaction });
    const other = structuredClone(assetPublishingFaction);
    other.troops[0].troopId = absentTroop;
    other.factionLeader.memberId = absentTroop;
    const otherFactionId = await ctx.db.insert('factions', { ...common, slug: 'other', data: other });
    const deckId = await ctx.db.insert('assets', { ...common, type: 'deck', slug: 'deck', data: {} });
    const tokenId = await ctx.db.insert('assets', { ...common, type: 'token-disc', slug: 'token', data: {} });
    const bundleId = await ctx.db.insert('assets', { ...common, type: 'bundle', slug: 'bundle', data: {} });
    return { factionId, otherFactionId, deckId, tokenId, bundleId };
  });
  const check = (contents: RulebookContentsV1, size = 'a4') =>
    f.owner.query(api.authoringValidation.raw, {
      kind: 'rulebook',
      targetId: created.rulebook._id,
      text: JSON.stringify({ settings: { size, design: 'illustrated' }, contents }),
    });
  const withBlock = (value: unknown) => {
    const contents = structuredClone(created.draft.contents);
    contents.pagesById.RULE.blocksById = { TEST: value as never };
    contents.pagesById.RULE.blockOrderByRegion = { content: ['TEST'] };
    return rulebookContentsV1Schema.parse(contents);
  };
  return { ...f, created, rows, check, withBlock };
}

describe('raw Rulebook destination compatibility', () => {
  test('requires the real editable destination and leaves its saved pair unchanged', async () => {
    const f = await fixture();
    const text = JSON.stringify({ settings: f.created.draft.settings, contents: f.created.draft.contents });
    await expect(f.owner.query(api.authoringValidation.raw, { kind: 'rulebook', text })).rejects.toThrow('destination');
    await expect(
      f.outsider.query(api.authoringValidation.raw, { kind: 'rulebook', targetId: f.created.rulebook._id, text })
    ).rejects.toThrow('Not authorized');
    await expect(f.check(f.created.draft.contents)).resolves.toBeNull();
    await f.t.run(async (ctx) => {
      expect(await ctx.db.get('rulebook_drafts', f.created.draft._id)).toEqual(
        expect.objectContaining({ revision: 1, contents: f.created.draft.contents })
      );
      expect(await ctx.db.query('user_image_ingest_tokens').collect()).toEqual([]);
    });
  });

  test('refuses an unsupported new Page and a size change incompatible with surviving Pages', async () => {
    const f = await fixture();
    const next = structuredClone(f.created.draft.contents);
    next.pagesById.NEWW = {
      ...next.pagesById.RULE,
      id: 'NEWW',
      anchor: 'new',
      layoutId: 'sequence',
      blocksById: {},
      blockOrderByRegion: { content: [] },
    } as never;
    next.pageOrder.push('NEWW');
    await expect(f.check(rulebookContentsV1Schema.parse(next), 'gf9-expansion')).rejects.toThrow('supported');
    await f.t.run((ctx) =>
      ctx.db.patch('rulebook_drafts', f.created.draft._id, {
        contents: {
          ...f.created.draft.contents,
          pagesById: {
            RULE: {
              ...f.created.draft.contents.pagesById.RULE,
              layoutId: 'two-columns',
              blockOrderByRegion: {
                column1: f.created.draft.contents.pagesById.RULE.blockOrderByRegion.content,
                column2: [],
              },
            },
          },
        },
      })
    );
    const stored = await f.t.run((ctx) => ctx.db.get('rulebook_drafts', f.created.draft._id));
    await expect(f.check(rulebookContentsV1Schema.parse(stored!.contents), 'gf9-expansion')).rejects.toThrow(
      'supported'
    );
  });

  test('refuses surviving layout changes and Blocks moved with their old Page-owned ID', async () => {
    const f = await fixture();
    const next = structuredClone(f.created.draft.contents);
    next.pagesById.RULE.layoutId = 'content-strip' as never;
    next.pagesById.RULE.blockOrderByRegion = {
      content: next.pagesById.RULE.blockOrderByRegion.content,
      strip: [],
    } as never;
    await expect(f.check(rulebookContentsV1Schema.parse(next))).rejects.toThrow('fixed');
    const moved = structuredClone(f.created.draft.contents);
    moved.pagesById.NEWW = { ...structuredClone(moved.pagesById.RULE), id: 'NEWW', anchor: 'new' };
    moved.pageOrder.push('NEWW');
    moved.pagesById.RULE.blocksById = {};
    moved.pagesById.RULE.blockOrderByRegion = { content: [] };
    await expect(f.check(moved)).rejects.toThrow('new ID');
  });

  test('preserves Save grandfathering when the existing unsupported layout and size do not change', async () => {
    const f = await fixture();
    const next = structuredClone(f.created.draft.contents);
    next.pagesById.RULE.layoutId = 'sequence' as never;
    await f.t.run(async (ctx) => {
      await ctx.db.patch('rulebooks', f.created.rulebook._id, {
        settings: { size: 'gf9-expansion', design: 'illustrated' },
      });
      await ctx.db.patch('rulebook_drafts', f.created.draft._id, { contents: next });
    });
    await expect(f.check(next, 'gf9-expansion')).resolves.toBeNull();
  });
});

describe('raw Rulebook typed reference slots', () => {
  const slots = [
    [
      'board scene',
      (id: string, troop: string, face: string) => ({ id: 'TEST', kind: 'board-scene', ...board(id, troop, face) }),
    ],
    [
      'nested movement board',
      (id: string, troop: string, face: string) => ({
        ...movement('piece-movement'),
        left: { label: '', pieces: [] },
        board: board(id, troop, face),
      }),
    ],
    ['movement', (id: string, troop: string, face: string) => movement('piece-movement', id, troop, face)],
    ['transfer', (id: string, troop: string, face: string) => movement('piece-transfer', id, troop, face)],
    [
      'battle step',
      (id: string, troop: string, face: string) => ({ id: 'TEST', kind: 'battle-step', ...battle(id, troop, face) }),
    ],
    [
      'battle plans',
      (id: string, troop: string, face: string) => ({
        id: 'TEST',
        kind: 'battle-plans',
        left: battle(id, troop, face).left,
        right: side(),
      }),
    ],
    [
      'battle comparison',
      (id: string, troop: string, face: string) => ({
        id: 'TEST',
        kind: 'battle-comparison',
        examples: [battle(id, troop, face), { ...battle(), left: side() }],
      }),
    ],
    [
      'illustration',
      (id: string, troop: string, face: string) => ({
        id: 'TEST',
        kind: 'referenced-illustration',
        caption: '',
        source: { kind: 'faction-troop', factionId: id, troopId: troop, face },
      }),
    ],
  ] as const;
  test.each(slots)(
    '%s validates the selected troop, owning faction and requested face before Load',
    async (_, block) => {
      const f = await fixture();
      await expect(f.check(f.withBlock(block(f.rows.factionId, troopId, 'front')))).resolves.toBeNull();
      await expect(f.check(f.withBlock(block(f.rows.factionId, absentTroop, 'front')))).rejects.toThrow(
        /TEST.*troopId/
      );
      await expect(f.check(f.withBlock(block(f.rows.otherFactionId, troopId, 'front')))).rejects.toThrow(
        /TEST.*troopId/
      );
      await expect(f.check(f.withBlock(block(f.rows.factionId, troopId, 'back')))).rejects.toThrow(/TEST.*face/);
      await f.t.run(async (ctx) => {
        const data = structuredClone(assetPublishingFaction);
        data.troops[0].back = { name: 'Back troop', description: '', image: data.troops[0].image };
        await ctx.db.patch('factions', f.rows.factionId, { data });
      });
      await expect(f.check(f.withBlock(block(f.rows.factionId, troopId, 'back')))).resolves.toBeNull();
    }
  );

  test('preserves optional unselected troops but refuses a selected troop without its containing faction', async () => {
    const f = await fixture();
    const empty = board();
    Reflect.deleteProperty(empty.troops[0], 'troopId');
    await expect(f.check(f.withBlock({ id: 'TEST', kind: 'board-scene', ...empty }))).resolves.toBeNull();
    await expect(f.check(f.withBlock({ id: 'TEST', kind: 'battle-step', ...battle(undefined) }))).rejects.toThrow(
      /left.factionId/
    );
  });

  test('checks board, token, Card and generic image Asset roles at their input paths', async () => {
    const f = await fixture();
    const scene = {
      id: 'TEST',
      kind: 'board-scene',
      ...board(),
      troops: [],
      tokens: [{ layerId: 'token', asset_id: f.rows.deckId, x: 10, y: 10, size: 20, rotation: 0 }],
    };
    await expect(f.check(f.withBlock(scene))).rejects.toThrow(/TEST.tokens.0.asset_id/);
    scene.tokens[0].asset_id = f.rows.tokenId;
    await expect(f.check(f.withBlock(scene))).resolves.toBeNull();
    scene.boardId = f.rows.deckId;
    await expect(f.check(f.withBlock(scene))).rejects.toThrow(/TEST.boardId/);
    await expect(
      f.check(
        f.withBlock({
          id: 'TEST',
          kind: 'card-group',
          title: '',
          text: '',
          variant: 'gallery',
          itemOrder: ['card'],
          itemsById: { card: { id: 'card', text: '', source: { kind: 'asset', assetId: f.rows.deckId } } },
        })
      )
    ).rejects.toThrow(/itemsById.card.source/);
    await expect(
      f.check(
        f.withBlock({
          id: 'TEST',
          kind: 'battle-step',
          ...battle(),
          left: { ...side(), cards: [{ kind: 'asset', assetId: f.rows.deckId }] },
        })
      )
    ).rejects.toThrow(/left.cards.0/);
    await expect(
      f.check(
        f.withBlock({
          id: 'TEST',
          kind: 'referenced-illustration',
          caption: '',
          source: { kind: 'asset', assetId: f.rows.bundleId },
        })
      )
    ).rejects.toThrow(/TEST.source/);
  });

  test('checks faction members against their selected faction, plus maintained artwork and deleted rows', async () => {
    const f = await fixture();
    const block = {
      id: 'TEST',
      kind: 'referenced-illustration',
      caption: '',
      source: {
        kind: 'faction-member',
        factionId: f.rows.factionId,
        memberId: assetPublishingFaction.factionLeader.memberId,
      },
    };
    await expect(f.check(f.withBlock(block))).resolves.toBeNull();
    block.source.factionId = f.rows.otherFactionId;
    await expect(f.check(f.withBlock(block))).rejects.toThrow(/TEST.source.memberId/);
    block.source.factionId = f.rows.factionId;
    block.source.memberId = absentTroop;
    await expect(f.check(f.withBlock(block))).rejects.toThrow(/TEST.source.memberId/);
    await expect(
      f.check(f.withBlock({ ...block, source: { kind: 'stock', artworkId: '/missing.svg' } }))
    ).rejects.toThrow(/artworkId/);
    await f.t.run((ctx) => ctx.db.patch('factions', f.rows.factionId, { is_deleted: true }));
    block.source.memberId = assetPublishingFaction.factionLeader.memberId;
    await expect(f.check(f.withBlock(block))).rejects.toThrow(/source.factionId/);
  });
});
