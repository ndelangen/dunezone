import { normalizeFormattedText } from '@shared/formattedText';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookContentsV1 } from '@shared/rulebooks/contents';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult } from './rulebookEditorState';

function formattedText(source: string) {
  const normalized = normalizeFormattedText(source);
  if (!normalized.ok) {
    throw new Error(`Fixture text is invalid: ${source}`);
  }
  return normalized.value;
}

export function createRulebookSavedRevision(revision: string, amend?: (contents: RulebookContentsV1) => void) {
  const contents = structuredClone(createRulebookStarterContents());
  amend?.(contents);
  return { revision, contents };
}

export function createCleanRulebookEditorInput() {
  return createRulebookSavedRevision('revision-1');
}

/** The action the route sends for every field edit: the whole draft, copied from a ready result and changed. */
export function replaceDraft(result: RulebookEditorResult, change: (draft: RulebookContentsDraftV1) => void) {
  if (result.status !== 'ready') {
    throw new Error('Only a ready editor has a draft to change');
  }
  const draft = structuredClone(result.draft);
  change(draft);
  return { kind: 'replace-draft', draft } as const;
}

function isBlockOfKind<Kind extends RulebookBlockDraft['kind']>(
  block: RulebookBlockDraft | undefined,
  kind: Kind
): block is Extract<RulebookBlockDraft, { kind: Kind }> {
  return block?.kind === kind;
}

export function draftBlock<Kind extends RulebookBlockDraft['kind']>(
  draft: RulebookContentsDraftV1,
  pageId: string,
  blockId: string,
  kind: Kind
) {
  const block = draft.pagesById[pageId]?.blocksById[blockId];
  if (!isBlockOfKind(block, kind)) {
    throw new Error(`Block ${pageId}/${blockId} is not a ${kind} Block`);
  }
  return block;
}

function editIntroduction(text: string) {
  const manager = createRulebookEditorStateManager(createCleanRulebookEditorInput());
  manager.dispatch(
    replaceDraft(manager.result, (draft) => {
      draftBlock(draft, 'RULE', 'TEXT', 'text').text = text;
    })
  );
  return manager;
}

export function createCleanRebaseEditor() {
  const manager = editIntroduction('A local introduction.');
  const latest = createRulebookSavedRevision('revision-2', (contents) => {
    contents.pagesById.REFS!.anchor = 'quick-reference';
  });
  manager.dispatch({ kind: 'receive-latest', latest });
  return manager;
}

export function createFieldConflictEditor() {
  const manager = editIntroduction('The local opening.');
  const latest = createRulebookSavedRevision('revision-2', (contents) => {
    const block = contents.pagesById.RULE?.blocksById.TEXT;
    if (block?.kind !== 'text') {
      throw new Error('Starter introduction must be a text Block');
    }
    block.text = formattedText('The saved opening.');
  });
  manager.dispatch({ kind: 'receive-latest', latest });
  return manager;
}

export function createStaleSaveEditor() {
  return editIntroduction('Ready to save.');
}
