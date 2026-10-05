import { describe, expect, test } from 'vitest';

import { rulebookContentsV1Schema, rulebookDraftEntitySchemas, rulebookEditionContentsV1Schema } from './contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1 } from './contents';
import { rulebookBoardSceneSchema, rulebookBattleComparisonSchema } from './illustratedScenes';
import { projectRulebookDraftRenderBlock, projectRulebookRenderDocument } from './projectRenderDocument';
import { collectRulebookReferenceIds } from './references';
import { rulebookRenderDocumentV1Schema } from './renderDocument';

const board = {
  boardId: 'arrakis',
  size: 'fit-width' as const,
  routes: [
    {
      id: 'PATH',
      label: 'Two steps',
      direction: 'forward' as const,
      waypoints: [
        { territory: 'tueks' },
        { territory: 'pasty-mesa', position: { x: 0.8, y: 0.5 } },
        { territory: 'shield-wall' },
      ],
      blockedAfter: 1,
    },
  ],
  caption: 'Shared territory',
  viewport: { x: -0.03, y: -0.03, width: 1.06, height: 1.06 },
  storm: { angle: 45 },
  players: [{ id: 'first', factionId: 'left', angle: 60 }],
  troops: [
    {
      id: 'troops',
      factionId: 'right',
      troopId: '10000000-1000-4000-8000-100000000001',
      face: 'front' as const,
      count: 4,
      x: 0.5,
      y: 0.5,
      columns: 2,
      size: 0.03,
      gap: 0.01,
    },
  ],
  highlights: [{ territory: 'hagga-basin', color: '#abcdef', opacity: 0.3 }],
  annotations: [
    { id: 'order', title: 'Battle order', text: 'Choose the next battle.', x: 0.1, y: 0.2, targetX: 0.5, targetY: 0.5 },
  ],
};
const example = {
  step: '',
  title: 'Tie',
  caption: 'The aggressor wins.',
  left: {
    factionId: 'left',
    role: 'Aggressor',
    revealed: false,
    dial: 2,
    spice: 1,
    cards: [{ kind: 'asset' as const, assetId: 'weapon' }],
    troops: [],
  },
  right: { factionId: 'right', role: 'Defender', revealed: false, dial: 2, spice: 1, cards: [], troops: [] },
};
function blocks(): RulebookBlockDraft[] {
  return [
    { id: 'BRDD', kind: 'board-scene', ...board },
    {
      id: 'MVMT',
      kind: 'piece-movement',
      step: '11',
      title: 'Discard cards',
      caption: 'Return discarded cards.',
      direction: 'right',
      left: {
        label: 'Played cards',
        pieces: [{ id: 'weapon', kind: 'source', source: { kind: 'asset', assetId: 'weapon' }, count: 1 }],
      },
      right: {
        label: 'The Tanks',
        pieces: [{ id: 'troops', kind: 'troops', factionId: 'right', face: 'front', count: 4 }],
      },
      notes: [{ id: 'reward', label: 'Spice gained', source: { kind: 'asset', assetId: 'spice' }, count: 6 }],
      board,
    },
    {
      id: 'XFER',
      kind: 'piece-transfer',
      direction: 'exchange',
      left: {
        label: 'Supply',
        pieces: [{ id: 'CARD', kind: 'source', source: { kind: 'asset', assetId: 'transfer-card' }, count: 1 }],
      },
      right: {
        label: 'Player',
        pieces: [{ id: 'UNIT', kind: 'troops', factionId: 'transfer-faction', face: 'front', count: 2 }],
      },
    },
    { id: 'CMPR', kind: 'battle-comparison', examples: [example, structuredClone(example)] },
  ];
}
function contents(): RulebookContentsDraftV1 {
  return {
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'battle',
        title: 'Battle',
        layoutId: 'sequence',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: blocks().map(({ id }) => id) },
        blocksById: Object.fromEntries(blocks().map((block) => [block.id, block])),
      },
    },
  };
}

describe('Rulebook illustrated scenes', () => {
  test('each scene survives saved, draft, edition and rendered forms with all nested references', () => {
    const value = contents();
    expect(rulebookContentsV1Schema.parse(value)).toEqual(value);
    expect(rulebookEditionContentsV1Schema.parse(value)).toEqual(value);
    expect(rulebookDraftEntitySchemas.page.parse(value.pagesById.PAGE)).toEqual(value.pagesById.PAGE);
    const rendered = projectRulebookRenderDocument(value, {}, { size: 'square', design: 'illustrated' });
    expect(rulebookRenderDocumentV1Schema.parse(rendered)).toEqual(rendered);
    expect(collectRulebookReferenceIds(value)).toEqual({
      assetIds: ['spice', 'transfer-card', 'weapon'],
      factionIds: ['left', 'right', 'transfer-faction'],
    });
    expect(rendered.pagesById.PAGE!.regions[0]!.blocks[0]).toMatchObject({
      kind: 'board-scene',
      routes: board.routes,
      size: 'fit-width',
      board: { status: 'ready', reference: { kind: 'board', boardId: 'arrakis' } },
      players: [{ faction: { status: 'unavailable', factionId: 'left' } }],
      troops: [{ count: 4, faction: { status: 'unavailable', factionId: 'right' } }],
    });
    expect(rendered.pagesById.PAGE!.regions[0]!.blocks[1]).toMatchObject({
      kind: 'piece-movement',
      left: { pieces: [{ source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'weapon' } } }] },
      right: { pieces: [{ count: 4, faction: { status: 'unavailable', factionId: 'right' } }] },
      notes: [{ count: 6, source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'spice' } } }],
      board: { board: { status: 'ready' } },
    });
  });

  test('routes reject out-of-board positions and non-existent segments', () => {
    const route = board.routes[0]!;
    expect(rulebookBoardSceneSchema.safeParse({ ...board, routes: [{ ...route, blockedAfter: 2 }] }).success).toBe(
      false
    );
    expect(
      rulebookBoardSceneSchema.safeParse({ ...board, routes: [{ ...route, waypoints: [{ territory: 'tueks' }] }] })
        .success
    ).toBe(false);
    expect(
      rulebookBoardSceneSchema.safeParse({
        ...board,
        routes: [
          { ...route, waypoints: [{ territory: 'tueks', position: { x: -0.1, y: 0.5 } }, { territory: 'pasty-mesa' }] },
        ],
      }).success
    ).toBe(false);
    expect(rulebookBoardSceneSchema.safeParse({ ...board, routes: [route, route] }).success).toBe(false);
  });

  test('missing boards and empty selections remain explicit without losing authored explanations', () => {
    const missing = projectRulebookDraftRenderBlock(
      { id: 'BRDD', kind: 'board-scene', ...board, boardId: 'retired-board' },
      {}
    );
    expect(missing).toMatchObject({
      board: { status: 'unavailable', reference: { kind: 'board', boardId: 'retired-board' } },
      caption: board.caption,
    });
    const blank = projectRulebookDraftRenderBlock(
      {
        id: 'MVMT',
        kind: 'piece-movement',
        step: '',
        title: '',
        caption: '',
        left: { label: '', pieces: [{ id: 'pick', kind: 'source', count: 1 }] },
        right: { label: '', pieces: [{ id: 'pick', kind: 'troops', face: 'front', count: 1 }] },
      },
      {}
    );
    expect(blank).toMatchObject({
      left: { pieces: [{ source: { status: 'unselected' } }] },
      right: { pieces: [{ faction: { status: 'unselected' }, count: 1 }] },
    });
  });

  test('bounds positions, crop padding, troop counts and connector pairs', () => {
    expect(rulebookBoardSceneSchema.safeParse(board).success).toBe(true);
    expect(
      rulebookBoardSceneSchema.safeParse({ ...board, viewport: { x: -2, y: 0, width: 1, height: 1 } }).success
    ).toBe(false);
    expect(rulebookBoardSceneSchema.safeParse({ ...board, troops: [{ ...board.troops[0], count: 1.5 }] }).success).toBe(
      false
    );
    expect(rulebookBoardSceneSchema.safeParse({ ...board, troops: [{ ...board.troops[0], x: 1.1 }] }).success).toBe(
      false
    );
    expect(
      rulebookBoardSceneSchema.safeParse({ ...board, annotations: [{ ...board.annotations[0], targetY: undefined }] })
        .success
    ).toBe(false);
    expect(
      rulebookBoardSceneSchema.safeParse({ ...board, players: [...board.players, ...board.players] }).success
    ).toBe(false);
    expect(rulebookBattleComparisonSchema.safeParse({ examples: [example] }).success).toBe(false);
    expect(rulebookBattleComparisonSchema.safeParse({ examples: [example, example, example] }).success).toBe(false);
  });
});
