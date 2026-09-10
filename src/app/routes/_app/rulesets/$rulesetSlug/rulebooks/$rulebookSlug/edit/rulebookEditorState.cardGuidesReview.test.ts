import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { describe, expect, test } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import { createCleanRulebookEditorInput } from './rulebookEditorState.fixtures';

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error('Expected a ready editor');
  }
  return result;
}

function group(contents: RulebookContentsDraftV1) {
  const block = contents.pagesById.RULE.blocksById.GRUP;
  if (block.kind !== 'card-group') {
    throw new Error('Expected the Card group');
  }
  return block;
}

function input() {
  const clean = createCleanRulebookEditorInput();
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE'],
    pagesById: {
      RULE: {
        id: 'RULE',
        anchor: 'cards',
        title: 'Cards',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['GRUP'] },
        blocksById: {
          GRUP: {
            id: 'GRUP',
            kind: 'card-group',
            title: 'Weapons',
            text: '',
            variant: 'featured-member',
            featuredItemId: 'first',
            itemOrder: ['first', 'second'],
            itemsById: {
              first: { id: 'first', source: { kind: 'asset', assetId: 'maula' }, text: 'First guidance.' },
              second: {
                id: 'second',
                source: { kind: 'asset', assetId: 'crysknife' },
                text: 'Second guidance.',
                quantity: 2,
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

const blockTarget = { kind: 'block', pageId: 'RULE', blockId: 'GRUP' } as const;
const secondTarget = { kind: 'item', pageId: 'RULE', blockId: 'GRUP', itemId: 'second' } as const;

describe('Card feature selection during concurrent member deletion', () => {
  test('accepting the saved deletion drops its local featured choice and preserves other group edits', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'set', target: blockTarget, field: 'featured-item-id', value: 'second' });
    manager.dispatch({ kind: 'set', target: blockTarget, field: 'text', value: 'Keep the shared guidance.' });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    group(latest.contents).itemOrder = ['first'];
    delete group(latest.contents).itemsById.second;
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    const deletion = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    if (!deletion) {
      throw new Error('Expected deletion review');
    }
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: deletion.id,
          dependencyFingerprint: deletion.dependencyFingerprint,
          outcome: { kind: 'accept-saved-deletion' },
        },
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    expect(group(result.saveCandidate!)).toMatchObject({
      itemOrder: ['first'],
      featuredItemId: 'first',
      text: 'Keep the shared guidance.',
    });
    expect(group(result.saveCandidate!).itemsById.second).toBeUndefined();
  });

  test('a newer saved feature choice invalidates a pending approval to restore its deleted competitor', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'set', target: blockTarget, field: 'featured-item-id', value: 'second' });
    manager.dispatch({ kind: 'set', target: blockTarget, field: 'text', value: 'Local shared guidance.' });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    group(latest.contents).itemOrder = ['first'];
    delete group(latest.contents).itemsById.second;
    group(latest.contents).text = 'Saved shared guidance.';
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    const deletion = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    if (!deletion) {
      throw new Error('Expected deletion review');
    }
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: deletion.id,
          dependencyFingerprint: deletion.dependencyFingerprint,
          outcome: { kind: 'restore-local-subtree' },
        },
      })
    );
    expect(result.resolutionLedger).toHaveLength(1);
    expect(result.canSave).toBe(false);
    const newer = structuredClone(latest);
    newer.revision = 'revision-3';
    delete group(newer.contents).featuredItemId;
    result = ready(manager.dispatch({ kind: 'receive-latest', latest: newer }));
    expect(result.resolutionLedger).toEqual([]);
    expect(result.canSave).toBe(false);
    expect(result.incompatibilities.find((entry) => entry.kind === 'deletion')?.dependencyFingerprint).not.toBe(
      deletion.dependencyFingerprint
    );
  });

  test('reviews a newly featured member deleted by another author and can restore its guidance', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'set', target: blockTarget, field: 'featured-item-id', value: 'second' });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    group(latest.contents).itemOrder = ['first'];
    delete group(latest.contents).itemsById.second;
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(false);
    const deletion = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    expect(deletion).toBeDefined();
    if (!deletion) {
      throw new Error('Expected deletion review for the locally featured member');
    }
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: deletion.id,
          dependencyFingerprint: deletion.dependencyFingerprint,
          outcome: { kind: 'restore-local-subtree' },
        },
      })
    );
    expect(result.canSave).toBe(true);
    expect(group(result.saveCandidate!)).toMatchObject({
      featuredItemId: 'second',
      itemsById: {
        second: { text: 'Second guidance.', quantity: 2, source: { kind: 'asset', assetId: 'crysknife' } },
      },
    });
  });

  test('reviews local removal of a member another author has just featured', () => {
    const initial = input();
    const manager = createRulebookEditorStateManager(initial);
    manager.dispatch({ kind: 'delete', root: secondTarget });
    const latest = structuredClone(initial.latest);
    latest.revision = 'revision-2';
    group(latest.contents).featuredItemId = 'second';
    let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(false);
    const deletion = result.incompatibilities.find((entry) => entry.kind === 'deletion');
    expect(deletion).toBeDefined();
    if (!deletion) {
      throw new Error('Expected deletion review for the saved featured member');
    }
    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: deletion.id,
          dependencyFingerprint: deletion.dependencyFingerprint,
          outcome: { kind: 'keep-local-deletion' },
        },
      })
    );
    expect(result.canSave).toBe(true);
    expect(group(result.saveCandidate!).featuredItemId).toBeUndefined();
    expect(group(result.saveCandidate!).itemsById.first.text).toBe('First guidance.');
  });
});
