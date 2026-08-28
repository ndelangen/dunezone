import { normalizeFormattedText } from '@shared/formattedText';
import type { RulebookContentsV1 } from '@shared/rulebooks/contents';
import { createRulebookEditorialStarterContents, createRulebookStarterContents } from '@shared/rulebooks/fixtures';

import { createRulebookEditorStateManager } from './-rulebookEditorState';
import type { RulebookEditorInput, RulebookEditPatchV1 } from './-rulebookEditorState';

const EMPTY_PATCH: RulebookEditPatchV1 = {
  schemaVersion: 1,
  baselineRevision: 'revision-1',
  creates: [],
  deletes: [],
  sets: [],
  placements: [],
  restorations: [],
};

function formattedText(source: string) {
  const normalized = normalizeFormattedText(source);
  if (!normalized.ok) {
    throw new Error(`Fixture text is invalid: ${source}`);
  }
  return normalized.value;
}

export function createRulebookSavedRevision(
  revision: string,
  amend?: (contents: RulebookContentsV1) => void
): RulebookEditorInput['baseline'] {
  const contents = structuredClone(createRulebookStarterContents());
  amend?.(contents);
  return { revision, contents };
}

export function createCleanRulebookEditorInput(): RulebookEditorInput {
  const baseline = createRulebookSavedRevision('revision-1');
  return {
    baseline,
    latest: structuredClone(baseline),
    patch: structuredClone(EMPTY_PATCH),
    resolutionLedger: [],
  };
}

export function createEditorialRulebookEditorInput(): RulebookEditorInput {
  const baseline = { revision: 'editorial-revision-1', contents: createRulebookEditorialStarterContents() };
  return {
    baseline,
    latest: structuredClone(baseline),
    patch: { ...structuredClone(EMPTY_PATCH), baselineRevision: baseline.revision },
    resolutionLedger: [],
  };
}

export function createCleanRebaseInput(): RulebookEditorInput {
  const input = createCleanRulebookEditorInput();
  const local = createRulebookEditorStateManager(input);
  local.dispatch({
    kind: 'set',
    target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
    field: 'text',
    value: 'A local introduction.',
  });
  const latest = createRulebookSavedRevision('revision-2', (contents) => {
    contents.pagesById.REFS!.anchor = 'quick-reference';
  });
  if (local.result.status !== 'ready') {
    throw new Error('Starter fixture must be supported');
  }
  return { baseline: input.baseline, latest, patch: local.result.rebasedPatch, resolutionLedger: [] };
}

export function createFieldConflictInput(): RulebookEditorInput {
  const input = createCleanRulebookEditorInput();
  const local = createRulebookEditorStateManager(input);
  local.dispatch({
    kind: 'set',
    target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
    field: 'text',
    value: 'The local opening.',
  });
  const latest = createRulebookSavedRevision('revision-2', (contents) => {
    const block = contents.pagesById.RULE?.blocksById.TEXT;
    if (block?.kind !== 'text') {
      throw new Error('Starter introduction must be a text Block');
    }
    block.text = formattedText('The saved opening.');
  });
  if (local.result.status !== 'ready') {
    throw new Error('Starter fixture must be supported');
  }
  return { baseline: input.baseline, latest, patch: local.result.rebasedPatch, resolutionLedger: [] };
}

export function createStaleSaveInput(): RulebookEditorInput {
  const input = createCleanRulebookEditorInput();
  const local = createRulebookEditorStateManager(input);
  local.dispatch({
    kind: 'set',
    target: { kind: 'block', pageId: 'RULE', blockId: 'TEXT' },
    field: 'text',
    value: 'Ready to save.',
  });
  if (local.result.status !== 'ready') {
    throw new Error('Starter fixture must be supported');
  }
  return { ...input, patch: local.result.rebasedPatch };
}
