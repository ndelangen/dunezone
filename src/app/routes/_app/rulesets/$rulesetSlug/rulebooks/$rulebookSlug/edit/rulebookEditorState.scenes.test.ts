import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
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
          blockOrderByRegion: { content: ['BRDD', 'MVMT', 'CMPR'] },
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
            CMPR: { id: 'CMPR', kind: 'battle-comparison', examples: [example, example] },
          },
        },
      },
    }),
  };
}

describe('Illustrated scene reconciliation', () => {
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
