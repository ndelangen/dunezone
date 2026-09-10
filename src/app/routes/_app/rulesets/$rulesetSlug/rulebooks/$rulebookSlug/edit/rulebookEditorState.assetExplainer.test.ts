import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { collectRulebookReferenceIds } from '@shared/rulebooks/references';
import { describe, expect, test } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import { createCleanRulebookEditorInput } from './rulebookEditorState.fixtures';

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error('Expected ready editor');
  }
  return result;
}
function explainer(contents: RulebookContentsDraftV1) {
  const block = contents.pagesById.PAGE!.blocksById.EXPL!;
  if (block.kind !== 'asset-explainer') {
    throw new Error('Expected AssetExplainer');
  }
  return block;
}
function input() {
  const clean = createCleanRulebookEditorInput();
  const source = { kind: 'asset', assetId: 'token' } as const;
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'anatomy',
        title: 'Anatomy',
        layoutId: 'single-column',
        controlValues: {},
        blockOrderByRegion: { content: ['EXPL'] },
        blocksById: {
          EXPL: {
            id: 'EXPL',
            kind: 'asset-explainer',
            caption: 'A component.',
            numbering: 'automatic',
            colorMode: 'automatic',
            source,
            itemOrder: ['first', 'second'],
            itemsById: {
              first: {
                id: 'first',
                label: 'A',
                color: '#ffffff',
                text: 'A named part.',
                target: { kind: 'named', key: 'symbol', source },
              },
              second: {
                id: 'second',
                label: '★',
                text: 'A positioned part.',
                target: { kind: 'position', x: 0.3, y: 0.7, source },
              },
            },
          },
        },
      },
    },
  });
  return {
    ...clean,
    baseline: { ...clean.baseline, contents },
    latest: { ...clean.latest, contents: structuredClone(contents) },
  };
}
const blockTarget = { kind: 'block', pageId: 'PAGE', blockId: 'EXPL' } as const;
const itemTarget = { kind: 'item', pageId: 'PAGE', blockId: 'EXPL', itemId: 'first' } as const;

describe('AssetExplainer draft reconciliation', () => {
  test('reconciles order, marker settings and targets with another author changing explanation text', () => {
    const initial = input(),
      manager = createRulebookEditorStateManager(initial);
    const draft = structuredClone(ready(manager.result).draft),
      block = explainer(draft);
    block.itemOrder.reverse();
    block.colorMode = 'manual';
    block.numbering = 'custom';
    block.itemsById.first!.label = 'B';
    block.itemsById.first!.color = '#254978';
    block.itemsById.first!.target = { kind: 'position', x: 0.8, y: 0.2, source: block.source };
    manager.dispatch({ kind: 'replace-draft', draft });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    explainer(latest.contents).itemsById.first!.text = 'Remote explanation.';
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.operationError).toBeUndefined();
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(explainer(result.saveCandidate!)).toMatchObject({
      numbering: 'custom',
      colorMode: 'manual',
      itemOrder: ['second', 'first'],
      itemsById: {
        first: {
          label: 'B',
          color: '#254978',
          text: 'Remote explanation.',
          target: { kind: 'position', x: 0.8, y: 0.2 },
        },
      },
    });
  });
  test('preserves target provenance on source replacement and requests only the current source', () => {
    const manager = createRulebookEditorStateManager(input());
    const result = ready(
      manager.dispatch({
        kind: 'set',
        target: blockTarget,
        field: 'source',
        value: { kind: 'asset', assetId: 'replacement' },
      })
    );
    expect(result.canSave).toBe(true);
    const block = explainer(result.saveCandidate!);
    expect(block.itemsById.first!.target.source).toEqual({ kind: 'asset', assetId: 'token' });
    expect(block.itemsById.second!.target.source).toEqual({ kind: 'asset', assetId: 'token' });
    expect(collectRulebookReferenceIds(result.saveCandidate!)).toEqual({ assetIds: ['replacement'], factionIds: [] });
  });
  test('allows incomplete entries and empty collections while keeping invalid manual colors out of Save', () => {
    const manager = createRulebookEditorStateManager(input());
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'color', value: '#2' });
    const invalid = ready(manager.result);
    expect(explainer(invalid.draft).itemsById.first!.color).toBe('#2');
    expect(invalid.canSave).toBe(false);
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'color', value: '#254978' });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'target', value: { kind: 'named', key: '' } });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'label', value: '' });
    expect(ready(manager.result).canSave).toBe(true);
    manager.dispatch({ kind: 'delete', root: itemTarget });
    const empty = ready(manager.dispatch({ kind: 'delete', root: { ...itemTarget, itemId: 'second' } }));
    expect(empty.canSave).toBe(true);
    expect(explainer(empty.saveCandidate!)).toMatchObject({ itemOrder: [], itemsById: {} });
  });
  test('requires review for conflicting target moves without losing the explanation', () => {
    const initial = input(),
      manager = createRulebookEditorStateManager(initial);
    manager.dispatch({
      kind: 'set',
      target: itemTarget,
      field: 'target',
      value: { kind: 'position', x: 0.2, y: 0.3, source: { kind: 'asset', assetId: 'token' } },
    });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    explainer(latest.contents).itemsById.first!.target = {
      kind: 'position',
      x: 0.8,
      y: 0.9,
      source: { kind: 'asset', assetId: 'token' },
    };
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.canSave).toBe(false);
    expect(result.incompatibilities).toHaveLength(1);
    expect(explainer(result.draft).itemsById.first!.text).toBe('A named part.');
  });
});
