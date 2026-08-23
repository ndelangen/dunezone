import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1, RulebookContentsV1 } from '@shared/rulebooks/contents';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './RulebookEditorState';
import type { RulebookEditorReadyResult, RulebookEditorStateManager } from './RulebookEditorState';
import {
  createCleanRebaseInput,
  createCleanRulebookEditorInput,
  createFieldConflictInput,
  createRulebookSavedRevision,
  createStaleSaveInput,
} from './RulebookEditorState.fixtures';

function ready(manager: RulebookEditorStateManager): RulebookEditorReadyResult {
  const result = manager.result;
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') {
    throw new Error('Expected a supported Rulebook Contents revision');
  }
  return result;
}

type TestContents = RulebookContentsV1 | RulebookContentsDraftV1;

function textBlock(contents: TestContents, blockId: string) {
  const block = contents.blocksById[blockId];
  expect(block?.kind).toBe('text');
  if (block?.kind !== 'text') {
    throw new Error(`Expected ${blockId} to be a text Block`);
  }
  return block;
}

function singleColumnPage(contents: TestContents, pageId: string) {
  const page = contents.pagesById[pageId];
  expect(page?.layoutId).toBe('single-column');
  if (page?.layoutId !== 'single-column') {
    throw new Error(`Expected ${pageId} to use the single-column layout`);
  }
  return page;
}

function twoColumnPage(contents: TestContents, pageId: string) {
  const page = contents.pagesById[pageId];
  expect(page?.layoutId).toBe('two-columns');
  if (page?.layoutId !== 'two-columns') {
    throw new Error(`Expected ${pageId} to use the two-columns layout`);
  }
  return page;
}

describe('Rulebook Contents V1', () => {
  it('provides the accepted two-page starter as valid normalized contents', () => {
    const contents = createRulebookStarterContents();
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);
    expect(contents.pageOrder).toEqual(['page-introduction', 'page-reference']);
    expect(contents.pagesById['page-reference']?.layoutId).toBe('two-columns');
    expect(contents.blocksById['block-examples']?.kind).toBe('repeated-text');
  });

  it('rejects duplicate placement, key disagreement, and anchor collisions', () => {
    const duplicate = createRulebookStarterContents();
    twoColumnPage(duplicate, 'page-reference').slots.left.push('block-introduction');
    expect(rulebookContentsV1Schema.safeParse(duplicate).success).toBe(false);

    const wrongKey = createRulebookStarterContents();
    wrongKey.pagesById['wrong-key'] = wrongKey.pagesById['page-reference']!;
    delete wrongKey.pagesById['page-reference'];
    expect(rulebookContentsV1Schema.safeParse(wrongKey).success).toBe(false);

    const duplicateAnchor = createRulebookStarterContents();
    duplicateAnchor.blocksById['block-summary']!.anchor = 'introduction';
    expect(rulebookContentsV1Schema.safeParse(duplicateAnchor).success).toBe(false);
  });
});

describe('Rulebook editor state manager', () => {
  it('fails closed for an unknown schema version', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager({
      ...input,
      baseline: { revision: 'revision-1', contents: { schemaVersion: 2 } as never },
      latest: { revision: 'revision-1', contents: { schemaVersion: 2 } as never },
    });
    expect(manager.result).toMatchObject({ status: 'unsupported', canSave: false, isSaving: false });
  });

  it('retains an invalid field draft while blocking a save candidate', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const result = manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: '*unfinished',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(textBlock(result.draft, 'block-introduction').text).toBe('*unfinished');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'text', target: { kind: 'block', blockId: 'block-introduction' } }),
      ])
    );
    expect(result.canSave).toBe(false);
    expect(result.saveCandidate).toBeUndefined();
  });

  it('normalizes creation into one current-intent patch and removes create-then-delete churn', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    manager.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-new', kind: 'text', text: 'Draft', anchor: undefined } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-new' },
      field: 'text',
      value: 'Final **text**.',
    });
    let result = ready(manager);
    expect(result.rebasedPatch.creates).toHaveLength(1);
    expect(result.rebasedPatch.sets).toHaveLength(0);
    expect(result.rebasedPatch.creates[0]).toMatchObject({ entity: { block: { text: 'Final **text**.' } } });

    result = manager.dispatch({
      kind: 'delete',
      root: { kind: 'block', blockId: 'block-new' },
    }) as RulebookEditorReadyResult;
    expect(result.rebasedPatch.creates).toHaveLength(0);
    expect(result.rebasedPatch.deletes).toHaveLength(0);
  });

  it('deletes an exact frozen subtree but preserves a Block moved out first', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    manager.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const result = manager.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.draft.blocksById['block-summary']).toBeDefined();
    expect(result.draft.blocksById['block-examples']).toBeUndefined();
    expect(result.rebasedPatch.deletes[0]?.deletedRefs).toEqual(
      expect.arrayContaining([
        { kind: 'page', pageId: 'page-reference' },
        { kind: 'block', blockId: 'block-examples' },
        { kind: 'item', blockId: 'block-examples', itemId: 'item-example' },
      ])
    );
    expect(result.rebasedPatch.deletes[0]?.deletedRefs).not.toContainEqual({ kind: 'block', blockId: 'block-summary' });
  });

  it('rebases independent local and saved edits without an incompatibility', () => {
    const result = ready(createRulebookEditorStateManager(createCleanRebaseInput()));
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.latest.revision).toBe('revision-2');
    expect(result.draft.pagesById['page-reference']?.anchor).toBe('quick-reference');
    expect(textBlock(result.draft, 'block-introduction').text).toBe('A local introduction.');
    expect(result.rebasedPatch.baselineRevision).toBe('revision-2');
  });

  it('converges normalized-equivalent formatted-text changes', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Equivalent  \r\n',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      textBlock(contents, 'block-introduction').text = 'Equivalent';
    });
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.rebasedPatch.sets).toHaveLength(0);
  });

  it('freezes a same-field conflict until its fingerprinted outcome is approved', () => {
    const manager = createRulebookEditorStateManager(createFieldConflictInput());
    let result = ready(manager);
    expect(result.incompatibilities).toHaveLength(1);
    expect(result.canSave).toBe(false);
    const conflict = result.incompatibilities[0]!;
    result = manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: { kind: 'field', value: 'The local opening.' },
      },
    }) as RulebookEditorReadyResult;
    expect(result.incompatibilities).toHaveLength(0);
    expect(textBlock(result.draft, 'block-introduction').text).toBe('The local opening.');
    expect(result.rebasedPatch.baselineRevision).toBe('revision-2');
    expect(result.canSave).toBe(true);
  });

  it('keeps same-gap inserts deterministic across local and saved work', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-local', kind: 'text', text: 'Local', anchor: undefined } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-saved', kind: 'text', text: 'Saved', anchor: undefined } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const savedResult = ready(saved);
    const latest = { revision: 'revision-2', contents: savedResult.saveCandidate! };
    const result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(singleColumnPage(result.draft, 'page-introduction').slots.body).toEqual([
      'block-introduction',
      'block-local',
      'block-saved',
    ]);
  });

  it('freezes a missing-neighbor placement rather than guessing a new gap', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-local', kind: 'text', text: 'Local', anchor: undefined } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      singleColumnPage(contents, 'page-introduction').slots.body = [];
      delete contents.blocksById['block-introduction'];
    });
    const result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'placement', reason: 'missing-neighbor' })])
    );
  });

  it('requires an explicit outcome for saved deletion against a local edit', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Keep this local summary.',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      twoColumnPage(contents, 'page-reference').slots.left = [];
      delete contents.blocksById['block-summary'];
    });
    let result = manager.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'deletion');
    expect(conflict).toMatchObject({ kind: 'deletion', direction: 'saved-deletion' });
    result = manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict!.id,
        dependencyFingerprint: conflict!.dependencyFingerprint,
        outcome: { kind: 'restore-local-subtree' },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(textBlock(result.draft, 'block-summary').text).toBe('Keep this local summary.');
  });

  it('includes newly saved descendants when keeping a local parent deletion', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });
    const latestManager = createRulebookEditorStateManager(input);
    latestManager.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-new-saved', kind: 'text', text: 'Saved child', anchor: undefined } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-reference', slotId: 'left' },
        afterId: 'block-summary',
        beforeId: null,
      },
    });
    const latest = { revision: 'revision-2', contents: ready(latestManager).saveCandidate! };
    let result = manager.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'deletion');
    expect(conflict).toBeDefined();
    result = manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict!.id,
        dependencyFingerprint: conflict!.dependencyFingerprint,
        outcome: { kind: 'keep-local-deletion' },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.draft.pagesById['page-reference']).toBeUndefined();
    expect(result.draft.blocksById['block-new-saved']).toBeUndefined();
  });

  it('freezes an anchor collision and exposes no save candidate', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'anchor',
      value: 'shared-anchor',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      contents.pagesById['page-introduction']!.anchor = 'shared-anchor';
    });
    const result = manager.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'anchor' })]));
    expect(result.saveCandidate).toBeUndefined();
  });

  it('resets the baseline after save while preserving independent undo ownership', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    let result = ready(manager);
    expect(result.canSave).toBe(true);
    manager.dispatch({ kind: 'begin-save' });
    result = manager.dispatch({
      kind: 'save-succeeded',
      saved: { revision: 'revision-2', contents: result.saveCandidate! },
    }) as RulebookEditorReadyResult;
    expect(result.latest.revision).toBe('revision-2');
    expect(result.rebasedPatch.sets).toHaveLength(0);
    expect(result.canSave).toBe(false);

    result = manager.dispatch({
      kind: 'replace-draft',
      draft: { ...result.draft, pagesById: { ...result.draft.pagesById } },
    }) as RulebookEditorReadyResult;
    expect(result.rebasedPatch.sets).toHaveLength(0);
  });

  it('reconciles a stale save response through the same latest-revision path', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    manager.dispatch({ kind: 'begin-save' });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      contents.pagesById['page-reference']!.anchor = 'latest-reference';
    });
    const result = manager.dispatch({ kind: 'save-stale', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.isSaving).toBe(false);
    expect(result.latest.revision).toBe('revision-2');
    expect(result.draft.pagesById['page-reference']?.anchor).toBe('latest-reference');
    expect(textBlock(result.draft, 'block-introduction').text).toBe('Ready to save.');
  });

  it('rejects an impossible operation without mutating the current draft', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const before = ready(manager).draft;
    const result = manager.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-introduction' },
      destination: { container: { kind: 'page-order' }, afterId: null, beforeId: null },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.operationError).toMatch(/destination/i);
    expect(result.draft).toEqual(before);
  });
});
