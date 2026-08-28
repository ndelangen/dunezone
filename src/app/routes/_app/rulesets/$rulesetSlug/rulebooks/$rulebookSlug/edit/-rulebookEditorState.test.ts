import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './-rulebookEditorState';
import type { RulebookEditorResult } from './-rulebookEditorState';
import {
  createCleanRebaseInput,
  createCleanRulebookEditorInput,
  createFieldConflictInput,
  createRulebookSavedRevision,
  createStaleSaveInput,
} from './-rulebookEditorState.fixtures';

type ReadyResult = Extract<RulebookEditorResult, { status: 'ready' }>;

function ready(result: RulebookEditorResult): ReadyResult;
function ready(manager: { readonly result: RulebookEditorResult }): ReadyResult;
function ready(value: RulebookEditorResult | { readonly result: RulebookEditorResult }): ReadyResult {
  const result = 'result' in value ? value.result : value;
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') {
    throw new Error('Expected a ready Rulebook editor result');
  }
  return result;
}

describe('Rulebook editor state manager', () => {
  it('tracks Page and Page-scoped Block edits as saveable field intents', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    manager.dispatch({
      kind: 'set',
      target: { kind: 'page', pageId: 'RULE' },
      field: 'title',
      value: 'Movement phase',
    });
    const result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
        field: 'text',
        value: 'Choose a force, then **move it**.',
      })
    );

    expect(result.draft.pagesById.RULE).toMatchObject({ title: 'Movement phase' });
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toMatchObject({
      text: 'Choose a force, then **move it**.',
    });
    expect(result.rebasedPatch.sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: { kind: 'page', pageId: 'RULE' }, field: 'title' }),
        expect.objectContaining({ target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' }, field: 'text' }),
      ])
    );
    expect(result.canSave).toBe(true);
  });

  it('uses Page ID plus Block ID to distinguish Page-local duplicate IDs', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'block', pageId: 'REFS', blockId: 'TEXT' },
        field: 'text',
        value: 'Only the reference Page changes.',
      })
    );

    expect(result.draft.pagesById.REFS?.blocksById.TEXT).toMatchObject({ text: 'Only the reference Page changes.' });
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).not.toMatchObject({
      text: 'Only the reference Page changes.',
    });
  });

  it('retains invalid user input while blocking a save candidate', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
        field: 'text',
        value: '*unfinished',
      })
    );

    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toMatchObject({ text: '*unfinished' });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
          field: 'text',
        }),
      ])
    );
    expect(result.canSave).toBe(false);
    expect(result.saveCandidate).toBeUndefined();
  });

  it('normalizes create, edit, and delete churn into the current intent', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    manager.dispatch({
      kind: 'create',
      entity: { kind: 'block', pageId: 'RULE', block: { id: 'AAAA', kind: 'text', text: 'Draft' } },
      placement: {
        container: { kind: 'block-region', pageId: 'RULE', regionKey: 'rules' },
        afterId: 'TEXT',
        beforeId: null,
      },
    });
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', pageId: 'RULE', blockId: 'AAAA' },
      field: 'text',
      value: 'Final **text**.',
    });
    expect(ready(manager).rebasedPatch.creates[0]).toMatchObject({
      entity: { pageId: 'RULE', block: { id: 'AAAA', text: 'Final **text**.' } },
    });

    const result = ready(
      manager.dispatch({ kind: 'delete', root: { kind: 'block', pageId: 'RULE', blockId: 'AAAA' } })
    );
    expect(result.rebasedPatch.creates).toHaveLength(0);
    expect(result.rebasedPatch.deletes).toHaveLength(0);
  });

  it('materializes child creations after a newly created parent Page', () => {
    const input = createCleanRulebookEditorInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'create',
      entity: {
        kind: 'page',
        page: {
          id: 'NEWW',
          anchor: 'new-reference',
          title: 'New reference',
          layoutId: 'visual-reference',
          controlValues: {},
          blockOrderByRegion: { figures: [], notes: [] },
          blocksById: {},
        },
      },
      placement: {
        container: { kind: 'page-order' },
        afterId: 'REFS',
        beforeId: null,
      },
    });
    const created = ready(
      manager.dispatch({
        kind: 'create',
        entity: {
          kind: 'block',
          pageId: 'NEWW',
          block: { id: 'FGRR', kind: 'asset-figure', text: 'A new figure.' },
        },
        placement: {
          container: { kind: 'block-region', pageId: 'NEWW', regionKey: 'figures' },
          afterId: null,
          beforeId: null,
        },
      })
    );

    expect(created.operationError).toBeUndefined();
    expect(created.draft.pagesById.NEWW?.blocksById.FGRR).toMatchObject({ text: 'A new figure.' });

    const replayed = ready(
      createRulebookEditorStateManager({ ...input, patch: created.rebasedPatch, resolutionLedger: [] })
    );
    expect(replayed.operationError).toBeUndefined();
    expect(replayed.draft.pagesById.NEWW?.blocksById.FGRR).toMatchObject({ text: 'A new figure.' });
  });

  it('reorders Blocks inside a region and moves a compatible Block between regions', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    let result = ready(
      manager.dispatch({
        kind: 'place',
        target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
        destination: {
          container: { kind: 'block-region', pageId: 'RULE', regionKey: 'rules' },
          afterId: null,
          beforeId: 'MVVE',
        },
      })
    );
    const reorderedPage = result.draft.pagesById.RULE;
    if (reorderedPage?.layoutId !== 'rules-page') {
      throw new Error('Expected the RULE fixture Page');
    }
    expect(reorderedPage.blockOrderByRegion.rules).toEqual(['TEXT', 'MVVE']);

    result = ready(
      manager.dispatch({
        kind: 'place',
        target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
        destination: {
          container: { kind: 'block-region', pageId: 'RULE', regionKey: 'examples' },
          afterId: 'L5ST',
          beforeId: null,
        },
      })
    );
    expect(result.draft.pagesById.RULE?.blockOrderByRegion).toMatchObject({
      rules: ['MVVE'],
      examples: ['ASST', 'L5ST', 'TEXT'],
    });
  });

  it('rejects incompatible, over-capacity, and cross-Page drag placements without mutating the draft', () => {
    const incompatible = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const before = ready(incompatible).draft;
    let result = ready(
      incompatible.dispatch({
        kind: 'place',
        target: { kind: 'block', pageId: 'RULE', blockId: 'MVVE' },
        destination: {
          container: { kind: 'block-region', pageId: 'RULE', regionKey: 'examples' },
          afterId: 'L5ST',
          beforeId: null,
        },
      })
    );
    expect(result.operationError).toBeDefined();
    expect(result.draft).toEqual(before);

    const capacity = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    capacity.dispatch({
      kind: 'create',
      entity: { kind: 'block', pageId: 'CHAP', block: { id: 'AAAA', kind: 'asset-figure', text: '' } },
      placement: {
        container: { kind: 'block-region', pageId: 'CHAP', regionKey: 'feature' },
        afterId: 'HERA',
        beforeId: null,
      },
    });
    result = ready(
      capacity.dispatch({
        kind: 'create',
        entity: { kind: 'block', pageId: 'CHAP', block: { id: 'AAAB', kind: 'asset-figure', text: '' } },
        placement: {
          container: { kind: 'block-region', pageId: 'CHAP', regionKey: 'feature' },
          afterId: 'AAAA',
          beforeId: null,
        },
      })
    );
    expect(result.operationError).toBeDefined();
    expect(result.draft.pagesById.CHAP?.blocksById.AAAB).toBeUndefined();

    const crossPage = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    result = ready(
      crossPage.dispatch({
        kind: 'place',
        target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
        destination: {
          container: { kind: 'block-region', pageId: 'REFS', regionKey: 'notes' },
          afterId: 'TEXT',
          beforeId: null,
        },
      })
    );
    expect(result.operationError).toBeDefined();
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toBeDefined();
  });

  it('rejects a duplicate Block ID within its Page scope', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const result = ready(
      manager.dispatch({
        kind: 'create',
        entity: { kind: 'block', pageId: 'RULE', block: { id: 'TEXT', kind: 'text', text: '' } },
        placement: {
          container: { kind: 'block-region', pageId: 'RULE', regionKey: 'rules' },
          afterId: 'TEXT',
          beforeId: null,
        },
      })
    );
    expect(result.operationError).toBeDefined();
    expect(result.rebasedPatch.creates).toHaveLength(0);
  });

  it('creates and deletes repeated items through their Page-scoped parent', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    let result = ready(
      manager.dispatch({
        kind: 'create',
        entity: {
          kind: 'item',
          pageId: 'RULE',
          blockId: 'L5ST',
          item: { id: 'step-2', text: 'Resolve the result.' },
        },
        placement: {
          container: { kind: 'item-order', pageId: 'RULE', blockId: 'L5ST' },
          afterId: 'item-example',
          beforeId: null,
        },
      })
    );
    expect(result.draft.pagesById.RULE?.blocksById.L5ST).toMatchObject({
      itemOrder: ['item-example', 'step-2'],
    });

    result = ready(
      manager.dispatch({
        kind: 'delete',
        root: { kind: 'item', pageId: 'RULE', blockId: 'L5ST', itemId: 'step-2' },
      })
    );
    expect(result.draft.pagesById.RULE?.blocksById.L5ST).toMatchObject({ itemOrder: ['item-example'] });
  });

  it('deletes a Page with its Page-owned Blocks as one frozen subtree', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const result = ready(manager.dispatch({ kind: 'delete', root: { kind: 'page', pageId: 'CHAP' } }));
    expect(result.draft.pagesById.CHAP).toBeUndefined();
    expect(result.rebasedPatch.deletes[0]?.deletedRefs).toEqual(
      expect.arrayContaining([
        { kind: 'page', pageId: 'CHAP' },
        { kind: 'block', pageId: 'CHAP', blockId: 'HERA' },
      ])
    );
  });

  it('accepts a full-draft update but rejects changing an issued Page layout shape', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    if (draft.pagesById.RULE?.layoutId !== 'rules-page') {
      throw new Error('Expected the RULE fixture Page');
    }
    draft.pagesById.RULE.controlValues.guidance.eyebrow = 'Updated guidance';
    let result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    const updatedPage = result.draft.pagesById.RULE;
    if (updatedPage?.layoutId !== 'rules-page') {
      throw new Error('Expected the RULE fixture Page');
    }
    expect(updatedPage.controlValues.guidance.eyebrow).toBe('Updated guidance');
    expect(result.canSave).toBe(true);
    expect(result.rebasedPatch.sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: 'page', pageId: 'RULE' },
          field: 'control-values',
          value: {
            guidance: {
              eyebrow: 'Updated guidance',
              introduction: 'Resolve movement in the order shown below.',
            },
          },
        }),
      ])
    );

    const changedLayout = structuredClone(result.draft);
    changedLayout.pagesById.RULE = {
      id: 'RULE',
      anchor: 'movement',
      title: 'Movement',
      layoutId: 'visual-reference',
      controlValues: {},
      blockOrderByRegion: { figures: [], notes: [] },
      blocksById: {},
    };
    result = ready(manager.dispatch({ kind: 'replace-draft', draft: changedLayout }));
    expect(result.operationError).toContain('layout');
    expect(result.draft.pagesById.RULE.layoutId).toBe('rules-page');
  });

  it('rebases independent local and saved edits', () => {
    const result = ready(createRulebookEditorStateManager(createCleanRebaseInput()));
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.draft.pagesById.REFS?.anchor).toBe('quick-reference');
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toMatchObject({ text: 'A local introduction.' });
    expect(result.canSave).toBe(true);
  });

  it('freezes a same-field conflict until its fingerprinted outcome is approved', () => {
    const manager = createRulebookEditorStateManager(createFieldConflictInput());
    let result = ready(manager);
    const conflict = result.incompatibilities.find((candidate) => candidate.kind === 'field');
    expect(conflict).toBeDefined();
    expect(result.saveCandidate).toBeUndefined();
    if (!conflict) {
      return;
    }

    result = ready(
      manager.dispatch({
        kind: 'resolve',
        approval: {
          incompatibilityId: conflict.id,
          dependencyFingerprint: conflict.dependencyFingerprint,
          outcome: { kind: 'text', value: 'The reviewed opening.' },
        },
      })
    );
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toMatchObject({ text: 'The reviewed opening.' });
    expect(result.canSave).toBe(true);
  });

  it('runs Save as a captured request and resets against the returned revision', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    const requested = ready(manager).saveRequest;
    expect(requested).toBeDefined();
    let result = ready(manager.dispatch({ kind: 'begin-save' }));
    expect(result.isSaving).toBe(true);
    expect(result.saveRequest).toEqual(requested);

    result = ready(
      manager.dispatch({
        kind: 'save-succeeded',
        saved: { revision: 'revision-2', contents: requested!.contents },
      })
    );
    expect(result.latest.revision).toBe('revision-2');
    expect(result.rebasedPatch.sets).toHaveLength(0);
    expect(result.canSave).toBe(false);
  });

  it('clears a Page control-value edit after Save returns its normalized formatted text', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const introduction = '  leading\r\n\r\n*-_nested_-*\r\n';
    let result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'page', pageId: 'RULE' },
        field: 'control-values',
        value: {
          guidance: {
            eyebrow: 'How to play',
            introduction,
          },
        },
      })
    );
    const requested = result.saveRequest;
    expect(requested).toBeDefined();
    const requestedPage = requested?.contents.pagesById.RULE;
    if (requestedPage?.layoutId !== 'rules-page') {
      throw new Error('Expected the RULE fixture Page');
    }
    expect(requestedPage.controlValues.guidance.introduction).not.toBe(introduction);

    result = ready(manager.dispatch({ kind: 'begin-save' }));
    result = ready(
      manager.dispatch({
        kind: 'save-succeeded',
        saved: { revision: 'revision-2', contents: requested!.contents },
      })
    );
    expect(result.rebasedPatch.sets).toHaveLength(0);
    expect(result.canSave).toBe(false);
  });

  it('preserves edits made while a Save request is in flight', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    const requested = ready(manager).saveRequest!;
    manager.dispatch({ kind: 'begin-save' });
    manager.dispatch({
      kind: 'set',
      target: { kind: 'block', pageId: 'REFS', blockId: 'TEXT' },
      field: 'text',
      value: 'Edited after Save was pressed.',
    });
    const result = ready(
      manager.dispatch({
        kind: 'save-succeeded',
        saved: { revision: 'revision-2', contents: requested.contents },
      })
    );
    expect(result.draft.pagesById.REFS?.blocksById.TEXT).toMatchObject({
      text: 'Edited after Save was pressed.',
    });
    expect(result.canSave).toBe(true);
  });

  it('reconciles a stale Save response through the latest-revision path', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    manager.dispatch({ kind: 'begin-save' });
    const latest = createRulebookSavedRevision('revision-2', (contents) => {
      contents.pagesById.REFS!.anchor = 'latest-reference';
    });
    const result = ready(manager.dispatch({ kind: 'save-stale', latest }));
    expect(result.isSaving).toBe(false);
    expect(result.latest.revision).toBe('revision-2');
    expect(result.draft.pagesById.REFS?.anchor).toBe('latest-reference');
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toMatchObject({ text: 'Ready to save.' });
  });

  it('fails closed for unknown Contents versions and malformed current patches', () => {
    const input = createCleanRulebookEditorInput();
    const unsupported = createRulebookEditorStateManager({
      ...input,
      baseline: { revision: 'revision-1', contents: { schemaVersion: 2 } as never },
      latest: { revision: 'revision-1', contents: { schemaVersion: 2 } as never },
    });
    expect(unsupported.result).toMatchObject({ status: 'unsupported', canSave: false });

    const malformed = createRulebookEditorStateManager({
      ...input,
      patch: { ...input.patch, placements: [{ target: { kind: 'page', pageId: 'CHAP' } }] } as never,
    });
    expect(malformed.result).toMatchObject({ status: 'unsupported', canSave: false });
  });

  it('keeps repeated result reads referentially stable until dispatch', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const first = manager.result;
    expect(manager.result).toBe(first);
    manager.dispatch({ kind: 'set', target: { kind: 'page', pageId: 'RULE' }, field: 'title', value: 'Changed' });
    expect(manager.result).not.toBe(first);
  });
});
