import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager, rulebookFieldResolution } from './rulebookEditorState';
import { draftBlock, replaceDraft } from './rulebookEditorState.fixtures';

function initialRevision() {
  const side = { role: '', revealed: false, dial: 0, spice: 0, cards: [], troops: [] };
  const example = { step: '', title: '', caption: '', left: side, right: side };
  return {
    revision: 'revision-1',
    contents: rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['SCNE'],
      pagesById: {
        SCNE: {
          id: 'SCNE',
          anchor: 'scenes',
          title: 'Illustrations',
          layoutId: 'sequence',
          controlValues: {},
          blockOrderByRegion: { content: ['BRDD', 'MVMT', 'CMPR', 'BTLE', 'XFER'] },
          blocksById: {
            BRDD: {
              id: 'BRDD',
              kind: 'board-scene',
              boardId: 'arrakis',
              caption: '',
              players: [],
              troops: [],
              highlights: [],
              annotations: [],
            },
            MVMT: {
              id: 'MVMT',
              kind: 'piece-movement',
              step: '10',
              title: 'Move pieces',
              caption: '',
              left: { label: 'Winner', pieces: [] },
              right: { label: 'Loser', pieces: [] },
            },
            XFER: {
              id: 'XFER',
              kind: 'piece-transfer',
              left: { label: 'Reserves', pieces: [] },
              right: { label: 'Board', pieces: [] },
            },
            CMPR: { id: 'CMPR', kind: 'battle-comparison', examples: [example, example] },
            BTLE: { id: 'BTLE', kind: 'battle-step', ...example },
          },
        },
      },
    }),
  };
}

describe('Illustrated scene reconciliation', () => {
  it('retains route and transfer edits when another editor changes the caption and destination', () => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        const board = draftBlock(draft, 'SCNE', 'BRDD', 'board-scene');
        board.size = 'fit-width';
        board.routes = [
          {
            id: 'PATH',
            label: 'One step',
            direction: 'forward',
            waypoints: [{ territory: 'tueks' }, { territory: 'pasty-mesa' }],
          },
        ];
        const transfer = draftBlock(draft, 'SCNE', 'XFER', 'piece-transfer');
        transfer.direction = 'right';
        transfer.left.pieces = [{ id: 'UNIT', kind: 'troops', factionId: 'atreides', face: 'front', count: 3 }];
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    draftBlock(latest.contents, 'SCNE', 'BRDD', 'board-scene').caption = 'A route';
    draftBlock(latest.contents, 'SCNE', 'XFER', 'piece-transfer').right.label = 'Arrakeen';
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    if (result.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(result.canSave).toBe(true);
    expect(result.incompatibilities).toEqual([]);
    expect(result.saveCandidate?.pagesById.SCNE?.blocksById.BRDD).toMatchObject({
      size: 'fit-width',
      caption: 'A route',
      routes: [{ id: 'PATH', label: 'One step' }],
    });
    expect(result.saveCandidate?.pagesById.SCNE?.blocksById.XFER).toMatchObject({
      direction: 'right',
      left: { pieces: [{ count: 3 }] },
      right: { label: 'Arrakeen' },
    });
  });

  it('merges board markers and annotations independently and retains the crop', () => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        const board = draftBlock(draft, 'SCNE', 'BRDD', 'board-scene');
        board.players = [{ id: 'PLAYER', factionId: 'atreides', angle: 45 }];
        board.viewport = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    draftBlock(latest.contents, 'SCNE', 'BRDD', 'board-scene').annotations = [
      { id: 'NOTE', title: 'Shared territory', text: 'Both factions are here.', x: 0.5, y: 0.5 },
    ];
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    if (result.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(result.saveCandidate?.pagesById.SCNE?.blocksById.BRDD).toMatchObject({
      players: [{ factionId: 'atreides', angle: 45 }],
      annotations: [{ title: 'Shared territory' }],
      viewport: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    });
  });

  it('keeps movement pieces, notes, and the opposite group from concurrent edits', () => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        const movement = draftBlock(draft, 'SCNE', 'MVMT', 'piece-movement');
        movement.left.pieces = [
          { id: 'CARD', kind: 'source', source: { kind: 'asset', assetId: 'snooper' }, count: 1 },
        ];
        movement.notes = [{ id: 'NOTE', label: 'Discard both cards.', count: 1 }];
        movement.direction = 'right';
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    draftBlock(latest.contents, 'SCNE', 'MVMT', 'piece-movement').right.label = 'Discard pile';
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    if (result.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(result.incompatibilities).toEqual([]);
    expect(result.saveCandidate?.pagesById.SCNE?.blocksById.MVMT).toMatchObject({
      direction: 'right',
      left: { pieces: [{ source: { assetId: 'snooper' } }] },
      right: { label: 'Discard pile' },
      notes: [{ label: 'Discard both cards.' }],
    });
  });

  it('merges separate comparison examples and detects competing changes to one example', () => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        draftBlock(draft, 'SCNE', 'CMPR', 'battle-comparison').examples[0].title = 'Supported forces';
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    draftBlock(latest.contents, 'SCNE', 'CMPR', 'battle-comparison').examples[1].title = 'Unsupported forces';
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    if (result.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(result.incompatibilities).toEqual([]);
    expect(result.saveCandidate?.pagesById.SCNE?.blocksById.CMPR).toMatchObject({
      examples: [{ title: 'Supported forces' }, { title: 'Unsupported forces' }],
    });
    const competing = structuredClone(latest);
    competing.revision = 'revision-3';
    draftBlock(competing.contents, 'SCNE', 'CMPR', 'battle-comparison').examples[0].title = 'Another title';
    const conflict = manager.dispatch({ kind: 'receive-latest', latest: competing });
    if (conflict.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(conflict.incompatibilities).toMatchObject([{ kind: 'field', field: 'comparison-first' }]);
  });
});

const structuredChoices: Array<{
  name: string;
  change: (draft: RulebookContentsDraftV1, version: number) => void;
}> = [
  {
    name: 'battle plan',
    change: (draft, version) => {
      draftBlock(draft, 'SCNE', 'BTLE', 'battle-step').left.dial = version;
    },
  },
  {
    name: 'comparison example',
    change: (draft, version) => {
      draftBlock(draft, 'SCNE', 'CMPR', 'battle-comparison').examples[0].title = `Example ${version}`;
    },
  },
  {
    name: 'player markers',
    change: (draft, version) => {
      draftBlock(draft, 'SCNE', 'BRDD', 'board-scene').players = [{ id: 'PLYR', angle: version * 45 }];
    },
  },
  {
    name: 'optional board crop',
    change: (draft, version) => {
      draftBlock(draft, 'SCNE', 'BRDD', 'board-scene').viewport = {
        x: version / 10,
        y: 0,
        width: 0.5,
        height: 0.5,
      };
    },
  },
  {
    name: 'optional storm',
    change: (draft, version) => {
      draftBlock(draft, 'SCNE', 'BRDD', 'board-scene').storm = { angle: version * 45 };
    },
  },
  {
    name: 'optional aftermath board',
    change: (draft, version) => {
      const { id: _id, kind: _kind, ...board } = draftBlock(draft, 'SCNE', 'BRDD', 'board-scene');
      draftBlock(draft, 'SCNE', 'MVMT', 'piece-movement').board = {
        ...board,
        caption: `Aftermath ${version}`,
      };
    },
  },
  {
    name: 'optional movement notes',
    change: (draft, version) => {
      draftBlock(draft, 'SCNE', 'MVMT', 'piece-movement').notes = [{ id: 'NOTE', label: 'Spice', count: version }];
    },
  },
];

describe.each(['local', 'saved'] as const)('Structured conflict choices: keep %s', (choice) => {
  it.each(structuredChoices)('retains the chosen $name through the review action', ({ change }) => {
    const initial = initialRevision();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        change(draft, 1);
        draft.pagesById.SCNE!.title = 'Revised illustrations';
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    change(latest.contents, 2);
    const review = manager.dispatch({ kind: 'receive-latest', latest });
    if (review.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(review.incompatibilities).toHaveLength(1);
    const conflict = review.incompatibilities[0];
    if (conflict?.kind !== 'field') {
      throw new Error('Expected field conflict');
    }
    const result = manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: rulebookFieldResolution(conflict, choice === 'local' ? conflict.localValue : conflict.latestValue),
      },
    });
    if (result.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    const expected = structuredClone(initial.contents);
    change(expected, choice === 'local' ? 1 : 2);
    expected.pagesById.SCNE!.title = 'Revised illustrations';
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(result.saveCandidate).toEqual(expected);
  });

  it('can choose either clearing or retaining an optional scene', () => {
    const initial = initialRevision();
    structuredChoices.find((entry) => entry.name === 'optional aftermath board')!.change(initial.contents, 0);
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch(
      replaceDraft(manager.result, (draft) => {
        delete draftBlock(draft, 'SCNE', 'MVMT', 'piece-movement').board;
        draft.pagesById.SCNE!.title = 'Revised illustrations';
      })
    );
    const latest = structuredClone(initial);
    latest.revision = 'revision-2';
    draftBlock(latest.contents, 'SCNE', 'MVMT', 'piece-movement').board!.caption = 'New aftermath';
    const review = manager.dispatch({ kind: 'receive-latest', latest });
    if (review.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    const conflict = review.incompatibilities[0];
    if (conflict?.kind !== 'field') {
      throw new Error('Expected field conflict');
    }
    const result = manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: rulebookFieldResolution(conflict, choice === 'local' ? conflict.localValue : conflict.latestValue),
      },
    });
    if (result.status !== 'ready') {
      throw new Error('Expected ready editor');
    }
    expect(result.canSave).toBe(true);
    expect(result.incompatibilities).toEqual([]);
    expect(draftBlock(result.saveCandidate!, 'SCNE', 'MVMT', 'piece-movement').board).toEqual(
      choice === 'local' ? undefined : draftBlock(latest.contents, 'SCNE', 'MVMT', 'piece-movement').board
    );
  });
});
