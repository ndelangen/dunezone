export type BlockField = 'body' | 'title';
export type EditorId = 'alice' | 'bob';

export type RulebookBlock = {
  id: string;
  title: string;
  body: string;
};

export type RulebookPage = {
  id: string;
  title: string;
  blocks: RulebookBlock[];
};

export type RulebookDraft = {
  pages: RulebookPage[];
};

type LocatedBlock = {
  page: RulebookPage;
  block: RulebookBlock;
  beforeBlockId: string | null;
};

type ExpectedValue = { kind: 'missing' } | { kind: 'value'; value: string };
type ExpectedLocation = 'missing' | string | null;

type SetBlockFieldOperation = {
  id: string;
  kind: 'set-block-field';
  blockId: string;
  field: BlockField;
  value: string;
  expected: ExpectedValue;
  original: LocatedBlock;
};

type DeleteBlockOperation = {
  id: string;
  kind: 'delete-block';
  blockId: string;
  expected: LocatedBlock;
};

type MoveBlockOperation = {
  id: string;
  kind: 'move-block';
  blockId: string;
  beforeBlockId: string | null;
  expectedLocation: ExpectedLocation;
  original: LocatedBlock;
};

type DeletePageOperation = {
  id: string;
  kind: 'delete-page';
  pageId: string;
  expected: RulebookPage;
};

export type PatchOperation = DeleteBlockOperation | DeletePageOperation | MoveBlockOperation | SetBlockFieldOperation;

export type MergeConflict = {
  operationId: string;
  kind: 'delete-versus-change' | 'move-target-deleted' | 'remote-delete' | 'same-field' | 'same-node-move';
  message: string;
  saved: string;
  local: string;
};

export type EditorState = {
  id: EditorId;
  baselineDraft: RulebookDraft;
  baselineRevision: number;
  savedDraft: RulebookDraft;
  savedRevision: number;
  patch: PatchOperation[];
  conflicts: MergeConflict[];
  updatesPaused: boolean;
  nextOperationNumber: number;
};

export type PrototypeState = {
  sharedDraft: RulebookDraft;
  sharedRevision: number;
  activeEditorId: EditorId;
  editors: Record<EditorId, EditorState>;
  notice: string;
};

export type PrototypeAction =
  | { type: 'switch-editor'; editorId: EditorId }
  | { type: 'edit-block'; blockId: string; field: BlockField; value: string }
  | { type: 'delete-block'; blockId: string }
  | { type: 'move-block'; blockId: string; beforeBlockId: string | null }
  | { type: 'delete-page'; pageId: string }
  | { type: 'save' }
  | { type: 'resolve'; operationId: string; choice: 'mine' | 'saved' }
  | { type: 'toggle-updates' }
  | { type: 'sync' }
  | { type: 'reset' };

const INITIAL_DRAFT: RulebookDraft = {
  pages: [
    {
      id: 'page-001',
      title: 'Setup',
      blocks: [
        { id: 'intro', title: 'Before play', body: 'Choose factions and deal cards.' },
        { id: 'storm', title: 'Place the storm', body: 'Place the storm marker on sector zero.' },
        { id: 'spice', title: 'Place spice', body: 'Seed spice blows before the first round.' },
      ],
    },
    {
      id: 'page-002',
      title: 'Play',
      blocks: [
        { id: 'phases', title: 'Round phases', body: 'Resolve every phase in order.' },
        { id: 'victory', title: 'Victory', body: 'Check victory after the Mentat Pause.' },
      ],
    },
  ],
};

const clone = <T>(value: T): T => structuredClone(value);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function blockLocation(draft: RulebookDraft, blockId: string): LocatedBlock | null {
  for (const page of draft.pages) {
    const index = page.blocks.findIndex((block) => block.id === blockId);
    if (index >= 0) {
      return {
        page: clone(page),
        block: clone(page.blocks[index]!),
        beforeBlockId: page.blocks[index + 1]?.id ?? null,
      };
    }
  }
  return null;
}

function pageById(draft: RulebookDraft, pageId: string): RulebookPage | null {
  return draft.pages.find((page) => page.id === pageId) ?? null;
}

function sameBlockLocation(left: LocatedBlock, right: LocatedBlock): boolean {
  return left.page.id === right.page.id && left.beforeBlockId === right.beforeBlockId && same(left.block, right.block);
}

function insertBefore<T extends { id: string }>(items: T[], item: T, beforeId: string | null): void {
  const existingIndex = items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    items.splice(existingIndex, 1);
  }
  const requestedIndex = beforeId === null ? items.length : items.findIndex((entry) => entry.id === beforeId);
  items.splice(requestedIndex < 0 ? items.length : requestedIndex, 0, item);
}

function ensureOriginalBlock(draft: RulebookDraft, original: LocatedBlock): LocatedBlock {
  let page = pageById(draft, original.page.id);
  if (!page) {
    page = clone(original.page);
    const originalPageIndex = original.page.id === 'page-001' ? 0 : draft.pages.length;
    draft.pages.splice(originalPageIndex, 0, page);
  }
  let located = blockLocation(draft, original.block.id);
  if (!located) {
    insertBefore(page.blocks, clone(original.block), original.beforeBlockId);
    located = blockLocation(draft, original.block.id);
  }
  return located!;
}

function applyIntent(draft: RulebookDraft, operation: PatchOperation): RulebookDraft {
  const next = clone(draft);
  if (operation.kind === 'set-block-field') {
    const located = blockLocation(next, operation.blockId) ?? ensureOriginalBlock(next, operation.original);
    const page = pageById(next, located.page.id)!;
    const block = page.blocks.find((entry) => entry.id === operation.blockId)!;
    block[operation.field] = operation.value;
  } else if (operation.kind === 'delete-block') {
    for (const page of next.pages) {
      page.blocks = page.blocks.filter((block) => block.id !== operation.blockId);
    }
  } else if (operation.kind === 'move-block') {
    const located = blockLocation(next, operation.blockId) ?? ensureOriginalBlock(next, operation.original);
    const page = pageById(next, located.page.id)!;
    const block = page.blocks.find((entry) => entry.id === operation.blockId)!;
    insertBefore(page.blocks, block, operation.beforeBlockId);
  } else {
    next.pages = next.pages.filter((page) => page.id !== operation.pageId);
  }
  return next;
}

export function editorCanvas(editor: EditorState): RulebookDraft {
  const base = editor.conflicts.length > 0 ? editor.baselineDraft : editor.savedDraft;
  return editor.patch.reduce(applyIntent, clone(base));
}

function operationSummary(operation: PatchOperation): string {
  if (operation.kind === 'set-block-field') {
    return `${operation.id}: set ${operation.blockId}.${operation.field} = ${JSON.stringify(operation.value)}`;
  }
  if (operation.kind === 'delete-block') {
    return `${operation.id}: delete block ${operation.blockId}`;
  }
  if (operation.kind === 'move-block') {
    return `${operation.id}: move ${operation.blockId} before ${operation.beforeBlockId ?? 'end'}`;
  }
  return `${operation.id}: delete page ${operation.pageId}`;
}

export { operationSummary };

function conflictFor(operation: PatchOperation, savedDraft: RulebookDraft): MergeConflict | null | 'redundant' {
  if (operation.kind === 'set-block-field') {
    const saved = blockLocation(savedDraft, operation.blockId);
    if (!saved) {
      if (operation.expected.kind === 'missing') {
        return null;
      }
      return {
        operationId: operation.id,
        kind: 'remote-delete',
        message: `${operation.blockId} was deleted while its ${operation.field} was edited locally.`,
        saved: 'deleted',
        local: operation.value,
      };
    }
    const actual = saved.block[operation.field];
    if (operation.expected.kind === 'missing' || actual !== operation.expected.value) {
      if (actual === operation.value) {
        return 'redundant';
      }
      return {
        operationId: operation.id,
        kind: 'same-field',
        message: `${operation.blockId}.${operation.field} changed in both editors.`,
        saved: actual,
        local: operation.value,
      };
    }
    return null;
  }

  if (operation.kind === 'delete-block') {
    const saved = blockLocation(savedDraft, operation.blockId);
    if (!saved) {
      return 'redundant';
    }
    if (!sameBlockLocation(saved, operation.expected)) {
      return {
        operationId: operation.id,
        kind: 'delete-versus-change',
        message: `${operation.blockId} changed or moved after the local deletion.`,
        saved: `${saved.block.title} before ${saved.beforeBlockId ?? 'end'}`,
        local: 'delete block',
      };
    }
    return null;
  }

  if (operation.kind === 'move-block') {
    const saved = blockLocation(savedDraft, operation.blockId);
    if (!saved) {
      if (operation.expectedLocation === 'missing') {
        return null;
      }
      return {
        operationId: operation.id,
        kind: 'remote-delete',
        message: `${operation.blockId} was deleted after it was moved locally.`,
        saved: 'deleted',
        local: `move before ${operation.beforeBlockId ?? 'end'}`,
      };
    }
    const target = operation.beforeBlockId === null ? null : blockLocation(savedDraft, operation.beforeBlockId);
    if (operation.beforeBlockId !== null && (!target || target.page.id !== saved.page.id)) {
      return {
        operationId: operation.id,
        kind: 'move-target-deleted',
        message: `The target ${operation.beforeBlockId} was deleted after ${operation.blockId} was moved locally.`,
        saved: `${operation.beforeBlockId} deleted`,
        local: `move before ${operation.beforeBlockId}`,
      };
    }
    if (operation.expectedLocation !== 'missing' && saved.beforeBlockId !== operation.expectedLocation) {
      if (saved.beforeBlockId === operation.beforeBlockId) {
        return 'redundant';
      }
      return {
        operationId: operation.id,
        kind: 'same-node-move',
        message: `${operation.blockId} was moved to different positions in both editors.`,
        saved: `before ${saved.beforeBlockId ?? 'end'}`,
        local: `before ${operation.beforeBlockId ?? 'end'}`,
      };
    }
    return null;
  }

  const savedPage = pageById(savedDraft, operation.pageId);
  if (!savedPage) {
    return 'redundant';
  }
  if (!same(savedPage, operation.expected)) {
    return {
      operationId: operation.id,
      kind: 'delete-versus-change',
      message: `${operation.pageId} changed after the local page deletion.`,
      saved: `${savedPage.blocks.length} blocks, title ${JSON.stringify(savedPage.title)}`,
      local: 'delete page',
    };
  }
  return null;
}

function rebaseEditor(editor: EditorState, savedDraft: RulebookDraft, savedRevision: number): EditorState {
  const patch: PatchOperation[] = [];
  const conflicts: MergeConflict[] = [];
  for (const operation of editor.patch) {
    const result = conflictFor(operation, savedDraft);
    if (result === 'redundant') {
      continue;
    }
    patch.push(operation);
    if (result) {
      conflicts.push(result);
    }
  }
  const baselineDraft = conflicts.length > 0 ? editor.baselineDraft : savedDraft;
  const baselineRevision = conflicts.length > 0 ? editor.baselineRevision : savedRevision;
  return {
    ...editor,
    baselineDraft: clone(baselineDraft),
    baselineRevision,
    savedDraft: clone(savedDraft),
    savedRevision,
    patch,
    conflicts,
  };
}

function emptyEditor(id: EditorId): EditorState {
  return {
    id,
    baselineDraft: clone(INITIAL_DRAFT),
    baselineRevision: 1,
    savedDraft: clone(INITIAL_DRAFT),
    savedRevision: 1,
    patch: [],
    conflicts: [],
    updatesPaused: false,
    nextOperationNumber: 1,
  };
}

export function initialPrototypeState(): PrototypeState {
  return {
    sharedDraft: clone(INITIAL_DRAFT),
    sharedRevision: 1,
    activeEditorId: 'alice',
    editors: { alice: emptyEditor('alice'), bob: emptyEditor('bob') },
    notice: 'Both editors opened revision 1.',
  };
}

function activeEditor(state: PrototypeState): EditorState {
  return state.editors[state.activeEditorId];
}

function replaceActiveEditor(state: PrototypeState, editor: EditorState, notice: string): PrototypeState {
  return {
    ...state,
    editors: { ...state.editors, [state.activeEditorId]: editor },
    notice,
  };
}

function nextOperation(editor: EditorState): [string, EditorState] {
  return [
    `${editor.id[0]}-${editor.nextOperationNumber}`,
    { ...editor, nextOperationNumber: editor.nextOperationNumber + 1 },
  ];
}

function editBlock(state: PrototypeState, blockId: string, field: BlockField, value: string): PrototypeState {
  let editor = activeEditor(state);
  if (editor.conflicts.length > 0) {
    return { ...state, notice: 'Resolve current conflicts before adding another local operation in this prototype.' };
  }
  const saved = blockLocation(editor.savedDraft, blockId);
  if (!saved) {
    return { ...state, notice: `Block ${blockId} is not in this editor's saved draft.` };
  }
  const existingIndex = editor.patch.findIndex(
    (operation) => operation.kind === 'set-block-field' && operation.blockId === blockId && operation.field === field
  );
  if (existingIndex >= 0) {
    const patch = [...editor.patch];
    patch[existingIndex] = { ...(patch[existingIndex] as SetBlockFieldOperation), value };
    editor = { ...editor, patch };
  } else {
    let id: string;
    [id, editor] = nextOperation(editor);
    editor = {
      ...editor,
      patch: [
        ...editor.patch,
        {
          id,
          kind: 'set-block-field',
          blockId,
          field,
          value,
          expected: { kind: 'value', value: saved.block[field] },
          original: saved,
        },
      ],
    };
  }
  return replaceActiveEditor(state, editor, `${editor.id} changed ${blockId}.${field} locally.`);
}

function deleteBlock(state: PrototypeState, blockId: string): PrototypeState {
  let editor = activeEditor(state);
  if (editor.conflicts.length > 0) {
    return { ...state, notice: 'Resolve current conflicts before adding another local operation in this prototype.' };
  }
  const saved = blockLocation(editor.savedDraft, blockId);
  if (!saved) {
    return { ...state, notice: `Block ${blockId} is already absent from this editor's saved draft.` };
  }
  let id: string;
  [id, editor] = nextOperation(editor);
  const patch = editor.patch.filter(
    (operation) => !(operation.kind !== 'delete-page' && 'blockId' in operation && operation.blockId === blockId)
  );
  editor = { ...editor, patch: [...patch, { id, kind: 'delete-block', blockId, expected: saved }] };
  return replaceActiveEditor(state, editor, `${editor.id} deleted ${blockId} locally.`);
}

function moveBlock(state: PrototypeState, blockId: string, beforeBlockId: string | null): PrototypeState {
  let editor = activeEditor(state);
  if (editor.conflicts.length > 0) {
    return { ...state, notice: 'Resolve current conflicts before adding another local operation in this prototype.' };
  }
  const saved = blockLocation(editor.savedDraft, blockId);
  if (!saved) {
    return { ...state, notice: `Block ${blockId} is not in this editor's saved draft.` };
  }
  if (beforeBlockId === blockId) {
    return { ...state, notice: 'A block cannot move before itself.' };
  }
  if (beforeBlockId !== null) {
    const target = blockLocation(editor.savedDraft, beforeBlockId);
    if (!target || target.page.id !== saved.page.id) {
      return { ...state, notice: `Move target ${beforeBlockId} is not on the same page.` };
    }
  }
  let id: string;
  [id, editor] = nextOperation(editor);
  const patch = editor.patch.filter((operation) => !(operation.kind === 'move-block' && operation.blockId === blockId));
  editor = {
    ...editor,
    patch: [
      ...patch,
      { id, kind: 'move-block', blockId, beforeBlockId, expectedLocation: saved.beforeBlockId, original: saved },
    ],
  };
  return replaceActiveEditor(state, editor, `${editor.id} moved ${blockId} locally.`);
}

function deletePage(state: PrototypeState, pageId: string): PrototypeState {
  let editor = activeEditor(state);
  if (editor.conflicts.length > 0) {
    return { ...state, notice: 'Resolve current conflicts before adding another local operation in this prototype.' };
  }
  const page = pageById(editor.savedDraft, pageId);
  if (!page) {
    return { ...state, notice: `Page ${pageId} is already absent from this editor's saved draft.` };
  }
  let id: string;
  [id, editor] = nextOperation(editor);
  const blockIds = new Set(page.blocks.map((block) => block.id));
  const patch = editor.patch.filter(
    (operation) => operation.kind === 'delete-page' || !('blockId' in operation) || !blockIds.has(operation.blockId)
  );
  editor = { ...editor, patch: [...patch, { id, kind: 'delete-page', pageId, expected: clone(page) }] };
  return replaceActiveEditor(state, editor, `${editor.id} deleted ${pageId} locally.`);
}

function save(state: PrototypeState): PrototypeState {
  const editor = activeEditor(state);
  if (editor.conflicts.length > 0) {
    return { ...state, notice: `${editor.id} cannot save until every conflict is resolved.` };
  }
  if (editor.patch.length === 0) {
    return { ...state, notice: `${editor.id} has no local changes to save.` };
  }
  if (editor.savedRevision !== state.sharedRevision) {
    const rebased = rebaseEditor(editor, state.sharedDraft, state.sharedRevision);
    return replaceActiveEditor(
      state,
      rebased,
      `Save rejected as stale. ${editor.id} rebased revision ${editor.savedRevision} onto ${state.sharedRevision}.`
    );
  }

  const sharedDraft = editor.patch.reduce(applyIntent, clone(state.sharedDraft));
  const sharedRevision = state.sharedRevision + 1;
  const editors = { ...state.editors };
  editors[editor.id] = {
    ...editor,
    baselineDraft: clone(sharedDraft),
    baselineRevision: sharedRevision,
    savedDraft: clone(sharedDraft),
    savedRevision: sharedRevision,
    patch: [],
    conflicts: [],
  };
  const otherId: EditorId = editor.id === 'alice' ? 'bob' : 'alice';
  if (!editors[otherId].updatesPaused) {
    editors[otherId] = rebaseEditor(editors[otherId], sharedDraft, sharedRevision);
  }
  return {
    ...state,
    sharedDraft,
    sharedRevision,
    editors,
    notice: `${editor.id} saved revision ${sharedRevision}. ${otherId} ${editors[otherId].updatesPaused ? 'did not receive it.' : 'rebased onto it.'}`,
  };
}

function acceptMine(operation: PatchOperation, savedDraft: RulebookDraft): PatchOperation | null {
  if (operation.kind === 'set-block-field') {
    const saved = blockLocation(savedDraft, operation.blockId);
    return {
      ...operation,
      expected: saved ? { kind: 'value', value: saved.block[operation.field] } : { kind: 'missing' },
      original: saved ?? operation.original,
    };
  }
  if (operation.kind === 'delete-block') {
    const saved = blockLocation(savedDraft, operation.blockId);
    return saved ? { ...operation, expected: saved } : null;
  }
  if (operation.kind === 'move-block') {
    const saved = blockLocation(savedDraft, operation.blockId);
    const targetStillExists = operation.beforeBlockId === null || blockLocation(savedDraft, operation.beforeBlockId);
    return {
      ...operation,
      beforeBlockId: targetStillExists ? operation.beforeBlockId : null,
      expectedLocation: saved ? saved.beforeBlockId : 'missing',
      original: saved ?? operation.original,
    };
  }
  const saved = pageById(savedDraft, operation.pageId);
  return saved ? { ...operation, expected: clone(saved) } : null;
}

function resolve(state: PrototypeState, operationId: string, choice: 'mine' | 'saved'): PrototypeState {
  const editor = activeEditor(state);
  if (!editor.conflicts.some((conflict) => conflict.operationId === operationId)) {
    return { ...state, notice: `Conflict ${operationId} is not open for ${editor.id}.` };
  }
  const patch = editor.patch.flatMap((operation) => {
    if (operation.id !== operationId) {
      return [operation];
    }
    if (choice === 'saved') {
      return [];
    }
    const accepted = acceptMine(operation, editor.savedDraft);
    return accepted ? [accepted] : [];
  });
  const rebased = rebaseEditor({ ...editor, patch }, editor.savedDraft, editor.savedRevision);
  return replaceActiveEditor(state, rebased, `${editor.id} chose ${choice} for ${operationId}.`);
}

export function reducePrototype(state: PrototypeState, action: PrototypeAction): PrototypeState {
  if (action.type === 'reset') {
    return initialPrototypeState();
  }
  if (action.type === 'switch-editor') {
    return { ...state, activeEditorId: action.editorId, notice: `Active editor is now ${action.editorId}.` };
  }
  if (action.type === 'edit-block') {
    return editBlock(state, action.blockId, action.field, action.value);
  }
  if (action.type === 'delete-block') {
    return deleteBlock(state, action.blockId);
  }
  if (action.type === 'move-block') {
    return moveBlock(state, action.blockId, action.beforeBlockId);
  }
  if (action.type === 'delete-page') {
    return deletePage(state, action.pageId);
  }
  if (action.type === 'save') {
    return save(state);
  }
  if (action.type === 'resolve') {
    return resolve(state, action.operationId, action.choice);
  }
  if (action.type === 'toggle-updates') {
    const editor = activeEditor(state);
    return replaceActiveEditor(
      state,
      { ...editor, updatesPaused: !editor.updatesPaused },
      `${editor.id} ${editor.updatesPaused ? 'resumed' : 'paused'} incoming draft updates.`
    );
  }
  const editor = activeEditor(state);
  if (editor.savedRevision === state.sharedRevision) {
    return { ...state, notice: `${editor.id} already has revision ${state.sharedRevision}.` };
  }
  const synced = rebaseEditor(editor, state.sharedDraft, state.sharedRevision);
  return replaceActiveEditor(state, synced, `${editor.id} received revision ${state.sharedRevision} and rebased.`);
}
