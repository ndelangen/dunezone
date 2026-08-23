import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1, RulebookContentsV1 } from '@shared/rulebooks/contents';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './-rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './-rulebookEditorState';
import {
  createCleanRebaseInput,
  createCleanRulebookEditorInput,
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
        outcome: { kind: 'field', value: 'The local opening.' },
      },
    }) as Extract<RulebookEditorResult, { status: 'ready' }>;
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

  it('groups a combined ordering cycle as one incompatibility', () => {
    const input = createBodyOrderInput(['block-a', 'block-b', 'block-c', 'block-d']);
    const local = createRulebookEditorStateManager(input);
    const localDraft = structuredClone(ready(local).draft);
    singleColumnPage(localDraft, 'page-introduction').slots.body = ['block-b', 'block-d', 'block-a', 'block-c'];
    local.dispatch({ kind: 'replace-draft', draft: localDraft });
    const saved = createRulebookEditorStateManager(input);
    const savedDraft = structuredClone(ready(saved).draft);
    singleColumnPage(savedDraft, 'page-introduction').slots.body = ['block-b', 'block-c', 'block-a', 'block-d'];
    saved.dispatch({ kind: 'replace-draft', draft: savedDraft });
    const result = local.dispatch({
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
    const deleted = result.rebasedPatch.deletes.flatMap(({ deletedRefs }) => deletedRefs);
    expect(deleted).toEqual(
      expect.arrayContaining([
        { kind: 'block', blockId: 'block-examples' },
        { kind: 'item', blockId: 'block-examples', itemId: 'item-remote' },
      ])
    );
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
        outcome: { kind: 'field', value: 'Local introduction' },
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
});
