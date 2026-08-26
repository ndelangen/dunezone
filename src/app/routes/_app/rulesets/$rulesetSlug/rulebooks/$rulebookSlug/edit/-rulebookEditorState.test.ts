import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1, RulebookContentsV1 } from '@shared/rulebooks/contents';
import { createRulebookEditorialStarterContents, createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './-rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './-rulebookEditorState';
import {
  createCleanRebaseInput,
  createCleanRulebookEditorInput,
  createEditorialRulebookEditorInput,
  createFieldConflictInput,
  createRulebookSavedRevision,
  createStaleSaveInput,
} from './-rulebookEditorState.fixtures';

function ready(manager: RulebookEditorStateManager): Extract<RulebookEditorResult, { status: 'ready' }> {
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
  return page as Extract<RulebookContentsDraftV1['pagesById'][string], { layoutId: 'single-column' }>;
}

function twoColumnPage(contents: TestContents, pageId: string) {
  const page = contents.pagesById[pageId];
  expect(page?.layoutId).toBe('two-columns');
  if (page?.layoutId !== 'two-columns') {
    throw new Error(`Expected ${pageId} to use the two-columns layout`);
  }
  return page as Extract<RulebookContentsDraftV1['pagesById'][string], { layoutId: 'two-columns' }>;
}

function createBodyOrderInput(blockIds: readonly string[]) {
  const input = createCleanRulebookEditorInput();
  const baseline = createRulebookSavedRevision('revision-1', (contents) => {
    const emptyText = textBlock(contents, 'block-summary').text as Extract<
      RulebookContentsV1['blocksById'][string],
      { kind: 'text' }
    >['text'];
    delete contents.blocksById['block-introduction'];
    for (const blockId of blockIds) {
      contents.blocksById[blockId] = { id: blockId, kind: 'text', text: emptyText };
    }
    singleColumnPage(contents, 'page-introduction').slots.body = [...blockIds];
  });
  return { ...input, baseline, latest: structuredClone(baseline) };
}

describe('Rulebook Contents V1', () => {
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

  it('accepts empty and unbounded bootstrap slots with both supported Block kinds', () => {
    const empty = createRulebookStarterContents();
    twoColumnPage(empty, 'page-reference').slots.left = [];
    delete empty.blocksById['block-summary'];
    expect(rulebookContentsV1Schema.safeParse(empty).success).toBe(true);

    const contents = createRulebookStarterContents();
    const text = textBlock(contents, 'block-introduction').text as Extract<
      RulebookContentsV1['blocksById'][string],
      { kind: 'text' }
    >['text'];
    for (let index = 0; index < 40; index += 1) {
      const blockId = `block-unbounded-${index}`;
      contents.blocksById[blockId] = { id: blockId, kind: 'text', text };
      singleColumnPage(contents, 'page-introduction').slots.body.push(blockId);
    }
    twoColumnPage(contents, 'page-reference').slots.right = [];
    singleColumnPage(contents, 'page-introduction').slots.body.push('block-examples');
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);

    const invalidKind = createRulebookStarterContents();
    invalidKind.blocksById['block-introduction'] = {
      id: 'block-introduction',
      kind: 'unsupported',
      text,
    } as never;
    expect(rulebookContentsV1Schema.safeParse(invalidKind).success).toBe(false);

    const invalidCardinality = createRulebookStarterContents();
    singleColumnPage(invalidCardinality, 'page-introduction').slots.body.push('block-introduction');
    expect(rulebookContentsV1Schema.safeParse(invalidCardinality).success).toBe(false);
  });

  it('enforces the editorial Page layout Block catalogue', () => {
    const contents = createRulebookEditorialStarterContents();
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(true);

    const markers = contents.pagesById['page-markers'];
    const movement = contents.pagesById['page-movement'];
    if (markers?.layoutId !== 'visual-reference' || movement?.layoutId !== 'rules-page') {
      throw new Error('The editorial fixture must retain its accepted Page layouts');
    }
    markers.slots.body.push('block-movement-sequence');
    movement.slots.body = movement.slots.body.filter((blockId) => blockId !== 'block-movement-sequence');
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
  });
});

describe('Rulebook editor state manager', () => {
  it('tracks editorial titles and formatted content as Saveable field intents', () => {
    const manager = createRulebookEditorStateManager(createEditorialRulebookEditorInput());
    manager.dispatch({
      kind: 'set',
      target: { kind: 'page', pageId: 'page-movement' },
      field: 'title',
      value: 'Movement phase',
    });
    const result = manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-movement-sequence' },
      field: 'text',
      value: 'Choose a force, then **move it**.',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.draft.pagesById['page-movement']).toMatchObject({ title: 'Movement phase' });
    expect(result.draft.blocksById['block-movement-sequence']).toMatchObject({
      text: 'Choose a force, then **move it**.',
    });
    expect(result.rebasedPatch.sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title', target: { kind: 'page', pageId: 'page-movement' } }),
        expect.objectContaining({ field: 'text', target: { kind: 'block', blockId: 'block-movement-sequence' } }),
      ])
    );
    expect(result.canSave).toBe(true);
  });

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
    }) as Extract<RulebookEditorResult, { status: 'ready' }>;
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
        outcome: { kind: 'text', value: 'The local opening.' },
      },
    }) as Extract<RulebookEditorResult, { status: 'ready' }>;
    expect(result.incompatibilities).toHaveLength(0);
    expect(textBlock(result.draft, 'block-introduction').text).toBe('The local opening.');
    expect(result.rebasedPatch.baselineRevision).toBe('revision-2');
    expect(result.canSave).toBe(true);
  });

  it('offers a combined-text helper without resolving the field incompatibility', () => {
    const baseline = createRulebookSavedRevision('revision-1', (contents) => {
      textBlock(contents, 'block-introduction').text = 'Alpha middle Omega';
    });
    const local = createRulebookEditorStateManager({
      ...createCleanRulebookEditorInput(),
      baseline,
      latest: structuredClone(baseline),
    });
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Alpha middle Local',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      textBlock(contents, 'block-introduction').text = 'Saved middle Omega';
    });
    const result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual([
      expect.objectContaining({
        kind: 'field',
        target: { kind: 'block', blockId: 'block-introduction' },
        combinedText: 'Saved middle Local',
      }),
    ]);
    expect(result.resolutionLedger).toHaveLength(0);
    expect(result.canSave).toBe(false);
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

  it('restores a locally moved descendant at its local destination after a saved ancestor deletion', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      contents.pageOrder = ['page-introduction'];
      delete contents.pagesById['page-reference'];
      delete contents.blocksById['block-summary'];
      delete contents.blocksById['block-examples'];
    });
    let result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'deletion');
    expect(conflict).toBeDefined();
    result = local.dispatch({
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
    expect(result.draft.pagesById['page-reference']).toBeDefined();
    expect(twoColumnPage(result.draft, 'page-reference').slots.left).toEqual([]);
    expect(singleColumnPage(result.draft, 'page-introduction').slots.body).toEqual([
      'block-introduction',
      'block-summary',
    ]);
    expect(result.rebasedPatch.restorations.map(({ root }) => root)).toEqual([
      { kind: 'block', blockId: 'block-summary' },
      { kind: 'page', pageId: 'page-reference' },
    ]);
    expect(result.rebasedPatch.placements).toHaveLength(0);
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
    }) as Extract<RulebookEditorResult, { status: 'ready' }>;
    expect(result.latest.revision).toBe('revision-2');
    expect(result.rebasedPatch.sets).toHaveLength(0);
    expect(result.canSave).toBe(false);

    result = manager.dispatch({
      kind: 'replace-draft',
      draft: { ...result.draft, pagesById: { ...result.draft.pagesById } },
    }) as Extract<RulebookEditorResult, { status: 'ready' }>;
    expect(result.rebasedPatch.sets).toHaveLength(0);
  });

  it('rebases edits made while a save request is in flight onto the saved revision', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    const requested = ready(manager).saveRequest!;
    manager.dispatch({ kind: 'begin-save' });
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Edited after Save was pressed.',
    });

    const result = manager.dispatch({
      kind: 'save-succeeded',
      saved: { revision: 'revision-2', contents: requested.contents },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.latest.revision).toBe('revision-2');
    expect(textBlock(result.draft, 'block-summary').text).toBe('Edited after Save was pressed.');
    expect(result.rebasedPatch.sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: 'block', blockId: 'block-summary' },
          field: 'text',
          value: 'Edited after Save was pressed.',
        }),
      ])
    );
    expect(result.canSave).toBe(true);
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

  it('keeps later reads usable after an operation throws inside the membrane', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const before = ready(manager).draft;
    const invalidDraft = { ...before, pagesById: () => undefined } as never;
    const rejected = manager.dispatch({ kind: 'replace-draft', draft: invalidDraft });
    expect(rejected.status).toBe('ready');
    expect(rejected.status === 'ready' ? rejected.operationError : '').toBeTruthy();
    const recovered = manager.result;
    expect(recovered.status).toBe('ready');
    expect(recovered.status === 'ready' ? recovered.draft : undefined).toEqual(before);
  });

  it('rejects a valueless text approval without throwing or accepting it', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Local text',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      textBlock(contents, 'block-introduction').text = 'Saved text';
    });
    const conflicted = manager.dispatch({ kind: 'receive-latest', latest });
    expect(conflicted.status).toBe('ready');
    if (conflicted.status !== 'ready') {
      return;
    }
    const incompatibility = conflicted.incompatibilities.find(
      (item) => item.kind === 'field' && item.field === 'text'
    )!;
    const result = manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: incompatibility.id,
        dependencyFingerprint: incompatibility.dependencyFingerprint,
        outcome: { kind: 'text' } as never,
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(1);
    expect(result.resolutionLedger).toHaveLength(0);
    expect(result.operationError).toBeUndefined();
  });

  it.each(['receive-latest', 'save-stale'] as const)('fails closed when %s receives unsupported Contents', (kind) => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const received = { revision: 'revision-unsupported', contents: { schemaVersion: 2 } as never };
    const result = manager.dispatch({ kind, latest: received });
    expect(result).toMatchObject({
      status: 'unsupported',
      received,
      canSave: false,
      isSaving: false,
    });
    expect(result.status === 'unsupported' ? result.message : '').toMatch(/reload|compatible/i);
    expect(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'block', blockId: 'block-introduction' },
        field: 'text',
        value: 'Must stay disabled',
      }).status
    ).toBe('unsupported');
  });

  it('fails closed when save-succeeded receives unsupported Contents', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const received = { revision: 'revision-unsupported', contents: { schemaVersion: 2 } as never };
    const result = manager.dispatch({ kind: 'save-succeeded', saved: received });
    expect(result).toMatchObject({ status: 'unsupported', received, canSave: false, isSaving: false });
    expect(result.status === 'unsupported' ? result.message : '').toMatch(/reload|compatible/i);
  });

  it.each(['receive-latest', 'save-stale', 'save-succeeded'] as const)(
    'fails closed when %s changes an existing Page layout',
    (kind) => {
      const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
      const contents = createRulebookStarterContents();
      contents.pagesById['page-introduction'] = {
        id: 'page-introduction',
        anchor: 'introduction',
        layoutId: 'two-columns',
        slots: { left: ['block-introduction'], right: [] },
      };
      const received = { revision: 'revision-layout-change', contents };
      const result =
        kind === 'save-succeeded'
          ? manager.dispatch({ kind, saved: received })
          : manager.dispatch({ kind, latest: received });
      expect(result).toMatchObject({ status: 'unsupported', received, canSave: false, isSaving: false });
      expect(result.status === 'unsupported' ? result.message : '').toMatch(/layout|compatible/i);
    }
  );

  it('rejects invalid text combined with an unattached Block', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    textBlock(draft, 'block-introduction').text = '*unfinished';
    draft.blocksById['block-unattached'] = { id: 'block-unattached', kind: 'text', text: '' };
    const result = manager.dispatch({ kind: 'replace-draft', draft });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.operationError).toMatch(/exactly once|Page slot/i);
    expect(result.draft.blocksById['block-unattached']).toBeUndefined();
  });

  it('rejects changing an issued Page layout through replacement', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    draft.pagesById['page-introduction'] = {
      id: 'page-introduction',
      anchor: 'introduction',
      layoutId: 'two-columns',
      slots: { left: ['block-introduction'], right: [] },
    };
    const result = manager.dispatch({ kind: 'replace-draft', draft });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.operationError).toMatch(/cannot change.*layout/i);
    expect(result.draft.pagesById['page-introduction']?.layoutId).toBe('single-column');
  });

  it.each([
    {
      name: 'a duplicate field concern',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        const set = {
          kind: 'set' as const,
          target: { kind: 'block' as const, blockId: 'block-introduction' },
          field: 'text' as const,
          value: 'Duplicate',
        };
        (input as { patch: unknown }).patch = { ...input.patch, sets: [set, set] };
      },
    },
    {
      name: 'a malformed nested target',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        (input as { patch: unknown }).patch = {
          ...input.patch,
          sets: [{ kind: 'set', target: { kind: 'page', blockId: 'wrong' }, field: 'text', value: 'Invalid' }],
        };
      },
    },
    {
      name: 'an incomplete deletion closure',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        (input as { patch: unknown }).patch = {
          ...input.patch,
          deletes: [
            {
              kind: 'delete',
              root: { kind: 'page', pageId: 'page-reference' },
              deletedRefs: [{ kind: 'page', pageId: 'page-reference' }],
            },
          ],
        };
      },
    },
    {
      name: 'create and delete concerns for one identity',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        (input as { patch: unknown }).patch = {
          ...input.patch,
          creates: [
            {
              kind: 'create',
              entity: { kind: 'block', block: { id: 'block-new', kind: 'text', text: 'New' } },
              placement: {
                container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
                afterId: 'block-introduction',
                beforeId: null,
              },
            },
          ],
          deletes: [
            {
              kind: 'delete',
              root: { kind: 'block', blockId: 'block-new' },
              deletedRefs: [{ kind: 'block', blockId: 'block-new' }],
            },
          ],
        };
      },
    },
    {
      name: 'a placement whose original does not match the baseline',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        (input as { patch: unknown }).patch = {
          ...input.patch,
          placements: [
            {
              kind: 'place',
              target: { kind: 'block', blockId: 'block-summary' },
              original: {
                container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
                afterId: null,
                beforeId: 'block-introduction',
              },
              destination: {
                container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
                afterId: 'block-introduction',
                beforeId: null,
              },
            },
          ],
        };
      },
    },
  ])('fails closed for $name in a serialized patch', ({ alter }) => {
    const input = createCleanRulebookEditorInput();
    alter(input);
    expect(createRulebookEditorStateManager(input).result.status).toBe('unsupported');
  });

  it.each([
    {
      name: 'a created identity with a separate field concern',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        (input as { patch: unknown }).patch = {
          ...input.patch,
          creates: [
            {
              kind: 'create',
              entity: { kind: 'block', block: { id: 'block-new', kind: 'text', text: 'New' } },
              placement: {
                container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
                afterId: 'block-introduction',
                beforeId: null,
              },
            },
          ],
          sets: [
            {
              kind: 'set',
              target: { kind: 'block', blockId: 'block-new' },
              field: 'text',
              value: 'Separate concern',
            },
          ],
        };
      },
    },
    {
      name: 'a restored identity with a separate placement concern',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        const placement = {
          container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
          afterId: 'block-introduction',
          beforeId: null,
        };
        (input as { patch: unknown }).patch = {
          ...input.patch,
          restorations: [
            {
              kind: 'restore',
              root: { kind: 'block', blockId: 'block-restored' },
              snapshot: { kind: 'block', block: { id: 'block-restored', kind: 'text', text: 'Restored' } },
              placement,
            },
          ],
          placements: [
            {
              kind: 'place',
              target: { kind: 'block', blockId: 'block-restored' },
              original: placement,
              destination: placement,
            },
          ],
        };
      },
    },
    {
      name: 'a reviewed deletion descendant with a separate field concern',
      alter: (input: ReturnType<typeof createCleanRulebookEditorInput>) => {
        const local = createRulebookEditorStateManager(input);
        const result = local.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });
        if (result.status !== 'ready') {
          throw new Error('The fixture deletion must be supported');
        }
        (input as { patch: unknown }).patch = {
          ...result.rebasedPatch,
          sets: [
            {
              kind: 'set',
              target: { kind: 'block', blockId: 'block-summary' },
              field: 'text',
              value: 'Superseded',
            },
          ],
        };
      },
    },
  ])('fails closed for $name across patch concerns', ({ alter }) => {
    const input = createCleanRulebookEditorInput();
    alter(input);
    expect(createRulebookEditorStateManager(input).result.status).toBe('unsupported');
  });

  it('materializes neighboring creations as one valid placement batch', () => {
    const input = createCleanRulebookEditorInput();
    input.patch.creates.push(
      {
        kind: 'create',
        entity: { kind: 'block', block: { id: 'block-batch-a', kind: 'text', text: 'A' } },
        placement: {
          container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
          afterId: 'block-introduction',
          beforeId: 'block-batch-b',
        },
      },
      {
        kind: 'create',
        entity: { kind: 'block', block: { id: 'block-batch-b', kind: 'text', text: 'B' } },
        placement: {
          container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
          afterId: 'block-batch-a',
          beforeId: null,
        },
      }
    );
    const result = createRulebookEditorStateManager(input).result;
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(singleColumnPage(result.draft, 'page-introduction').slots.body).toEqual([
      'block-introduction',
      'block-batch-a',
      'block-batch-b',
    ]);
  });

  it('applies no placement group when one request in the batch fails', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    local.dispatch({
      kind: 'create',
      entity: { kind: 'item', blockId: 'block-examples', item: { id: 'item-local', text: 'Local item' } },
      placement: {
        container: { kind: 'item-order', blockId: 'block-examples' },
        afterId: 'item-example',
        beforeId: null,
      },
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      const block = contents.blocksById['block-examples'];
      if (block?.kind !== 'repeated-text') {
        throw new Error('The fixture needs a Repeated text Block');
      }
      block.itemOrder = [];
      delete block.itemsById['item-example'];
    });
    const result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(singleColumnPage(result.comparisonDraft, 'page-introduction').slots.body).toEqual(['block-introduction']);
    expect(twoColumnPage(result.comparisonDraft, 'page-reference').slots.left).toContain('block-summary');
    const repeated = result.comparisonDraft.blocksById['block-examples'];
    expect(repeated?.kind === 'repeated-text' ? repeated.itemsById['item-local'] : undefined).toBeUndefined();
    expect(result.incompatibilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'placement', target: expect.objectContaining({ kind: 'item' }) }),
      ])
    );
  });

  it('combines a local field edit with a saved move of the same identity', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Edited locally.',
    });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(textBlock(result.draft, 'block-summary').text).toBe('Edited locally.');
    expect(singleColumnPage(result.draft, 'page-introduction').slots.body).toContain('block-summary');
  });

  it('reports competing moves of the same Block', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-reference', slotId: 'right' },
        afterId: null,
        beforeId: 'block-examples',
      },
    });
    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'placement', reason: 'competing-move' })])
    );
  });

  it('distinguishes a neighbor that survives in another container', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-local', kind: 'text', text: 'Local' } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      singleColumnPage(contents, 'page-introduction').slots.body = [];
      twoColumnPage(contents, 'page-reference').slots.left.unshift('block-introduction');
    });
    const result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'placement', reason: 'cross-container-neighbor' })])
    );
  });

  it('uses surviving non-adjacent neighbors as an interval', () => {
    const input = createBodyOrderInput(['block-target', 'block-after', 'block-before']);
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-target' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-after',
        beforeId: 'block-before',
      },
    });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-remote', kind: 'text', text: 'Remote' } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-after',
        beforeId: 'block-before',
      },
    });
    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    const order = singleColumnPage(result.draft, 'page-introduction').slots.body;
    expect(order.indexOf('block-target')).toBeGreaterThan(order.indexOf('block-after'));
    expect(order.indexOf('block-target')).toBeLessThan(order.indexOf('block-before'));
    expect(order).toContain('block-remote');
  });

  it('groups and resolves a combined ordering cycle as one incompatibility', () => {
    const input = createBodyOrderInput(['block-a', 'block-b', 'block-c', 'block-d']);
    const local = createRulebookEditorStateManager(input);
    const localDraft = structuredClone(ready(local).draft);
    singleColumnPage(localDraft, 'page-introduction').slots.body = ['block-b', 'block-d', 'block-a', 'block-c'];
    local.dispatch({ kind: 'replace-draft', draft: localDraft });
    const saved = createRulebookEditorStateManager(input);
    const savedDraft = structuredClone(ready(saved).draft);
    singleColumnPage(savedDraft, 'page-introduction').slots.body = ['block-b', 'block-c', 'block-a', 'block-d'];
    saved.dispatch({ kind: 'replace-draft', draft: savedDraft });
    let result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'collection-order' })])
    );
    const conflict = result.incompatibilities.find((item) => item.kind === 'collection-order')!;
    result = local.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: {
          kind: 'collection-order',
          container: conflict.container,
          orderedIds: conflict.localOrder,
        },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(singleColumnPage(result.draft, 'page-introduction').slots.body).toEqual(conflict.localOrder);
    expect(result.canSave).toBe(true);
  });

  it('rejects a collection-order approval for a different container with overlapping IDs', () => {
    const input = createBodyOrderInput(['block-a', 'block-b', 'block-c', 'block-d']);
    for (const pageId of ['block-a', 'block-b', 'block-c', 'block-d']) {
      input.baseline.contents.pagesById[pageId] = {
        id: pageId,
        anchor: `page-${pageId}`,
        layoutId: 'single-column',
        slots: { body: [] },
      };
      input.baseline.contents.pageOrder.push(pageId);
    }
    input.latest = structuredClone(input.baseline);

    const local = createRulebookEditorStateManager(input);
    const localDraft = structuredClone(ready(local).draft);
    singleColumnPage(localDraft, 'page-introduction').slots.body = ['block-b', 'block-d', 'block-a', 'block-c'];
    local.dispatch({ kind: 'replace-draft', draft: localDraft });
    const saved = createRulebookEditorStateManager(input);
    const savedDraft = structuredClone(ready(saved).draft);
    singleColumnPage(savedDraft, 'page-introduction').slots.body = ['block-b', 'block-c', 'block-a', 'block-d'];
    saved.dispatch({ kind: 'replace-draft', draft: savedDraft });
    let result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'collection-order')!;
    const pageOrder = [...result.draft.pageOrder];
    result = local.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: { kind: 'collection-order', container: { kind: 'page-order' }, orderedIds: conflict.localOrder },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toEqual(expect.arrayContaining([expect.objectContaining({ id: conflict.id })]));
    expect(result.resolutionLedger).toHaveLength(0);
    expect(result.draft.pageOrder).toEqual(pageOrder);
  });

  it('converges when both sides delete the same identity', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    const saved = createRulebookEditorStateManager(input);
    local.dispatch({ kind: 'delete', root: { kind: 'block', blockId: 'block-summary' } });
    saved.dispatch({ kind: 'delete', root: { kind: 'block', blockId: 'block-summary' } });
    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.rebasedPatch.deletes).toHaveLength(0);
  });

  it('converges a saved ancestor deletion with a local descendant deletion', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    const saved = createRulebookEditorStateManager(input);
    local.dispatch({ kind: 'delete', root: { kind: 'block', blockId: 'block-summary' } });
    saved.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });

    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.draft.pagesById['page-reference']).toBeUndefined();
    expect(result.draft.blocksById['block-summary']).toBeUndefined();
    expect(result.rebasedPatch.deletes).toHaveLength(0);
  });

  it('converges a local ancestor deletion with a saved descendant deletion', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    const saved = createRulebookEditorStateManager(input);
    local.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });
    saved.dispatch({ kind: 'delete', root: { kind: 'block', blockId: 'block-summary' } });

    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.draft.pagesById['page-reference']).toBeUndefined();
    expect(result.draft.blocksById['block-examples']).toBeUndefined();
    expect(result.rebasedPatch.deletes).toEqual([
      expect.objectContaining({
        root: { kind: 'page', pageId: 'page-reference' },
        deletedRefs: expect.not.arrayContaining([{ kind: 'block', blockId: 'block-summary' }]),
      }),
    ]);
  });

  it('preserves a local-deletion approval when saved field-record order changes', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Local introduction',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      textBlock(contents, 'block-summary').text = 'Saved summary';
      textBlock(contents, 'block-introduction').text = 'Saved introduction';
    });
    let result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const deletion = result.incompatibilities.find(
      (item) => item.kind === 'deletion' && item.direction === 'local-deletion'
    )!;
    result = local.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: deletion.id,
        dependencyFingerprint: deletion.dependencyFingerprint,
        outcome: { kind: 'keep-local-deletion' },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.resolutionLedger).toEqual(
      expect.arrayContaining([expect.objectContaining({ incompatibilityId: deletion.id })])
    );

    const reordered = structuredClone(latest.contents);
    reordered.pagesById = Object.fromEntries(Object.entries(reordered.pagesById).reverse());
    reordered.blocksById = Object.fromEntries(Object.entries(reordered.blocksById).reverse());
    result = local.dispatch({ kind: 'receive-latest', latest: { revision: 'revision-3', contents: reordered } });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.resolutionLedger).toEqual(
      expect.arrayContaining([expect.objectContaining({ incompatibilityId: deletion.id })])
    );
    expect(result.incompatibilities).toEqual(expect.arrayContaining([expect.objectContaining({ id: deletion.id })]));
  });

  it('deletes remotely moved reviewed descendants and their new descendants', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'page-reference' } });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-examples' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    saved.dispatch({
      kind: 'create',
      entity: { kind: 'item', blockId: 'block-examples', item: { id: 'item-remote', text: 'Remote item' } },
      placement: {
        container: { kind: 'item-order', blockId: 'block-examples' },
        afterId: 'item-example',
        beforeId: null,
      },
    });
    let result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'deletion');
    expect(conflict).toBeDefined();
    result = local.dispatch({
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
    expect(result.draft.blocksById['block-examples']).toBeUndefined();
    expect(result.rebasedPatch.deletes).toEqual([
      {
        kind: 'delete',
        root: { kind: 'page', pageId: 'page-reference' },
        deletedRefs: [
          { kind: 'block', blockId: 'block-examples' },
          { kind: 'block', blockId: 'block-summary' },
          { kind: 'item', blockId: 'block-examples', itemId: 'item-example' },
          { kind: 'item', blockId: 'block-examples', itemId: 'item-remote' },
          { kind: 'page', pageId: 'page-reference' },
        ],
      },
    ]);
  });

  it('preserves a restoration through a later unrelated saved revision', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Restore this summary.',
    });
    const revisionTwo = createRulebookSavedRevision('revision-2', (contents) => {
      twoColumnPage(contents, 'page-reference').slots.left = [];
      delete contents.blocksById['block-summary'];
    });
    let result = local.dispatch({ kind: 'receive-latest', latest: revisionTwo });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'deletion');
    result = local.dispatch({
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
    expect(result.rebasedPatch.restorations).toHaveLength(1);
    const revisionThree = { revision: 'revision-3', contents: structuredClone(revisionTwo.contents) };
    revisionThree.contents.pagesById['page-reference']!.anchor = 'reference-latest';
    result = local.dispatch({ kind: 'receive-latest', latest: revisionThree });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(textBlock(result.draft, 'block-summary').text).toBe('Restore this summary.');
    expect(result.rebasedPatch.restorations).toHaveLength(1);
  });

  it('preserves unaffected approvals and reopens only changed dependencies', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Local introduction',
    });
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Local summary',
    });
    const revisionTwo = createRulebookSavedRevision('revision-2', (contents) => {
      textBlock(contents, 'block-introduction').text = 'Saved introduction';
      textBlock(contents, 'block-summary').text = 'Saved summary';
    });
    let result = local.dispatch({ kind: 'receive-latest', latest: revisionTwo });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const introduction = result.incompatibilities.find(
      (item) => item.kind === 'field' && item.target.kind === 'block' && item.target.blockId === 'block-introduction'
    )!;
    result = local.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: introduction.id,
        dependencyFingerprint: introduction.dependencyFingerprint,
        outcome: { kind: 'text', value: 'Local introduction' },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.resolutionLedger).toHaveLength(1);
    const revisionThree = { revision: 'revision-3', contents: structuredClone(revisionTwo.contents) };
    revisionThree.contents.pagesById['page-reference']!.anchor = 'reference-three';
    result = local.dispatch({ kind: 'receive-latest', latest: revisionThree });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.resolutionLedger).toHaveLength(1);
    const revisionFour = { revision: 'revision-4', contents: structuredClone(revisionThree.contents) };
    textBlock(revisionFour.contents, 'block-introduction').text = 'Saved introduction changed again';
    result = local.dispatch({ kind: 'receive-latest', latest: revisionFour });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.resolutionLedger).toHaveLength(0);
    expect(result.incompatibilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'field', target: { kind: 'block', blockId: 'block-introduction' } }),
        expect.objectContaining({ kind: 'field', target: { kind: 'block', blockId: 'block-summary' } }),
      ])
    );
  });

  it('keeps invalid and duplicate anchor typing as a diagnosed draft', () => {
    const invalid = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    let result = invalid.dispatch({
      kind: 'set',
      target: { kind: 'page', pageId: 'page-introduction' },
      field: 'anchor',
      value: 'Draft anchor',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.draft.pagesById['page-introduction']?.anchor).toBe('Draft anchor');
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-anchor' })]));
    expect(result.operationError).toBeUndefined();

    const duplicate = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    result = duplicate.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'anchor',
      value: 'introduction',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.draft.blocksById['block-summary']?.anchor).toBe('introduction');
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'duplicate-anchor' })]));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(false);
  });

  it('keeps repeated result reads referentially stable until dispatch', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const first = manager.result;
    expect(manager.result).toBe(first);
    const changed = manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Changed',
    });
    expect(changed).not.toBe(first);
    expect(manager.result).toBe(changed);
  });

  it('does not treat a new adjacent sibling as a change to a locally deleted identity', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({ kind: 'delete', root: { kind: 'block', blockId: 'block-summary' } });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'create',
      entity: { kind: 'block', block: { id: 'block-remote-sibling', kind: 'text', text: 'Remote sibling' } },
      placement: {
        container: { kind: 'page-slot', pageId: 'page-reference', slotId: 'left' },
        afterId: 'block-summary',
        beforeId: null,
      },
    });
    const result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.draft.blocksById['block-summary']).toBeUndefined();
    expect(result.draft.blocksById['block-remote-sibling']).toBeDefined();
  });

  it('rechecks the shared anchor namespace across approved outcomes', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'anchor',
      value: 'remote-one',
    });
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-examples' },
      field: 'anchor',
      value: 'remote-two',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      contents.pagesById['page-introduction']!.anchor = 'remote-one';
      contents.pagesById['page-reference']!.anchor = 'remote-two';
    });
    let result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflicts = result.incompatibilities.filter((item) => item.kind === 'anchor');
    expect(conflicts).toHaveLength(2);
    for (const conflict of conflicts) {
      result = local.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: conflict.id,
          dependencyFingerprint: conflict.dependencyFingerprint,
          outcome: { kind: 'anchor', value: 'same-new-anchor' },
        },
      });
    }
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(2);
    expect(result.resolutionLedger).toHaveLength(0);
    expect(result.canSave).toBe(false);
  });

  it('preserves a restoration when the restored content is edited again', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Restore this summary.',
    });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      twoColumnPage(contents, 'page-reference').slots.left = [];
      delete contents.blocksById['block-summary'];
    });
    let result = local.dispatch({ kind: 'receive-latest', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'deletion')!;
    local.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: { kind: 'restore-local-subtree' },
      },
    });
    result = local.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Edited after restoration.',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.rebasedPatch.restorations).toHaveLength(1);
    expect(result.rebasedPatch.creates).toHaveLength(0);
    expect(textBlock(result.draft, 'block-summary').text).toBe('Edited after restoration.');
  });

  it('materializes both deletion acceptance outcomes through the manager membrane', () => {
    const input = createCleanRulebookEditorInput();
    const acceptSaved = createRulebookEditorStateManager(input);
    acceptSaved.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-summary' },
      field: 'text',
      value: 'Local summary',
    });
    const savedDeletion = createRulebookSavedRevision('revision-2', (contents) => {
      twoColumnPage(contents, 'page-reference').slots.left = [];
      delete contents.blocksById['block-summary'];
    });
    let result = acceptSaved.dispatch({ kind: 'receive-latest', latest: savedDeletion });
    if (result.status !== 'ready') {
      throw new Error('Expected a saved-deletion incompatibility');
    }
    let conflict = result.incompatibilities.find((item) => item.kind === 'deletion')!;
    result = acceptSaved.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: { kind: 'accept-saved-deletion' },
      },
    });
    expect(result.status === 'ready' ? result.draft.blocksById['block-summary'] : 'unsupported').toBeUndefined();

    const acceptLatest = createRulebookEditorStateManager(input);
    acceptLatest.dispatch({ kind: 'delete', root: { kind: 'block', blockId: 'block-summary' } });
    const savedEdit = createRulebookSavedRevision('revision-2', (contents) => {
      textBlock(contents, 'block-summary').text = 'Latest summary';
    });
    result = acceptLatest.dispatch({ kind: 'receive-latest', latest: savedEdit });
    if (result.status !== 'ready') {
      throw new Error('Expected a local-deletion incompatibility');
    }
    conflict = result.incompatibilities.find((item) => item.kind === 'deletion')!;
    result = acceptLatest.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: { kind: 'accept-latest-subtree' },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(textBlock(result.draft, 'block-summary').text).toBe('Latest summary');
    expect(result.rebasedPatch.deletes).toHaveLength(0);
  });

  it('resolves a competing placement through the manager membrane', () => {
    const input = createCleanRulebookEditorInput();
    const local = createRulebookEditorStateManager(input);
    local.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-reference', slotId: 'right' },
        afterId: null,
        beforeId: 'block-examples',
      },
    });
    const saved = createRulebookEditorStateManager(input);
    saved.dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: 'block-summary' },
      destination: {
        container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
        afterId: 'block-introduction',
        beforeId: null,
      },
    });
    let result = local.dispatch({
      kind: 'receive-latest',
      latest: { revision: 'revision-2', contents: ready(saved).saveCandidate! },
    });
    if (result.status !== 'ready') {
      throw new Error('Expected a placement incompatibility');
    }
    const conflict = result.incompatibilities.find((item) => item.kind === 'placement')!;
    result = local.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: conflict.id,
        dependencyFingerprint: conflict.dependencyFingerprint,
        outcome: { kind: 'placement', destination: conflict.local },
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities).toHaveLength(0);
    expect(twoColumnPage(result.draft, 'page-reference').slots.right).toContain('block-summary');
  });

  it('uses grapheme-safe text helpers and refuses ambiguous same-position insertions', () => {
    const baseline = createRulebookSavedRevision('revision-1', (contents) => {
      textBlock(contents, 'block-introduction').text = '👩‍💻 plans';
    });
    const input = { ...createCleanRulebookEditorInput(), baseline, latest: structuredClone(baseline) };
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: '👩‍🔬 plans',
    });
    let result = manager.dispatch({
      kind: 'receive-latest',
      latest: createRulebookSavedRevision('revision-2', (contents) => {
        textBlock(contents, 'block-introduction').text = '👩‍💻 plans updated';
      }),
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.incompatibilities.find((item) => item.kind === 'field')).toMatchObject({
      combinedText: '👩‍🔬 plans updated',
    });

    const insertionBaseline = createRulebookSavedRevision('revision-1', (contents) => {
      textBlock(contents, 'block-introduction').text = 'Plans';
    });
    const insertion = createRulebookEditorStateManager({
      ...createCleanRulebookEditorInput(),
      baseline: insertionBaseline,
      latest: structuredClone(insertionBaseline),
    });
    insertion.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Local Plans',
    });
    result = insertion.dispatch({
      kind: 'receive-latest',
      latest: createRulebookSavedRevision('revision-2', (contents) => {
        textBlock(contents, 'block-introduction').text = 'Saved Plans';
      }),
    });
    expect(
      result.status === 'ready' ? result.incompatibilities.find((item) => item.kind === 'field') : undefined
    ).toMatchObject({ combinedText: undefined });
  });

  it('preserves an active Save across incoming revisions and exposes its captured request', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Requested value',
    });
    const request = ready(manager).saveRequest!;
    let result = manager.dispatch({ kind: 'begin-save' });
    expect(result).toMatchObject({ status: 'ready', isSaving: true, canSave: false, saveRequest: request });

    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      contents.pagesById['page-reference']!.anchor = 'reference-updated';
    });
    result = manager.dispatch({ kind: 'receive-latest', latest });
    expect(result).toMatchObject({ status: 'ready', isSaving: true, canSave: false, saveRequest: request });
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', blockId: 'block-introduction' },
      field: 'text',
      value: 'Edited while saving',
    });
    result = manager.dispatch({ kind: 'begin-save' });
    expect(result).toMatchObject({
      status: 'ready',
      isSaving: true,
      canSave: false,
      saveRequest: request,
      operationError: 'Save is not available for the current Rulebook draft',
    });
    result = manager.dispatch({ kind: 'save-stale', latest });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.isSaving).toBe(false);
    expect(textBlock(result.draft, 'block-introduction').text).toBe('Edited while saving');
    expect(result.canSave).toBe(true);
  });

  it('distinguishes unsupported versions from malformed current-version patches', () => {
    const unknown = createRulebookEditorStateManager({
      ...createCleanRulebookEditorInput(),
      baseline: { revision: 'revision-1', contents: { schemaVersion: 2 } as never },
    }).result;
    expect(unknown.status === 'unsupported' ? unknown.message : '').toContain('schema version');

    const input = createCleanRulebookEditorInput();
    const malformed = createRulebookEditorStateManager({
      ...input,
      patch: { ...input.patch, creates: [{}] } as typeof input.patch,
    }).result;
    expect(malformed.status === 'unsupported' ? malformed.message : '').toContain('edit patch is invalid');

    const { schemaVersion: _schemaVersion, ...missingVersionPatch } = input.patch;
    const missingVersion = createRulebookEditorStateManager({
      ...input,
      patch: missingVersionPatch as typeof input.patch,
    }).result;
    expect(missingVersion.status === 'unsupported' ? missingVersion.message : '').toContain('edit patch is invalid');

    const futureVersion = createRulebookEditorStateManager({
      ...input,
      patch: { ...input.patch, schemaVersion: 2 } as never,
    }).result;
    expect(futureVersion.status === 'unsupported' ? futureVersion.message : '').toContain('patch version');
  });

  it('emits canonical placement and creation order accepted by the public membrane', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager(input);
    for (const blockId of ['block-zulu', 'block-alpha']) {
      manager.dispatch({
        kind: 'create',
        entity: { kind: 'block', block: { id: blockId, kind: 'text', text: blockId } },
        placement: {
          container: { kind: 'page-slot', pageId: 'page-introduction', slotId: 'body' },
          afterId: 'block-introduction',
          beforeId: null,
        },
      });
    }
    const patch = ready(manager).rebasedPatch;
    expect(patch.creates.map(({ entity }) => (entity.kind === 'block' ? entity.block.id : 'other'))).toEqual([
      'block-alpha',
      'block-zulu',
    ]);
    expect(createRulebookEditorStateManager({ ...input, patch }).result.status).toBe('ready');
  });
});
