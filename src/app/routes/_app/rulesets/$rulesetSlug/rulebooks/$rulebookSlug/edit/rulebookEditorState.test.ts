import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';
import {
  createCleanRebaseInput,
  createCleanRulebookEditorInput,
  createFieldConflictInput,
  createRulebookSavedRevision,
  createStaleSaveInput,
} from './rulebookEditorState.fixtures';

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
  it('saves nested marks in their canonical form now that normalisation holds still', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    const block = draft.pagesById.RULE?.blocksById.TEXT;
    if (block?.kind !== 'text') {
      throw new Error('The fixture needs a text Block');
    }
    /* The bold-italic phrase that #1018 could only refuse: a mark nested in itself no longer reorders into an empty mark (#1019), so it saves canonically. */
    block.text = 'Note *__this rule__* applies.';
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.draft.pagesById.RULE?.blocksById.TEXT).toMatchObject({ text: 'Note *__this rule__* applies.' });
    expect(result.diagnostics).toHaveLength(0);
    expect(result.canSave).toBe(true);
    expect(result.saveCandidate?.pagesById.RULE?.blocksById.TEXT).toMatchObject({
      text: 'Note _*this rule*_ applies.',
    });
  });

  it('keeps an edited Asset reference through Save and later clearing', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    const figure = draft.pagesById.RULE?.blocksById.ASST;
    if (figure?.kind !== 'asset-figure') {
      throw new Error('The fixture needs an Asset figure');
    }
    figure.assetId = 'a-new-asset';
    manager.dispatch({ kind: 'replace-draft', draft });
    expect(ready(manager).canSave).toBe(true);
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    expect(request.contents.pagesById.RULE?.blocksById.ASST).toHaveProperty('assetId', 'a-new-asset');
    manager.dispatch({ kind: 'save-succeeded', saved: { revision: 'revision-2', contents: request.contents } });
    const cleared = structuredClone(ready(manager).draft);
    const savedFigure = cleared.pagesById.RULE?.blocksById.ASST;
    if (savedFigure?.kind !== 'asset-figure') {
      throw new Error('The saved figure must survive');
    }
    savedFigure.assetId = undefined;
    manager.dispatch({ kind: 'replace-draft', draft: cleared });
    expect(ready(manager).canSave).toBe(true);
    expect(
      ready(manager.dispatch({ kind: 'begin-save' })).saveRequest?.contents.pagesById.RULE?.blocksById.ASST
    ).not.toHaveProperty('assetId', 'a-new-asset');
  });

  it('reports a Block anchor that repeats a later Page anchor on the Block, because Page anchors own first', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    const [firstPageId, secondPageId] = draft.pageOrder;
    const first = draft.pagesById[firstPageId!]!;
    const second = draft.pagesById[secondPageId!]!;
    const block = Object.values(first.blocksById)[0]!;
    block.anchor = second.anchor;
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.diagnostics).toEqual([
      {
        target: { kind: 'block', pageId: firstPageId, blockId: block.id },
        field: 'anchor',
        code: 'duplicate-anchor',
        message: `Anchor ${second.anchor} is already used by page:${secondPageId}`,
      },
    ]);
    expect(result.canSave).toBe(false);
  });

  it('keeps a draft whose real anchor is spelled like a placeholder while another anchor is invalid', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const draft = structuredClone(ready(manager).draft);
    const [firstPageId, secondPageId] = draft.pageOrder;
    draft.pagesById[firstPageId!]!.anchor = 'Bad Anchor';
    draft.pagesById[secondPageId!]!.anchor = 'invalid-draft-anchor-1';
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.draft.pagesById[firstPageId!]?.anchor).toBe('Bad Anchor');
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['invalid-anchor']);
    expect(result.canSave).toBe(false);
  });

  it('refuses a replaced draft that carries a key the Contents contract does not know', () => {
    const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
    const before = ready(manager).draft;
    const draft = { ...structuredClone(before), extra: 1 } as typeof before;
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toMatch(/extra/);
    expect(result.draft).toEqual(before);
  });

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

  it('keeps the complete local patch after a failed Save and permits retry', () => {
    const manager = createRulebookEditorStateManager(createStaleSaveInput());
    manager.dispatch({ kind: 'begin-save' });
    manager.dispatch({
      kind: 'set',
      target: { kind: 'page', pageId: 'REFS' },
      field: 'title',
      value: 'Edited during Save',
    });
    const failed = ready(manager.dispatch({ kind: 'save-failed', message: 'Not authorized' }));
    expect(failed.isSaving).toBe(false);
    expect(failed.canSave).toBe(true);
    expect(failed.operationError).toBe('Not authorized');
    expect(failed.draft.pagesById.REFS.title).toBe('Edited during Save');
    expect(failed.draft.pagesById.RULE.blocksById.TEXT).toMatchObject({ text: 'Ready to save.' });
    const retry = ready(manager.dispatch({ kind: 'begin-save' }));
    expect(retry.operationError).toBeUndefined();
    const saved = ready(
      manager.dispatch({
        kind: 'save-succeeded',
        saved: { revision: 'revision-2', contents: retry.saveRequest!.contents },
      })
    );
    expect(saved.canSave).toBe(false);
    expect(saved.draft.pagesById.REFS.title).toBe('Edited during Save');
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

function writtenRuleInput() {
  const input = createCleanRulebookEditorInput();
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE', 'CVER'],
    pagesById: {
      RULE: {
        id: 'RULE',
        anchor: 'rules',
        title: 'Rules',
        layoutId: 'wide-narrow',
        showHeading: true,
        controlValues: { widePosition: 'left' },
        blockOrderByRegion: { wide: ['HEAD', 'TEXT', 'L5ST'], narrow: ['NTEE', 'QNAA'] },
        blocksById: {
          HEAD: { id: 'HEAD', kind: 'section-heading', title: 'Movement' },
          TEXT: { id: 'TEXT', kind: 'text', text: 'Move one group.' },
          L5ST: {
            id: 'L5ST',
            kind: 'list',
            style: 'numbered',
            itemOrder: ['AAAA', 'BBBB'],
            itemsById: {
              AAAA: { id: 'AAAA', name: 'Ship', text: 'Pay spice.' },
              BBBB: { id: 'BBBB', name: 'Move', text: 'Choose a group.' },
            },
          },
          NTEE: { id: 'NTEE', kind: 'callout', variant: 'note', text: 'Check the storm.' },
          QNAA: { id: 'QNAA', kind: 'question-answer', question: 'Can I cross the storm?', answer: 'No.' },
        },
      },
      CVER: {
        id: 'CVER',
        anchor: 'cover',
        title: 'Dune',
        layoutId: 'cover',
        showHeading: true,
        controlValues: { cover: { subtitle: '', supportingText: '' } },
        blockOrderByRegion: {},
        blocksById: {},
      },
    },
  });
  return {
    ...input,
    baseline: { ...input.baseline, contents },
    latest: { ...input.latest, contents: structuredClone(contents) },
  };
}

describe('Written-rule reconciliation', () => {
  it('rebases a named item edit across a concurrent reorder without losing identity', () => {
    const input = writtenRuleInput();
    const manager = createRulebookEditorStateManager(input);
    manager.dispatch({
      kind: 'set',
      target: { kind: 'item', pageId: 'RULE', blockId: 'L5ST', itemId: 'AAAA' },
      field: 'name',
      value: 'Ship reserves',
    });
    const latest = structuredClone(input.latest);
    latest.revision = 'revision-2';
    const list = latest.contents.pagesById.RULE!.blocksById.L5ST!;
    if (list.kind !== 'list') {
      throw new Error('Expected List');
    }
    list.itemOrder = ['BBBB', 'AAAA'];
    const result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
    expect(result.canSave).toBe(true);
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.saveCandidate?.pagesById.RULE?.blocksById.L5ST).toMatchObject({
      itemOrder: ['BBBB', 'AAAA'],
      itemsById: { AAAA: { id: 'AAAA', name: 'Ship reserves', text: 'Pay spice.' } },
    });
  });

  it('creates, deletes, and restores named List items through the existing identity protocol', () => {
    const manager = createRulebookEditorStateManager(writtenRuleInput());
    manager.dispatch({
      kind: 'create',
      entity: {
        kind: 'item',
        pageId: 'RULE',
        blockId: 'L5ST',
        item: { id: 'CCCC', name: 'Collect', text: 'Take spice.' },
      },
      placement: {
        container: { kind: 'item-order', pageId: 'RULE', blockId: 'L5ST' },
        afterId: 'BBBB',
        beforeId: null,
      },
    });
    let result = ready(manager);
    expect(result.operationError).toBeUndefined();
    expect(result.saveCandidate?.pagesById.RULE?.blocksById.L5ST).toMatchObject({
      itemOrder: ['AAAA', 'BBBB', 'CCCC'],
    });
    const saved = { revision: 'revision-2', contents: result.saveCandidate! };
    manager.dispatch({ kind: 'begin-save' });
    manager.dispatch({ kind: 'save-succeeded', saved });
    manager.dispatch({ kind: 'delete', root: { kind: 'item', pageId: 'RULE', blockId: 'L5ST', itemId: 'CCCC' } });
    result = ready(manager);
    expect(result.saveCandidate?.pagesById.RULE?.blocksById.L5ST).toMatchObject({ itemOrder: ['AAAA', 'BBBB'] });
    const restored = structuredClone(result.draft);
    const list = restored.pagesById.RULE!.blocksById.L5ST!;
    if (list.kind !== 'list') {
      throw new Error('Expected List');
    }
    list.itemOrder.push('CCCC');
    list.itemsById.CCCC = { id: 'CCCC', name: 'Collect', text: 'Take spice.' };
    result = ready(manager.dispatch({ kind: 'replace-draft', draft: restored }));
    expect(result.operationError).toBeUndefined();
    expect(result.draft.pagesById.RULE?.blocksById.L5ST).toMatchObject({ itemsById: { CCCC: { name: 'Collect' } } });
  });

  it('preserves all new optional fields and heading visibility through Save', () => {
    const manager = createRulebookEditorStateManager(writtenRuleInput());
    const draft = structuredClone(ready(manager).draft);
    const page = draft.pagesById.RULE!;
    if (page.layoutId !== 'wide-narrow') {
      throw new Error('Expected written Page');
    }
    page.showHeading = false;
    Object.assign(page.blocksById.HEAD!, { factionId: 'fremen' });
    Object.assign(page.blocksById.TEXT!, { name: 'Movement' });
    Object.assign(page.blocksById.NTEE!, { variant: 'quotation', title: 'A warning', attribution: 'Stilgar' });
    Object.assign(page.blocksById.QNAA!, {
      topic: 'Storm',
      question: 'Can *_any force_* cross?',
      answer: 'Only when an ability permits it.',
    });
    const cover = draft.pagesById.CVER!;
    if (cover.layoutId !== 'cover') {
      throw new Error('Expected Cover');
    }
    cover.controlValues.cover = {
      artworkAssetId: 'storm-marker',
      subtitle: 'Dreamrules',
      supportingText: 'A _Dune_ rulebook.',
    };
    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    expect(request.contents.pagesById.RULE).toMatchObject({
      showHeading: false,
      blocksById: {
        HEAD: { factionId: 'fremen' },
        TEXT: { name: 'Movement' },
        NTEE: { variant: 'quotation', attribution: 'Stilgar' },
        QNAA: { topic: 'Storm' },
      },
    });
    expect(request.contents.pagesById.CVER).toMatchObject({
      controlValues: { cover: { artworkAssetId: 'storm-marker', subtitle: 'Dreamrules' } },
    });
  });

  it('keeps malformed question text editable while blocking Save and refuses arrangement changes', () => {
    const manager = createRulebookEditorStateManager(writtenRuleInput());
    let result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'block', pageId: 'RULE', blockId: 'QNAA' },
        field: 'question',
        value: 'An *unfinished question',
      })
    );
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.field === 'question')).toBe(true);
    result = ready(
      manager.dispatch({
        kind: 'set',
        target: { kind: 'page', pageId: 'RULE' },
        field: 'control-values',
        value: { widePosition: 'right' },
      })
    );
    expect(result.operationError).toMatch(/arrangement/i);
  });
});

it('requires review before restoring a named List item deleted by another author', () => {
  const input = writtenRuleInput();
  const manager = createRulebookEditorStateManager(input);
  manager.dispatch({
    kind: 'set',
    target: { kind: 'item', pageId: 'RULE', blockId: 'L5ST', itemId: 'AAAA' },
    field: 'name',
    value: 'Ship reserves',
  });
  const latest = structuredClone(input.latest);
  latest.revision = 'revision-2';
  const list = latest.contents.pagesById.RULE!.blocksById.L5ST!;
  if (list.kind !== 'list') {
    throw new Error('Expected List');
  }
  list.itemOrder = ['BBBB'];
  delete list.itemsById.AAAA;
  let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
  const difference = result.incompatibilities.find((entry) => entry.kind === 'deletion');
  expect(difference).toBeDefined();
  expect(result.canSave).toBe(false);
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
  expect(result.saveCandidate?.pagesById.RULE?.blocksById.L5ST).toMatchObject({
    itemOrder: ['AAAA', 'BBBB'],
    itemsById: { AAAA: { id: 'AAAA', name: 'Ship reserves', text: 'Pay spice.' } },
  });
});

it('resolves conflicting optional fields without replacing a cleared value with empty text', () => {
  const input = writtenRuleInput();
  const manager = createRulebookEditorStateManager(input);
  manager.dispatch({
    kind: 'set',
    target: { kind: 'item', pageId: 'RULE', blockId: 'L5ST', itemId: 'AAAA' },
    field: 'name',
    value: undefined,
  });
  const latest = structuredClone(input.latest);
  latest.revision = 'revision-2';
  const list = latest.contents.pagesById.RULE!.blocksById.L5ST!;
  if (list.kind !== 'list') {
    throw new Error('Expected List');
  }
  list.itemsById.AAAA!.name = 'Shipment';
  let result = ready(manager.dispatch({ kind: 'receive-latest', latest }));
  const difference = result.incompatibilities.find((entry) => entry.kind === 'field' && entry.field === 'name');
  expect(difference).toBeDefined();
  if (!difference) {
    throw new Error('Expected named item review');
  }
  result = ready(
    manager.dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: difference.id,
        dependencyFingerprint: difference.dependencyFingerprint,
        outcome: { kind: 'field-value', value: undefined },
      },
    })
  );
  expect(result.canSave).toBe(true);
  const saved = result.saveCandidate!.pagesById.RULE!.blocksById.L5ST!;
  if (saved.kind !== 'list') {
    throw new Error('Expected List');
  }
  expect(saved.itemsById.AAAA!.name).toBeUndefined();
});

describe('Cover plain-text edits', () => {
  it.each([
    ['supportingText', '• Foo', '- Foo'],
    ['supportingText', 'First line\n\nSecond line', 'First line\n\n\nSecond line'],
    ['subtitle', '• Foo', '- Foo'],
    ['title', '• Foo', '- Foo'],
  ] as const)('saves a literal %s change from %j to %j', (field, before, after) => {
    const input = writtenRuleInput();
    const savedCover = input.baseline.contents.pagesById.CVER!;
    if (savedCover.layoutId !== 'cover') {
      throw new Error('Expected Cover');
    }
    if (field === 'title') {
      savedCover.title = before;
    } else {
      savedCover.controlValues.cover[field] = before;
    }
    input.latest = structuredClone(input.baseline);
    const manager = createRulebookEditorStateManager(input);
    const draft = structuredClone(ready(manager).draft);
    const cover = draft.pagesById.CVER!;
    if (cover.layoutId !== 'cover') {
      throw new Error('Expected Cover');
    }
    if (field === 'title') {
      cover.title = after;
    } else {
      cover.controlValues.cover[field] = after;
    }

    const result = ready(manager.dispatch({ kind: 'replace-draft', draft }));
    expect(result.operationError).toBeUndefined();
    expect(result.canSave).toBe(true);
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    const requestCover = request.contents.pagesById.CVER!;
    if (requestCover.layoutId !== 'cover') {
      throw new Error('Expected Cover');
    }
    expect(field === 'title' ? requestCover.title : requestCover.controlValues.cover[field]).toBe(after);
    const saved = ready(
      manager.dispatch({ kind: 'save-succeeded', saved: { revision: 'revision-2', contents: request.contents } })
    );
    expect(saved.draft.pagesById.CVER).toEqual(requestCover);
    expect(saved.canSave).toBe(false);
  });
});
