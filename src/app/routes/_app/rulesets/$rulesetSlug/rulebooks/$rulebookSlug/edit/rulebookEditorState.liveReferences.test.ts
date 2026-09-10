import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import { createCleanRulebookEditorInput } from './rulebookEditorState.fixtures';

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error('Expected a ready editor');
  }
  return result;
}

function inventory(contents: RulebookContentsDraftV1) {
  const block = contents.pagesById.RULE!.blocksById.NVTR!;
  if (block.kind !== 'illustrated-inventory') {
    throw new Error('Expected inventory');
  }
  return block;
}

function referenceInput() {
  const input = createCleanRulebookEditorInput();
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE'],
    pagesById: {
      RULE: {
        id: 'RULE',
        anchor: 'rules',
        title: 'Components',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['ARTW', 'NVTR', 'FACT'] },
        blocksById: {
          ARTW: {
            id: 'ARTW',
            kind: 'referenced-illustration',
            caption: '• A literal caption',
            source: { kind: 'asset', assetId: 'old-asset' },
          },
          NVTR: {
            id: 'NVTR',
            kind: 'illustrated-inventory',
            introduction: 'Choose your equipment.',
            itemOrder: ['first', 'second'],
            itemsById: {
              first: {
                id: 'first',
                source: { kind: 'asset', assetId: 'first-asset' },
                caption: 'First component',
                text: 'Apply its effect.',
                quantity: 2,
              },
              second: { id: 'second', source: { kind: 'asset', assetId: 'second-asset' }, text: 'Discard after play.' },
            },
          },
          FACT: { id: 'FACT', kind: 'faction-introduction', factionId: 'old-faction', text: 'These are your allies.' },
        },
      },
    },
  });
  return {
    ...input,
    baseline: { ...input.baseline, contents },
    latest: { ...input.latest, contents: structuredClone(contents) },
  };
}

const itemTarget = { kind: 'item', pageId: 'RULE', blockId: 'NVTR', itemId: 'first' } as const;

describe('live reference authoring reconciliation', () => {
  it('persists source choices and plain captions while normalizing inventory introduction prose', () => {
    const manager = createRulebookEditorStateManager(referenceInput());
    const draft = structuredClone(ready(manager.result).draft);
    const illustration = draft.pagesById.RULE!.blocksById.ARTW!;
    const faction = draft.pagesById.RULE!.blocksById.FACT!;
    if (illustration.kind !== 'referenced-illustration' || faction.kind !== 'faction-introduction') {
      throw new Error('Expected reference Blocks');
    }
    illustration.caption = '- A literal caption';
    illustration.source = {
      kind: 'faction-member',
      factionId: 'chosen-faction',
      memberId: '00000000-0000-4000-8000-000000000001',
    };
    faction.factionId = 'chosen-faction';
    inventory(draft).title = 'Equipment';
    inventory(draft).introduction = 'Choose *__this component__*.';
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    expect(request.contents.pagesById.RULE!.blocksById.ARTW).toMatchObject({
      source: illustration.source,
      caption: '- A literal caption',
    });
    expect(request.contents.pagesById.RULE!.blocksById.FACT).toMatchObject({ factionId: 'chosen-faction' });
    expect(inventory(request.contents)).toMatchObject({
      title: 'Equipment',
      introduction: 'Choose _*this component*_.',
    });
    manager.dispatch({ kind: 'save-succeeded', saved: { revision: 'revision-2', contents: request.contents } });
    expect(ready(manager.result).draft).toEqual(request.contents);
  });

  it('keeps an inventory source and quantity edit attached through a concurrent reorder and prose edit', () => {
    const input = referenceInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: itemTarget,
      field: 'source',
      value: { kind: 'asset', assetId: 'replacement' },
    });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'quantity', value: 0 });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'caption', value: '- Literal artwork caption' });
    const latest = structuredClone(input.latest);
    latest.revision = 'revision-2';
    inventory(latest.contents).itemOrder.reverse();
    inventory(latest.contents).itemsById.first!.text = 'An updated explanation.';
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.incompatibilities).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(inventory(result.saveCandidate!)).toMatchObject({
      itemOrder: ['second', 'first'],
      itemsById: {
        first: {
          id: 'first',
          source: { kind: 'asset', assetId: 'replacement' },
          quantity: 0,
          caption: '- Literal artwork caption',
          text: 'An updated explanation.',
        },
      },
    });
  });

  it('creates and restores a deleted inventory item with its complete authored fields', () => {
    const input = referenceInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'caption', value: 'A revised caption' });
    const latest = structuredClone(input.latest);
    latest.revision = 'revision-2';
    inventory(latest.contents).itemOrder = ['second'];
    delete inventory(latest.contents).itemsById.first;
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    const difference = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    expect(difference).toBeDefined();
    if (!difference) {
      throw new Error('Expected deletion review');
    }
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: difference.id,
          dependencyFingerprint: difference.dependencyFingerprint,
          outcome: { kind: 'restore-local-subtree' },
        },
      })
    );
    expect(result.canSave).toBe(true);
    expect(inventory(result.saveCandidate!).itemsById.first).toEqual({
      id: 'first',
      source: { kind: 'asset', assetId: 'first-asset' },
      text: 'Apply its effect.',
      caption: 'A revised caption',
      quantity: 2,
    });

    result = ready(
      manager.dispatch({
        kind: 'create',
        entity: {
          kind: 'item',
          pageId: 'RULE',
          blockId: 'NVTR',
          item: {
            id: 'new-item',
            source: { kind: 'asset', assetId: 'new-asset' },
            caption: 'New component',
            quantity: 3,
            text: 'Use this too.',
          },
        },
        placement: {
          container: { kind: 'item-order', pageId: 'RULE', blockId: 'NVTR' },
          afterId: 'second',
          beforeId: null,
        },
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(inventory(result.draft).itemOrder).toEqual(['first', 'second', 'new-item']);
    expect(inventory(result.draft).itemsById['new-item']).toMatchObject({
      source: { kind: 'asset', assetId: 'new-asset' },
      quantity: 3,
    });
  });

  it('reviews conflicting sources as one reference and preserves explicit clearing of optional fields', () => {
    const input = referenceInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'source', value: undefined });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'quantity', value: undefined });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'caption', value: undefined });
    const latest = structuredClone(input.latest);
    latest.revision = 'revision-2';
    inventory(latest.contents).itemsById.first!.source = { kind: 'asset', assetId: 'remote-replacement' };
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    const conflict = result.incompatibilities.find((entry) => entry.kind === 'field' && entry.field === 'source');
    expect(conflict).toBeDefined();
    if (!conflict) {
      throw new Error('Expected source review');
    }
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: conflict.id,
          dependencyFingerprint: conflict.dependencyFingerprint,
          outcome: { kind: 'field-value', value: undefined },
        },
      })
    );
    const item = inventory(result.saveCandidate!).itemsById.first!;
    expect(item.source).toBeUndefined();
    expect(item.quantity).toBeUndefined();
    expect(item.caption).toBeUndefined();
    expect(item.text).toBe('Apply its effect.');
  });

  it('accepts explicit source and quantity conflict choices while rejecting invalid quantities', () => {
    const input = referenceInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: itemTarget,
      field: 'source',
      value: { kind: 'asset', assetId: 'local-choice' },
    });
    manager.dispatch({ kind: 'set', target: itemTarget, field: 'quantity', value: 3 });
    const latest = structuredClone(input.latest);
    latest.revision = 'revision-2';
    inventory(latest.contents).itemsById.first!.source = { kind: 'asset', assetId: 'remote-choice' };
    inventory(latest.contents).itemsById.first!.quantity = 4;
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    const sourceConflict = result.incompatibilities.find((entry) => entry.kind === 'field' && entry.field === 'source');
    const quantityConflict = result.incompatibilities.find(
      (entry) => entry.kind === 'field' && entry.field === 'quantity'
    );
    if (!sourceConflict || !quantityConflict) {
      throw new Error('Expected source and quantity review');
    }
    const chosenSource = {
      kind: 'faction-member',
      factionId: 'chosen-faction',
      memberId: '00000000-0000-4000-8000-000000000002',
    } as const;
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: sourceConflict.id,
          dependencyFingerprint: sourceConflict.dependencyFingerprint,
          outcome: { kind: 'field-value', value: chosenSource },
        },
      })
    );
    expect(result.resolutionLedger.some((entry) => entry.incompatibilityId === sourceConflict.id)).toBe(true);
    expect(inventory(result.comparisonDraft).itemsById.first!.source).toEqual(chosenSource);
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: quantityConflict.id,
          dependencyFingerprint: quantityConflict.dependencyFingerprint,
          outcome: { kind: 'field-value', value: -1 },
        },
      })
    );
    expect(result.canSave).toBe(false);
    expect(result.incompatibilities.some((entry) => entry.id === quantityConflict.id)).toBe(true);
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: quantityConflict.id,
          dependencyFingerprint: quantityConflict.dependencyFingerprint,
          outcome: { kind: 'field-value', value: 0 },
        },
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    expect(inventory(result.saveCandidate!).itemsById.first).toMatchObject({ source: chosenSource, quantity: 0 });
  });

  it('retains invalid introduction prose as a draft and points its diagnostic at that field', () => {
    const manager = createRulebookEditorStateManager(referenceInput());
    const result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'block', pageId: 'RULE', blockId: 'NVTR' },
        field: 'introduction',
        value: 'An *unfinished introduction',
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(inventory(result.draft).introduction).toBe('An *unfinished introduction');
    expect(result.canSave).toBe(false);
    expect(result.diagnostics.some((entry) => entry.field === 'introduction')).toBe(true);
  });
});
