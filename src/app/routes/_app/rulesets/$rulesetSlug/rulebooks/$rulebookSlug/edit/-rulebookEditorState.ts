import { normalizeFormattedText } from '@shared/formattedText';
import {
  rulebookAnchorSchema,
  rulebookContentsV1Schema,
  rulebookDraftEntitySchemas,
  rulebookLayoutCatalogue,
} from '@shared/rulebooks/contents';
import type {
  RulebookBlockDraft,
  RulebookContentsDraftV1,
  RulebookContentsV1,
  RulebookPageDraft,
  RulebookSlotId,
} from '@shared/rulebooks/contents';
import { graphemeSegments } from 'unicode-segmenter/grapheme';
import { z } from 'zod';

import { compareCanonicalText, planAtomicPlacementBatch } from './-rulebookPlacement';

type SavedRulebookRevision = {
  readonly revision: string;
  readonly contents: RulebookContentsV1;
};

const entityIdSchema = z.string().min(1);
const pageRefSchema = z.strictObject({ kind: z.literal('page'), pageId: entityIdSchema });
const blockRefSchema = z.strictObject({ kind: z.literal('block'), blockId: entityIdSchema });
const itemRefSchema = z.strictObject({
  kind: z.literal('item'),
  blockId: entityIdSchema,
  itemId: entityIdSchema,
});
const entityRefSchema = z.discriminatedUnion('kind', [pageRefSchema, blockRefSchema, itemRefSchema]);
type RulebookEntityRef = z.infer<typeof entityRefSchema>;

const slotIds = rulebookLayoutCatalogue.flatMap(({ slots }) => slots.map(({ id }) => id)) as [
  RulebookSlotId,
  ...RulebookSlotId[],
];
const orderedContainerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('page-order') }),
  z.strictObject({
    kind: z.literal('page-slot'),
    pageId: entityIdSchema,
    slotId: z.enum(slotIds),
  }),
  z.strictObject({ kind: z.literal('item-order'), blockId: entityIdSchema }),
]);
type RulebookOrderedContainerRef = z.infer<typeof orderedContainerSchema>;

const placementSchema = z.strictObject({
  container: orderedContainerSchema,
  afterId: entityIdSchema.nullable(),
  beforeId: entityIdSchema.nullable(),
});
type RulebookPlacement = z.infer<typeof placementSchema>;

const newEntitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('page'), page: rulebookDraftEntitySchemas.page }),
  z.strictObject({ kind: z.literal('block'), block: rulebookDraftEntitySchemas.block }),
  z.strictObject({
    kind: z.literal('item'),
    blockId: entityIdSchema,
    item: rulebookDraftEntitySchemas.item,
  }),
]);
type RulebookNewEntity = z.infer<typeof newEntitySchema>;

const draftSubtreeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('page'),
    page: rulebookDraftEntitySchemas.page,
    blocksById: z.record(entityIdSchema, rulebookDraftEntitySchemas.block),
  }),
  z.strictObject({ kind: z.literal('block'), block: rulebookDraftEntitySchemas.block }),
  z.strictObject({
    kind: z.literal('item'),
    blockId: entityIdSchema,
    item: rulebookDraftEntitySchemas.item,
  }),
]);
type RulebookDraftSubtree = z.infer<typeof draftSubtreeSchema>;

const createIntentSchema = z.strictObject({
  kind: z.literal('create'),
  entity: newEntitySchema,
  placement: placementSchema,
});
type RulebookCreateIntent = z.infer<typeof createIntentSchema>;

const deleteIntentSchema = z.strictObject({
  kind: z.literal('delete'),
  root: entityRefSchema,
  deletedRefs: z.array(entityRefSchema),
});
type RulebookDeleteIntent = z.infer<typeof deleteIntentSchema>;

const setIntentSchema = z.union([
  z.strictObject({ kind: z.literal('set'), target: pageRefSchema, field: z.literal('anchor'), value: z.string() }),
  z.strictObject({
    kind: z.literal('set'),
    target: blockRefSchema,
    field: z.literal('anchor'),
    value: z.string().optional(),
  }),
  z.strictObject({ kind: z.literal('set'), target: blockRefSchema, field: z.literal('text'), value: z.string() }),
  z.strictObject({ kind: z.literal('set'), target: itemRefSchema, field: z.literal('text'), value: z.string() }),
]);
type RulebookSetIntent = z.infer<typeof setIntentSchema>;

const placeIntentSchema = z.strictObject({
  kind: z.literal('place'),
  target: entityRefSchema,
  original: placementSchema,
  destination: placementSchema,
});
type RulebookPlaceIntent = z.infer<typeof placeIntentSchema>;

const restoreIntentSchema = z.strictObject({
  kind: z.literal('restore'),
  root: entityRefSchema,
  snapshot: draftSubtreeSchema,
  placement: placementSchema,
});
type RulebookRestoreIntent = z.infer<typeof restoreIntentSchema>;

const rulebookEditPatchV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    baselineRevision: z.string().min(1),
    creates: z.array(createIntentSchema),
    deletes: z.array(deleteIntentSchema),
    sets: z.array(setIntentSchema),
    placements: z.array(placeIntentSchema),
    restorations: z.array(restoreIntentSchema),
  })
  .superRefine((patch, context) => {
    const concerns = [
      ['creates', patch.creates.map(({ entity }) => entityRefKey(entityForNew(entity)))],
      ['deletes', patch.deletes.map(({ root }) => entityRefKey(root))],
      ['sets', patch.sets.map((intent) => `${entityRefKey(intent.target)}:${intent.field}`)],
      ['placements', patch.placements.map(({ target }) => entityRefKey(target))],
      ['restorations', patch.restorations.map(({ root }) => entityRefKey(root))],
    ] as const;
    for (const [name, keys] of concerns) {
      if (new Set(keys).size !== keys.length) {
        context.addIssue({ code: 'custom', path: [name], message: `${name} must contain one concern per identity` });
      }
      if ([...keys].sort(compareCanonicalText).some((key, index) => key !== keys[index])) {
        context.addIssue({ code: 'custom', path: [name], message: `${name} must use canonical identity order` });
      }
    }
    const deletedIdentityKeys: string[] = [];
    for (const deletion of patch.deletes) {
      const keys = deletion.deletedRefs.map(entityRefKey);
      deletedIdentityKeys.push(...keys);
      if (!keys.includes(entityRefKey(deletion.root))) {
        context.addIssue({ code: 'custom', path: ['deletes'], message: 'Every deletion must contain its root' });
      }
      if (
        new Set(keys).size !== keys.length ||
        [...keys].sort(compareCanonicalText).some((key, index) => key !== keys[index])
      ) {
        context.addIssue({
          code: 'custom',
          path: ['deletes'],
          message: 'Deletion identities must be unique and canonically ordered',
        });
      }
    }
    if (new Set(deletedIdentityKeys).size !== deletedIdentityKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['deletes'],
        message: 'An identity may belong to only one reviewed deletion',
      });
    }

    const createdIdentityKeys = patch.creates.map(({ entity }) => entityRefKey(entityForNew(entity)));
    const restoredIdentityKeys = patch.restorations.flatMap(({ snapshot }) => snapshotRefs(snapshot).map(entityRefKey));
    const setIdentityKeys = new Set(patch.sets.map(({ target }) => entityRefKey(target)));
    const placedIdentityKeys = new Set(patch.placements.map(({ target }) => entityRefKey(target)));
    const deletedIdentityKeySet = new Set(deletedIdentityKeys);
    const createdIdentityKeySet = new Set(createdIdentityKeys);
    const restoredIdentityKeySet = new Set(restoredIdentityKeys);

    if (new Set(restoredIdentityKeys).size !== restoredIdentityKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['restorations'],
        message: 'An identity may belong to only one restoration snapshot',
      });
    }
    for (const key of new Set([...createdIdentityKeys, ...restoredIdentityKeys, ...deletedIdentityKeys])) {
      if (
        (createdIdentityKeySet.has(key) || restoredIdentityKeySet.has(key)) &&
        (setIdentityKeys.has(key) || placedIdentityKeys.has(key))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sets'],
          message: 'Creation and restoration payloads must own their field and placement concerns',
        });
      }
      if (
        deletedIdentityKeySet.has(key) &&
        (createdIdentityKeySet.has(key) ||
          restoredIdentityKeySet.has(key) ||
          setIdentityKeys.has(key) ||
          placedIdentityKeys.has(key))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['deletes'],
          message: 'A reviewed deletion must supersede every other concern for its identities',
        });
      }
      if (createdIdentityKeySet.has(key) && restoredIdentityKeySet.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['restorations'],
          message: 'Create and restore are mutually exclusive for one identity',
        });
      }
    }
    const placementConcerns = [
      ...patch.creates.map((intent) => ({
        target: entityForNew(intent.entity),
        placements: [intent.placement],
      })),
      ...patch.placements.map((intent) => ({
        target: intent.target,
        placements: [intent.original, intent.destination],
      })),
      ...patch.restorations.map((intent) => ({ target: intent.root, placements: [intent.placement] })),
    ];
    for (const { target, placements } of placementConcerns) {
      for (const placement of placements) {
        if (!containerAccepts(placement.container, target)) {
          context.addIssue({
            code: 'custom',
            path: ['placements'],
            message: 'A placement container must accept its target identity kind',
          });
        }
        if (placement.afterId !== null && placement.afterId === placement.beforeId) {
          context.addIssue({
            code: 'custom',
            path: ['placements'],
            message: 'Placement neighbors must identify two different boundaries',
          });
        }
      }
    }
    const exclusive = new Set<string>();
    for (const [name, keys] of concerns.filter(
      ([name]) => name === 'creates' || name === 'deletes' || name === 'restorations'
    )) {
      for (const key of keys) {
        if (exclusive.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [name],
            message: 'Create, delete, and restore are mutually exclusive for one identity',
          });
        }
        exclusive.add(key);
      }
    }
  });

export type RulebookEditPatchV1 = z.infer<typeof rulebookEditPatchV1Schema>;

type RulebookFieldDiagnostic = {
  readonly target?: RulebookEntityRef;
  readonly field?: 'anchor' | 'text' | 'structure';
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly offset?: number;
};

type RulebookIncompatibilityBase = {
  readonly id: string;
  readonly dependencyFingerprint: string;
};

type RulebookFieldIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'field';
  readonly target: RulebookEntityRef;
  readonly field: 'anchor' | 'text';
  readonly baselineValue?: string;
  readonly latestValue?: string;
  readonly localValue?: string;
  readonly combinedText?: string;
};

type RulebookAnchorIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'anchor';
  readonly target: RulebookEntityRef;
  readonly value: string;
  readonly collidesWith: RulebookEntityRef;
  readonly suggestedValue: string;
};

type RulebookPlacementIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'placement';
  readonly target: RulebookEntityRef;
  readonly baseline?: RulebookPlacement;
  readonly latest?: RulebookPlacement;
  readonly local: RulebookPlacement;
  readonly reason: 'competing-move' | 'missing-neighbor' | 'cross-container-neighbor';
};

type RulebookOrderingIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'collection-order';
  readonly container: RulebookOrderedContainerRef;
  readonly latestOrder: readonly string[];
  readonly localOrder: readonly string[];
};

type RulebookDeletionIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'deletion';
  readonly direction: 'saved-deletion' | 'local-deletion';
  readonly root: RulebookEntityRef;
  readonly affectedRefs: readonly RulebookEntityRef[];
  readonly localRestorations?: readonly RulebookRestoreIntent[];
};

type RulebookIncompatibility =
  | RulebookFieldIncompatibility
  | RulebookAnchorIncompatibility
  | RulebookPlacementIncompatibility
  | RulebookOrderingIncompatibility
  | RulebookDeletionIncompatibility;

type RulebookResolutionOutcome =
  | { readonly kind: 'anchor'; readonly value?: string }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'placement'; readonly destination: RulebookPlacement }
  | {
      readonly kind: 'collection-order';
      readonly container: RulebookOrderedContainerRef;
      readonly orderedIds: readonly string[];
    }
  | { readonly kind: 'accept-saved-deletion' }
  | { readonly kind: 'restore-local-subtree' }
  | { readonly kind: 'keep-local-deletion' }
  | { readonly kind: 'accept-latest-subtree' };

type RulebookResolutionApproval = {
  readonly incompatibilityId: string;
  readonly dependencyFingerprint: string;
  readonly outcome: RulebookResolutionOutcome;
};

export type RulebookEditorInput = {
  readonly baseline: SavedRulebookRevision;
  readonly latest: SavedRulebookRevision;
  readonly patch: RulebookEditPatchV1;
  readonly resolutionLedger: readonly RulebookResolutionApproval[];
};

type RulebookEditorReadyResult = {
  readonly status: 'ready';
  readonly draft: RulebookContentsDraftV1;
  readonly comparisonDraft: RulebookContentsDraftV1;
  readonly latest: SavedRulebookRevision;
  readonly diagnostics: readonly RulebookFieldDiagnostic[];
  readonly saveCandidate?: RulebookContentsV1;
  readonly incompatibilities: readonly RulebookIncompatibility[];
  readonly resolutionLedger: readonly RulebookResolutionApproval[];
  readonly rebasedPatch: RulebookEditPatchV1;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly saveRequest?: {
    readonly expectedRevision: string;
    readonly contents: RulebookContentsV1;
  };
  readonly operationError?: string;
};

type RulebookEditorUnsupportedResult = {
  readonly status: 'unsupported';
  readonly received: unknown;
  readonly message: string;
  readonly canSave: false;
  readonly isSaving: false;
};

export type RulebookEditorResult = RulebookEditorReadyResult | RulebookEditorUnsupportedResult;

type RulebookEditorAction =
  | RulebookCreateIntent
  | Omit<RulebookDeleteIntent, 'deletedRefs'>
  | RulebookSetIntent
  | Omit<RulebookPlaceIntent, 'original'>
  | { readonly kind: 'replace-draft'; readonly draft: RulebookContentsDraftV1 }
  | { readonly kind: 'receive-latest'; readonly latest: SavedRulebookRevision }
  | { readonly kind: 'resolve'; readonly approval: RulebookResolutionApproval }
  | { readonly kind: 'begin-save' }
  | { readonly kind: 'save-succeeded'; readonly saved: SavedRulebookRevision }
  | { readonly kind: 'save-stale'; readonly latest: SavedRulebookRevision };

export type RulebookEditorStateManager = {
  readonly result: RulebookEditorResult;
  dispatch(action: RulebookEditorAction): RulebookEditorResult;
};

type ReadyState = {
  baseline: SavedRulebookRevision;
  latest: SavedRulebookRevision;
  draft: RulebookContentsDraftV1;
  patch: RulebookEditPatchV1;
  ledger: RulebookResolutionApproval[];
  knownPageLayouts: Record<string, { layoutId: string; slotIds: string[] }>;
  isSaving: boolean;
  saveInFlight?: {
    revision: string;
    contents: RulebookContentsV1;
  };
  operationError?: string;
};

function pageLayoutMemory(contents: RulebookContentsDraftV1): ReadyState['knownPageLayouts'] {
  return Object.fromEntries(
    Object.values(contents.pagesById).map((page) => [
      page.id,
      { layoutId: page.layoutId, slotIds: Object.keys(page.slots).sort(compareCanonicalText) },
    ])
  );
}

function rememberPageLayouts(state: ReadyState, contents: RulebookContentsDraftV1): void {
  Object.assign(state.knownPageLayouts, pageLayoutMemory(contents));
}

function immutableLayoutError(
  knownLayouts: ReadyState['knownPageLayouts'],
  contents: RulebookContentsDraftV1
): string | undefined {
  for (const page of Object.values(contents.pagesById)) {
    const known = knownLayouts[page.id];
    const slotIds = Object.keys(page.slots).sort(compareCanonicalText);
    if (known && (known.layoutId !== page.layoutId || known.slotIds.join('\u0000') !== slotIds.join('\u0000'))) {
      return `Page ${page.id} cannot change its issued layout or slot shape`;
    }
  }
  return undefined;
}

type FieldRecord = {
  target: RulebookEntityRef;
  field: 'anchor' | 'text';
  value?: string;
};

type PlacementRequest = {
  target: RulebookEntityRef;
  destination: RulebookPlacement;
};

type PlacementBatchFailure =
  | {
      kind: 'placement';
      request: PlacementRequest;
      reason: RulebookPlacementIncompatibility['reason'];
    }
  | {
      kind: 'cycle';
      container: RulebookOrderedContainerRef;
      requests: readonly PlacementRequest[];
    };

type Reconciliation = {
  autoDraft: RulebookContentsDraftV1;
  comparisonDraft: RulebookContentsDraftV1;
  incompatibilities: RulebookIncompatibility[];
  validLedger: RulebookResolutionApproval[];
  allResolved: boolean;
  restoredRoots: RulebookEntityRef[];
  reviewedDeletions: RulebookDeleteIntent[];
};

const clone = <Value>(value: Value): Value => structuredClone(value);

function entityRefKey(ref: RulebookEntityRef): string {
  switch (ref.kind) {
    case 'page':
      return `page:${ref.pageId}`;
    case 'block':
      return `block:${ref.blockId}`;
    case 'item':
      return `item:${ref.blockId}:${ref.itemId}`;
  }
}

function entityId(ref: RulebookEntityRef): string {
  return ref.kind === 'page' ? ref.pageId : ref.kind === 'block' ? ref.blockId : ref.itemId;
}

function sameRef(left: RulebookEntityRef, right: RulebookEntityRef): boolean {
  return entityRefKey(left) === entityRefKey(right);
}

function containerKey(container: RulebookOrderedContainerRef): string {
  switch (container.kind) {
    case 'page-order':
      return 'page-order';
    case 'page-slot':
      return `page-slot:${container.pageId}:${container.slotId}`;
    case 'item-order':
      return `item-order:${container.blockId}`;
  }
}

function sameContainer(left: RulebookOrderedContainerRef, right: RulebookOrderedContainerRef): boolean {
  return containerKey(left) === containerKey(right);
}

function samePlacement(left: RulebookPlacement | undefined, right: RulebookPlacement | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    sameContainer(left.container, right.container) &&
    left.afterId === right.afterId &&
    left.beforeId === right.beforeId
  );
}

function stableFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => compareCanonicalText(left, right)));
  });
}

function pageSlotEntries(page: RulebookPageDraft): Array<[RulebookSlotId, string[]]> {
  if (page.layoutId === rulebookLayoutCatalogue[0].id) {
    return rulebookLayoutCatalogue[0].slots.map(({ id }) => [id, page.slots[id]]);
  }
  return rulebookLayoutCatalogue[1].slots.map(({ id }) => [id, page.slots[id]]);
}

function allEntityRefs(contents: RulebookContentsDraftV1): RulebookEntityRef[] {
  const refs: RulebookEntityRef[] = Object.keys(contents.pagesById).map((pageId) => ({ kind: 'page', pageId }));
  for (const block of Object.values(contents.blocksById)) {
    refs.push({ kind: 'block', blockId: block.id });
    if (block.kind === 'repeated-text') {
      refs.push(
        ...Object.keys(block.itemsById).map((itemId) => ({ kind: 'item' as const, blockId: block.id, itemId }))
      );
    }
  }
  return refs.sort((left, right) => compareCanonicalText(entityRefKey(left), entityRefKey(right)));
}

function entityExists(contents: RulebookContentsDraftV1, ref: RulebookEntityRef): boolean {
  switch (ref.kind) {
    case 'page':
      return contents.pagesById[ref.pageId] !== undefined;
    case 'block':
      return contents.blocksById[ref.blockId] !== undefined;
    case 'item': {
      const block = contents.blocksById[ref.blockId];
      return block?.kind === 'repeated-text' && block.itemsById[ref.itemId] !== undefined;
    }
  }
}

function getOrder(contents: RulebookContentsDraftV1, container: RulebookOrderedContainerRef): string[] | undefined {
  switch (container.kind) {
    case 'page-order':
      return contents.pageOrder;
    case 'page-slot': {
      const page = contents.pagesById[container.pageId];
      if (!page || !(container.slotId in page.slots)) {
        return undefined;
      }
      return (page.slots as Record<string, string[]>)[container.slotId];
    }
    case 'item-order': {
      const block = contents.blocksById[container.blockId];
      return block?.kind === 'repeated-text' ? block.itemOrder : undefined;
    }
  }
}

function allContainers(contents: RulebookContentsDraftV1): RulebookOrderedContainerRef[] {
  const containers: RulebookOrderedContainerRef[] = [{ kind: 'page-order' }];
  for (const page of Object.values(contents.pagesById)) {
    for (const [slotId] of pageSlotEntries(page)) {
      containers.push({ kind: 'page-slot', pageId: page.id, slotId });
    }
  }
  for (const block of Object.values(contents.blocksById)) {
    if (block.kind === 'repeated-text') {
      containers.push({ kind: 'item-order', blockId: block.id });
    }
  }
  return containers;
}

function targetForContainer(container: RulebookOrderedContainerRef, id: string): RulebookEntityRef {
  switch (container.kind) {
    case 'page-order':
      return { kind: 'page', pageId: id };
    case 'page-slot':
      return { kind: 'block', blockId: id };
    case 'item-order':
      return { kind: 'item', blockId: container.blockId, itemId: id };
  }
}

function containerAccepts(container: RulebookOrderedContainerRef, target: RulebookEntityRef): boolean {
  return (
    (container.kind === 'page-order' && target.kind === 'page') ||
    (container.kind === 'page-slot' && target.kind === 'block') ||
    (container.kind === 'item-order' && target.kind === 'item' && container.blockId === target.blockId)
  );
}

function placementInOrder(
  container: RulebookOrderedContainerRef,
  order: readonly string[],
  index: number
): RulebookPlacement {
  return {
    container: clone(container),
    afterId: order[index - 1] ?? null,
    beforeId: order[index + 1] ?? null,
  };
}

function findPlacement(contents: RulebookContentsDraftV1, target: RulebookEntityRef): RulebookPlacement | undefined {
  for (const container of allContainers(contents)) {
    if (!containerAccepts(container, target)) {
      continue;
    }
    const order = getOrder(contents, container);
    const index = order?.indexOf(entityId(target)) ?? -1;
    if (order && index >= 0) {
      return placementInOrder(container, order, index);
    }
  }
  return undefined;
}

function parentRef(contents: RulebookContentsDraftV1, ref: RulebookEntityRef): RulebookEntityRef | undefined {
  const placement = findPlacement(contents, ref);
  if (!placement) {
    return undefined;
  }
  if (placement.container.kind === 'page-slot') {
    return { kind: 'page', pageId: placement.container.pageId };
  }
  if (placement.container.kind === 'item-order') {
    return { kind: 'block', blockId: placement.container.blockId };
  }
  return undefined;
}

function ownedClosure(contents: RulebookContentsDraftV1, root: RulebookEntityRef): RulebookEntityRef[] {
  if (!entityExists(contents, root)) {
    return [];
  }
  if (root.kind === 'item') {
    return [root];
  }
  if (root.kind === 'block') {
    const block = contents.blocksById[root.blockId]!;
    return block.kind === 'repeated-text'
      ? [root, ...block.itemOrder.map((itemId) => ({ kind: 'item' as const, blockId: block.id, itemId }))]
      : [root];
  }

  const page = contents.pagesById[root.pageId]!;
  const blockIds = pageSlotEntries(page).flatMap(([, ids]) => ids);
  return [root, ...blockIds.flatMap((blockId) => ownedClosure(contents, { kind: 'block', blockId }))];
}

function reviewedDeletionSet(
  contents: RulebookContentsDraftV1,
  reviewedRefs: readonly RulebookEntityRef[]
): RulebookEntityRef[] {
  const result = new Map<string, RulebookEntityRef>();
  const queue = reviewedRefs.filter((ref) => entityExists(contents, ref));
  while (queue.length > 0) {
    const ref = queue.shift()!;
    const key = entityRefKey(ref);
    if (result.has(key)) {
      continue;
    }
    result.set(key, ref);
    for (const descendant of ownedClosure(contents, ref)) {
      if (!result.has(entityRefKey(descendant))) {
        queue.push(descendant);
      }
    }
  }
  return [...result.values()].sort((left, right) => compareCanonicalText(entityRefKey(left), entityRefKey(right)));
}

function snapshotSubtree(contents: RulebookContentsDraftV1, root: RulebookEntityRef): RulebookDraftSubtree {
  if (root.kind === 'page') {
    const page = contents.pagesById[root.pageId];
    if (!page) {
      throw new Error(`Page ${root.pageId} does not exist`);
    }
    const blocksById = Object.fromEntries(
      pageSlotEntries(page)
        .flatMap(([, ids]) => ids)
        .map((blockId) => [blockId, clone(contents.blocksById[blockId]!)])
    );
    return { kind: 'page', page: clone(page), blocksById };
  }
  if (root.kind === 'block') {
    const block = contents.blocksById[root.blockId];
    if (!block) {
      throw new Error(`Block ${root.blockId} does not exist`);
    }
    return { kind: 'block', block: clone(block) };
  }
  const block = contents.blocksById[root.blockId];
  const item = block?.kind === 'repeated-text' ? block.itemsById[root.itemId] : undefined;
  if (!item) {
    throw new Error(`Repeated item ${root.itemId} does not exist in Block ${root.blockId}`);
  }
  return { kind: 'item', blockId: root.blockId, item: clone(item) };
}

function snapshotRefs(snapshot: RulebookDraftSubtree): RulebookEntityRef[] {
  if (snapshot.kind === 'item') {
    return [{ kind: 'item', blockId: snapshot.blockId, itemId: snapshot.item.id }];
  }
  if (snapshot.kind === 'block') {
    const root = { kind: 'block' as const, blockId: snapshot.block.id };
    return snapshot.block.kind === 'repeated-text'
      ? [
          root,
          ...snapshot.block.itemOrder.map((itemId) => ({
            kind: 'item' as const,
            blockId: snapshot.block.id,
            itemId,
          })),
        ]
      : [root];
  }
  const root = { kind: 'page' as const, pageId: snapshot.page.id };
  const blocks = Object.values(snapshot.blocksById).flatMap((block) => snapshotRefs({ kind: 'block', block }));
  return [root, ...blocks];
}

function restorationIntentsForAffectedRefs(
  contents: RulebookContentsDraftV1,
  affectedRefs: readonly RulebookEntityRef[]
): RulebookRestoreIntent[] {
  const survivingRefs = affectedRefs.filter((ref) => entityExists(contents, ref));
  const survivingKeys = new Set(survivingRefs.map(entityRefKey));
  const depth = (ref: RulebookEntityRef) => (ref.kind === 'page' ? 0 : ref.kind === 'block' ? 1 : 2);
  return survivingRefs
    .filter((ref) => {
      const parent = parentRef(contents, ref);
      return !parent || !survivingKeys.has(entityRefKey(parent));
    })
    .sort((left, right) => depth(left) - depth(right) || compareCanonicalText(entityRefKey(left), entityRefKey(right)))
    .map((root) => ({
      kind: 'restore',
      root,
      snapshot: snapshotSubtree(contents, root),
      placement: findPlacement(contents, root)!,
    }));
}

function removeFromPlacements(contents: RulebookContentsDraftV1, refs: readonly RulebookEntityRef[]): void {
  const pageIds = new Set(refs.filter((ref) => ref.kind === 'page').map((ref) => ref.pageId));
  const blockIds = new Set(refs.filter((ref) => ref.kind === 'block').map((ref) => ref.blockId));
  const itemIds = new Set(refs.filter((ref) => ref.kind === 'item').map((ref) => ref.itemId));
  contents.pageOrder = contents.pageOrder.filter((id) => !pageIds.has(id));
  for (const page of Object.values(contents.pagesById)) {
    for (const [slotId, order] of pageSlotEntries(page)) {
      (page.slots as Record<string, string[]>)[slotId] = order.filter((id) => !blockIds.has(id));
    }
  }
  for (const block of Object.values(contents.blocksById)) {
    if (block.kind === 'repeated-text') {
      block.itemOrder = block.itemOrder.filter((id) => !itemIds.has(id));
    }
  }
}

function deleteExact(contents: RulebookContentsDraftV1, refs: readonly RulebookEntityRef[]): void {
  removeFromPlacements(contents, refs);
  for (const ref of [...refs].sort((left, right) => compareCanonicalText(entityRefKey(right), entityRefKey(left)))) {
    if (ref.kind === 'item') {
      const block = contents.blocksById[ref.blockId];
      if (block?.kind === 'repeated-text') {
        delete block.itemsById[ref.itemId];
      }
    } else if (ref.kind === 'block') {
      delete contents.blocksById[ref.blockId];
    } else {
      delete contents.pagesById[ref.pageId];
    }
  }
}

function addEntityData(contents: RulebookContentsDraftV1, entity: RulebookNewEntity): RulebookEntityRef {
  if (entity.kind === 'page') {
    if (contents.pagesById[entity.page.id]) {
      throw new Error(`Page ${entity.page.id} already exists`);
    }
    if (pageSlotEntries(entity.page).some(([, ids]) => ids.length > 0)) {
      throw new Error('A new Page must start with empty layout slots');
    }
    contents.pagesById[entity.page.id] = clone(entity.page);
    return { kind: 'page', pageId: entity.page.id };
  }
  if (entity.kind === 'block') {
    if (contents.blocksById[entity.block.id]) {
      throw new Error(`Block ${entity.block.id} already exists`);
    }
    if (
      entity.block.kind === 'repeated-text' &&
      (entity.block.itemOrder.length > 0 || Object.keys(entity.block.itemsById).length > 0)
    ) {
      throw new Error('A new Repeated text Block must start with no items');
    }
    contents.blocksById[entity.block.id] = clone(entity.block);
    return { kind: 'block', blockId: entity.block.id };
  }

  const block = contents.blocksById[entity.blockId];
  if (block?.kind !== 'repeated-text') {
    throw new Error(`Block ${entity.blockId} cannot own repeated items`);
  }
  if (block.itemsById[entity.item.id]) {
    throw new Error(`Repeated item ${entity.item.id} already exists`);
  }
  block.itemsById[entity.item.id] = clone(entity.item);
  return { kind: 'item', blockId: entity.blockId, itemId: entity.item.id };
}

function restoreSnapshot(
  contents: RulebookContentsDraftV1,
  snapshot: RulebookDraftSubtree,
  placement: RulebookPlacement
): void {
  let root: RulebookEntityRef;
  if (snapshot.kind === 'page') {
    if (contents.pagesById[snapshot.page.id]) {
      throw new Error(`Page ${snapshot.page.id} already exists`);
    }
    contents.pagesById[snapshot.page.id] = clone(snapshot.page);
    Object.assign(contents.blocksById, clone(snapshot.blocksById));
    root = { kind: 'page', pageId: snapshot.page.id };
  } else if (snapshot.kind === 'block') {
    if (contents.blocksById[snapshot.block.id]) {
      throw new Error(`Block ${snapshot.block.id} already exists`);
    }
    contents.blocksById[snapshot.block.id] = clone(snapshot.block);
    root = { kind: 'block', blockId: snapshot.block.id };
  } else {
    const block = contents.blocksById[snapshot.blockId];
    if (block?.kind !== 'repeated-text') {
      throw new Error(`Block ${snapshot.blockId} cannot restore repeated items`);
    }
    block.itemsById[snapshot.item.id] = clone(snapshot.item);
    root = { kind: 'item', blockId: snapshot.blockId, itemId: snapshot.item.id };
  }
  const failures = applyPlacementBatch(contents, [{ target: root, destination: placement }]);
  if (failures.length > 0) {
    throw new Error('The restored subtree placement is no longer valid');
  }
}

function setField(contents: RulebookContentsDraftV1, intent: RulebookSetIntent): void {
  if (intent.target.kind === 'page') {
    const page = contents.pagesById[intent.target.pageId];
    if (!page || intent.field !== 'anchor') {
      throw new Error('The Page field target is not available');
    }
    page.anchor = intent.value ?? '';
    return;
  }
  if (intent.target.kind === 'block') {
    const block = contents.blocksById[intent.target.blockId];
    if (!block) {
      throw new Error('The Block field target is not available');
    }
    if (intent.field === 'anchor') {
      block.anchor = intent.value;
      return;
    }
    if (intent.field === 'text' && block.kind === 'text') {
      block.text = intent.value;
      return;
    }
    throw new Error('That field does not belong to this Block kind');
  }
  const block = contents.blocksById[intent.target.blockId];
  if (block?.kind !== 'repeated-text' || intent.field !== 'text' || !block.itemsById[intent.target.itemId]) {
    throw new Error('The repeated-item field target is not available');
  }
  block.itemsById[intent.target.itemId]!.text = intent.value;
}

function fieldIntent(
  target: RulebookEntityRef,
  field: 'anchor' | 'text',
  value: string | undefined
): RulebookSetIntent {
  if (field === 'anchor') {
    if (target.kind === 'page') {
      if (value === undefined) {
        throw new Error('A Page anchor resolution needs a value');
      }
      return { kind: 'set', target, field, value };
    }
    if (target.kind === 'block') {
      return { kind: 'set', target, field, value };
    }
    throw new Error('A repeated item cannot own an anchor');
  }
  if (value === undefined) {
    throw new Error('A text resolution needs a value');
  }
  if (target.kind === 'block') {
    return { kind: 'set', target, field, value };
  }
  if (target.kind === 'item') {
    return { kind: 'set', target, field, value };
  }
  throw new Error('A Page cannot own editable text');
}

function resolveGap(
  contents: RulebookContentsDraftV1,
  target: RulebookEntityRef,
  placement: RulebookPlacement
): RulebookPlacement | undefined {
  if (!containerAccepts(placement.container, target)) {
    return undefined;
  }
  const currentOrder = getOrder(contents, placement.container);
  if (!currentOrder) {
    return undefined;
  }
  const targetId = entityId(target);
  const order = currentOrder.filter((id) => id !== targetId);
  const afterIndex = placement.afterId === null ? -1 : order.indexOf(placement.afterId);
  const beforeIndex = placement.beforeId === null ? order.length : order.indexOf(placement.beforeId);
  const afterSurvives = placement.afterId !== null && afterIndex >= 0;
  const beforeSurvives = placement.beforeId !== null && beforeIndex >= 0;

  if (placement.afterId === null && placement.beforeId === null) {
    return order.length === 0 ? { container: clone(placement.container), afterId: null, beforeId: null } : undefined;
  }
  if (afterSurvives && beforeSurvives) {
    return afterIndex < beforeIndex
      ? { container: clone(placement.container), afterId: placement.afterId, beforeId: placement.beforeId }
      : undefined;
  }
  if (afterSurvives) {
    return {
      container: clone(placement.container),
      afterId: placement.afterId,
      beforeId: order[afterIndex + 1] ?? null,
    };
  }
  if (beforeSurvives) {
    return {
      container: clone(placement.container),
      afterId: order[beforeIndex - 1] ?? null,
      beforeId: placement.beforeId,
    };
  }
  return undefined;
}

function unresolvedGapReason(
  contents: RulebookContentsDraftV1,
  placement: RulebookPlacement
): RulebookPlacementIncompatibility['reason'] {
  const order = getOrder(contents, placement.container) ?? [];
  const neighbors = [placement.afterId, placement.beforeId].filter((id): id is string => id !== null);
  const existsElsewhere = neighbors.some((id) => {
    if (order.includes(id)) {
      return false;
    }
    if (placement.container.kind === 'page-order') {
      return contents.pagesById[id] !== undefined;
    }
    if (placement.container.kind === 'page-slot') {
      return contents.blocksById[id] !== undefined;
    }
    return Object.values(contents.blocksById).some(
      (block) => block.kind === 'repeated-text' && block.itemsById[id] !== undefined
    );
  });
  return existsElsewhere ? 'cross-container-neighbor' : 'missing-neighbor';
}

function applyPlacementBatch(
  contents: RulebookContentsDraftV1,
  requests: readonly PlacementRequest[]
): PlacementBatchFailure[] {
  if (requests.length === 0) {
    return [];
  }

  const candidate = clone(contents);
  const failures: PlacementBatchFailure[] = [];
  removeFromPlacements(
    candidate,
    requests.map(({ target }) => target)
  );
  const groups = new Map<string, { container: RulebookOrderedContainerRef; requests: PlacementRequest[] }>();

  for (const request of requests) {
    if (!entityExists(candidate, request.target) || !containerAccepts(request.destination.container, request.target)) {
      failures.push({ kind: 'placement', request, reason: 'cross-container-neighbor' });
      continue;
    }
    const key = containerKey(request.destination.container);
    const group = groups.get(key) ?? { container: request.destination.container, requests: [] };
    group.requests.push(request);
    groups.set(key, group);
  }

  const groupInputs: Array<{
    key: string;
    currentOrder: string[];
    baseOrder: string[];
    requests: Array<{ targetId: string; afterId: string | null; beforeId: string | null }>;
  }> = [];
  for (const [key, { container, requests: groupRequests }] of groups) {
    const baseOrder = getOrder(candidate, container);
    if (!baseOrder) {
      failures.push(
        ...groupRequests.map((request) => ({
          kind: 'placement' as const,
          request,
          reason: 'cross-container-neighbor' as const,
        }))
      );
      continue;
    }
    groupInputs.push({
      key,
      currentOrder: [...getOrder(contents, container)!],
      baseOrder: [...baseOrder],
      requests: groupRequests.map(({ target, destination }) => ({
        targetId: entityId(target),
        afterId: destination.afterId,
        beforeId: destination.beforeId,
      })),
    });
  }
  if (failures.length > 0) {
    return failures;
  }

  const planned = planAtomicPlacementBatch(groupInputs);
  if (!planned.ok) {
    return planned.failures.map((failure) => {
      const group = groups.get(failure.key)!;
      if (failure.kind === 'cycle') {
        return { kind: 'cycle' as const, container: group.container, requests: group.requests };
      }
      const request = group.requests[failure.requestIndex]!;
      return {
        kind: 'placement' as const,
        request,
        reason: unresolvedGapReason(candidate, request.destination),
      };
    });
  }

  for (const plan of planned.plans) {
    const order = getOrder(candidate, groups.get(plan.key)!.container)!;
    order.splice(0, order.length, ...plan.order);
  }
  contents.pageOrder = [...candidate.pageOrder];
  for (const page of Object.values(contents.pagesById)) {
    const candidatePage = candidate.pagesById[page.id]!;
    for (const [slotId] of pageSlotEntries(page)) {
      (page.slots as Record<string, string[]>)[slotId] = [
        ...(candidatePage.slots as Record<string, string[]>)[slotId]!,
      ];
    }
  }
  for (const block of Object.values(contents.blocksById)) {
    const candidateBlock = candidate.blocksById[block.id];
    if (block.kind === 'repeated-text' && candidateBlock?.kind === 'repeated-text') {
      block.itemOrder = [...candidateBlock.itemOrder];
    }
  }
  return [];
}

function emptyPatch(revision: string): RulebookEditPatchV1 {
  return {
    schemaVersion: 1,
    baselineRevision: revision,
    creates: [],
    deletes: [],
    sets: [],
    placements: [],
    restorations: [],
  };
}

function patchHasChanges(patch: RulebookEditPatchV1): boolean {
  return (
    patch.creates.length > 0 ||
    patch.deletes.length > 0 ||
    patch.sets.length > 0 ||
    patch.placements.length > 0 ||
    patch.restorations.length > 0
  );
}

function patchValidationError(baseline: RulebookContentsV1, patch: RulebookEditPatchV1): string | undefined {
  const draft = clone(baseline) as RulebookContentsDraftV1;
  const placementRequests: PlacementRequest[] = [];
  try {
    for (const restoration of patch.restorations) {
      const snapshotRoot =
        restoration.snapshot.kind === 'page'
          ? { kind: 'page' as const, pageId: restoration.snapshot.page.id }
          : restoration.snapshot.kind === 'block'
            ? { kind: 'block' as const, blockId: restoration.snapshot.block.id }
            : {
                kind: 'item' as const,
                blockId: restoration.snapshot.blockId,
                itemId: restoration.snapshot.item.id,
              };
      if (!sameRef(restoration.root, snapshotRoot)) {
        return 'A restoration root must match its snapshot identity';
      }
      restoreSnapshot(draft, restoration.snapshot, restoration.placement);
    }
    for (const creation of patch.creates) {
      const target = addEntityData(draft, creation.entity);
      placementRequests.push({ target, destination: creation.placement });
    }
    for (const intent of patch.sets) {
      setField(draft, intent);
    }
    for (const intent of patch.placements) {
      const original = findPlacement(baseline, intent.target);
      if (!original || !samePlacement(original, intent.original)) {
        return 'A placement original must match the reconciliation baseline';
      }
      placementRequests.push({ target: intent.target, destination: intent.destination });
    }
    if (applyPlacementBatch(draft, placementRequests).length > 0) {
      return 'The patch placements cannot be materialized deterministically';
    }
    for (const deletion of patch.deletes) {
      const receivedKeys = new Set(deletion.deletedRefs.map(entityRefKey));
      if (deletion.deletedRefs.some((ref) => !entityExists(draft, ref))) {
        return 'Every identity in a reviewed deletion must exist in its source state';
      }
      if (
        deletion.deletedRefs.some((ref) =>
          ownedClosure(draft, ref).some((descendant) => !receivedKeys.has(entityRefKey(descendant)))
        )
      ) {
        return 'A reviewed deletion must include every descendant owned by every listed identity';
      }
      deleteExact(draft, deletion.deletedRefs);
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'The edit patch is invalid';
  }
  return structuralError(draft);
}

function applyPatch(baseline: RulebookContentsV1, patch: RulebookEditPatchV1): RulebookContentsDraftV1 {
  const draft = clone(baseline) as RulebookContentsDraftV1;
  const requests: PlacementRequest[] = [];

  for (const restoration of patch.restorations) {
    restoreSnapshot(draft, restoration.snapshot, restoration.placement);
  }
  for (const creation of patch.creates) {
    const target = addEntityData(draft, creation.entity);
    requests.push({ target, destination: creation.placement });
  }
  for (const intent of patch.sets) {
    setField(draft, intent);
  }
  requests.push(...patch.placements.map(({ target, destination }) => ({ target, destination })));
  const failures = applyPlacementBatch(draft, requests);
  if (failures.length > 0) {
    throw new Error('The edit patch contains an invalid placement');
  }
  for (const deletion of patch.deletes) {
    deleteExact(draft, deletion.deletedRefs);
  }
  return draft;
}

function fieldRecords(contents: RulebookContentsDraftV1): FieldRecord[] {
  const records: FieldRecord[] = [];
  for (const page of Object.values(contents.pagesById)) {
    records.push({ target: { kind: 'page', pageId: page.id }, field: 'anchor', value: page.anchor });
  }
  for (const block of Object.values(contents.blocksById)) {
    records.push({ target: { kind: 'block', blockId: block.id }, field: 'anchor', value: block.anchor });
    if (block.kind === 'text') {
      records.push({ target: { kind: 'block', blockId: block.id }, field: 'text', value: block.text });
    } else {
      for (const item of Object.values(block.itemsById)) {
        records.push({
          target: { kind: 'item', blockId: block.id, itemId: item.id },
          field: 'text',
          value: item.text,
        });
      }
    }
  }
  return records;
}

function fieldKey(record: Pick<FieldRecord, 'target' | 'field'>): string {
  return `${entityRefKey(record.target)}:${record.field}`;
}

function comparableFieldValue(field: 'anchor' | 'text', value: string | undefined): string | undefined {
  if (field !== 'text' || value === undefined) {
    return value;
  }
  const normalized = normalizeFormattedText(value);
  return normalized.ok ? normalized.value : value;
}

function fieldsEqual(field: 'anchor' | 'text', left: string | undefined, right: string | undefined): boolean {
  return comparableFieldValue(field, left) === comparableFieldValue(field, right);
}

function lexicographicallySmaller(left: readonly string[], right: readonly string[]): readonly string[] {
  return compareCanonicalText(left.join('\u0000'), right.join('\u0000')) <= 0 ? left : right;
}

function longestCommonSubsequence(left: readonly string[], right: readonly string[]): readonly string[] {
  const memo = new Map<string, readonly string[]>();
  const visit = (leftIndex: number, rightIndex: number): readonly string[] => {
    const key = `${leftIndex}:${rightIndex}`;
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }
    if (leftIndex >= left.length || rightIndex >= right.length) {
      return [];
    }
    let result: readonly string[];
    if (left[leftIndex] === right[rightIndex]) {
      result = [left[leftIndex]!, ...visit(leftIndex + 1, rightIndex + 1)];
    } else {
      const skipLeft = visit(leftIndex + 1, rightIndex);
      const skipRight = visit(leftIndex, rightIndex + 1);
      result =
        skipLeft.length === skipRight.length
          ? lexicographicallySmaller(skipLeft, skipRight)
          : skipLeft.length > skipRight.length
            ? skipLeft
            : skipRight;
    }
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}

function createEntityFromDraft(contents: RulebookContentsDraftV1, ref: RulebookEntityRef): RulebookNewEntity {
  if (ref.kind === 'page') {
    const page = clone(contents.pagesById[ref.pageId]!);
    for (const [slotId] of pageSlotEntries(page)) {
      (page.slots as Record<string, string[]>)[slotId] = [];
    }
    return { kind: 'page', page };
  }
  if (ref.kind === 'block') {
    const block = clone(contents.blocksById[ref.blockId]!);
    if (block.kind === 'repeated-text') {
      block.itemOrder = [];
      block.itemsById = {};
    }
    return { kind: 'block', block };
  }
  const block = contents.blocksById[ref.blockId] as Extract<RulebookBlockDraft, { kind: 'repeated-text' }>;
  return { kind: 'item', blockId: ref.blockId, item: clone(block.itemsById[ref.itemId]!) };
}

function placementDiff(
  source: RulebookContentsDraftV1,
  target: RulebookContentsDraftV1,
  excluded: ReadonlySet<string>
): RulebookPlaceIntent[] {
  const placements: RulebookPlaceIntent[] = [];
  const commonRefs = allEntityRefs(target).filter(
    (ref) => entityExists(source, ref) && !excluded.has(entityRefKey(ref))
  );
  const retainedByContainer = new Map<string, Set<string>>();

  for (const container of allContainers(source)) {
    const sourceOrder = (getOrder(source, container) ?? []).filter((id) => {
      const ref = targetForContainer(container, id);
      const targetPlacement = findPlacement(target, ref);
      return entityExists(target, ref) && targetPlacement && sameContainer(targetPlacement.container, container);
    });
    const targetOrder = (getOrder(target, container) ?? []).filter((id) => sourceOrder.includes(id));
    retainedByContainer.set(containerKey(container), new Set(longestCommonSubsequence(sourceOrder, targetOrder)));
  }

  for (const ref of commonRefs) {
    const original = findPlacement(source, ref);
    const destination = findPlacement(target, ref);
    if (!original || !destination) {
      continue;
    }
    if (!sameContainer(original.container, destination.container)) {
      placements.push({ kind: 'place', target: ref, original, destination });
      continue;
    }
    const retained = retainedByContainer.get(containerKey(original.container));
    if (!retained?.has(entityId(ref))) {
      placements.push({ kind: 'place', target: ref, original, destination });
    }
  }
  return placements.sort((left, right) => compareCanonicalText(entityRefKey(left.target), entityRefKey(right.target)));
}

function diffContents(
  source: RulebookContentsDraftV1,
  target: RulebookContentsDraftV1,
  baselineRevision: string,
  options: {
    restorationRoots?: readonly RulebookEntityRef[];
    reviewedDeletions?: readonly RulebookDeleteIntent[];
  } = {}
): RulebookEditPatchV1 {
  const restorationRoots = options.restorationRoots ?? [];
  const reviewedDeletions = options.reviewedDeletions ?? [];
  const sourceRefs = allEntityRefs(source);
  const targetRefs = allEntityRefs(target);
  const sourceKeys = new Set(sourceRefs.map(entityRefKey));
  const targetKeys = new Set(targetRefs.map(entityRefKey));
  const restoredKeys = new Set(restorationRoots.flatMap((root) => ownedClosure(target, root).map(entityRefKey)));
  const newRefs = targetRefs.filter(
    (ref) => !sourceKeys.has(entityRefKey(ref)) && !restoredKeys.has(entityRefKey(ref))
  );
  const missingRefs = sourceRefs.filter((ref) => !targetKeys.has(entityRefKey(ref)));
  const missingKeys = new Set(missingRefs.map(entityRefKey));
  const reviewedDeletionKeys = new Set(reviewedDeletions.flatMap(({ deletedRefs }) => deletedRefs.map(entityRefKey)));

  const creates: RulebookCreateIntent[] = newRefs.map((ref) => ({
    kind: 'create',
    entity: createEntityFromDraft(target, ref),
    placement: findPlacement(target, ref)!,
  }));

  const deletes: RulebookDeleteIntent[] = missingRefs
    .filter((ref) => !reviewedDeletionKeys.has(entityRefKey(ref)))
    .filter((ref) => {
      const parent = parentRef(source, ref);
      return !parent || !missingKeys.has(entityRefKey(parent)) || reviewedDeletionKeys.has(entityRefKey(parent));
    })
    .map((root) => ({
      kind: 'delete',
      root,
      deletedRefs: ownedClosure(source, root)
        .filter((ref) => missingKeys.has(entityRefKey(ref)))
        .sort((left, right) => compareCanonicalText(entityRefKey(left), entityRefKey(right))),
    }));
  deletes.push(...reviewedDeletions.map((deletion) => clone(deletion)));

  const sourceFields = new Map(fieldRecords(source).map((record) => [fieldKey(record), record]));
  const sets: RulebookSetIntent[] = [];
  for (const record of fieldRecords(target)) {
    if (!sourceKeys.has(entityRefKey(record.target)) || restoredKeys.has(entityRefKey(record.target))) {
      continue;
    }
    const previous = sourceFields.get(fieldKey(record));
    if (!previous || fieldsEqual(record.field, previous.value, record.value)) {
      continue;
    }
    sets.push(fieldIntent(record.target, record.field, record.value));
  }

  const restorations: RulebookRestoreIntent[] = restorationRoots.map((root) => ({
    kind: 'restore',
    root,
    snapshot: snapshotSubtree(target, root),
    placement: findPlacement(target, root)!,
  }));

  const excluded = new Set([...newRefs.map(entityRefKey), ...missingRefs.map(entityRefKey), ...restoredKeys]);
  return {
    schemaVersion: 1,
    baselineRevision,
    creates: creates.sort((left, right) =>
      compareCanonicalText(entityRefKey(entityForNew(left.entity)), entityRefKey(entityForNew(right.entity)))
    ),
    deletes: deletes.sort((left, right) => compareCanonicalText(entityRefKey(left.root), entityRefKey(right.root))),
    sets: sets.sort((left, right) => compareCanonicalText(fieldKey(left), fieldKey(right))),
    placements: placementDiff(source, target, excluded),
    restorations: restorations.sort((left, right) =>
      compareCanonicalText(entityRefKey(left.root), entityRefKey(right.root))
    ),
  };
}

function entityForNew(entity: RulebookNewEntity): RulebookEntityRef {
  if (entity.kind === 'page') {
    return { kind: 'page', pageId: entity.page.id };
  }
  if (entity.kind === 'block') {
    return { kind: 'block', blockId: entity.block.id };
  }
  return { kind: 'item', blockId: entity.blockId, itemId: entity.item.id };
}

function validateDraft(draft: RulebookContentsDraftV1): {
  diagnostics: RulebookFieldDiagnostic[];
  candidate?: RulebookContentsV1;
} {
  const candidate = clone(draft) as RulebookContentsDraftV1;
  const diagnostics: RulebookFieldDiagnostic[] = [];

  for (const page of Object.values(candidate.pagesById)) {
    const parsed = rulebookAnchorSchema.safeParse(page.anchor);
    if (!parsed.success) {
      diagnostics.push({
        target: { kind: 'page', pageId: page.id },
        field: 'anchor',
        code: 'invalid-anchor',
        message: parsed.error.issues[0]?.message ?? 'The Page anchor is invalid',
      });
    }
  }
  for (const block of Object.values(candidate.blocksById)) {
    if (block.anchor !== undefined) {
      const parsed = rulebookAnchorSchema.safeParse(block.anchor);
      if (!parsed.success) {
        diagnostics.push({
          target: { kind: 'block', blockId: block.id },
          field: 'anchor',
          code: 'invalid-anchor',
          message: parsed.error.issues[0]?.message ?? 'The Block anchor is invalid',
        });
      }
    }
    const textFields =
      block.kind === 'text'
        ? [{ target: { kind: 'block' as const, blockId: block.id }, value: block.text }]
        : Object.values(block.itemsById).map((item) => ({
            target: { kind: 'item' as const, blockId: block.id, itemId: item.id },
            value: item.text,
          }));
    for (const textField of textFields) {
      const normalized = normalizeFormattedText(textField.value);
      if (!normalized.ok) {
        diagnostics.push(
          ...normalized.diagnostics.map((diagnostic) => ({
            target: textField.target,
            field: 'text' as const,
            code: diagnostic.code,
            message: diagnostic.message,
            line: diagnostic.line,
            column: diagnostic.column,
            offset: diagnostic.offset,
          }))
        );
      } else if (textField.target.kind === 'block') {
        (candidate.blocksById[textField.target.blockId] as Extract<RulebookBlockDraft, { kind: 'text' }>).text =
          normalized.value;
      } else {
        const repeated = candidate.blocksById[textField.target.blockId] as Extract<
          RulebookBlockDraft,
          { kind: 'repeated-text' }
        >;
        repeated.itemsById[textField.target.itemId]!.text = normalized.value;
      }
    }
  }

  const anchorOwners = new Map<string, RulebookEntityRef>();
  for (const { ref, anchor } of anchorEntries(candidate)) {
    if (!rulebookAnchorSchema.safeParse(anchor).success) {
      continue;
    }
    const existing = anchorOwners.get(anchor);
    if (existing) {
      diagnostics.push({
        target: ref,
        field: 'anchor',
        code: 'duplicate-anchor',
        message: `Anchor ${anchor} is already used by ${entityRefKey(existing)}`,
      });
    } else {
      anchorOwners.set(anchor, ref);
    }
  }

  const structuralCandidate = clone(candidate);
  const occupiedAnchors = new Set<string>();
  let temporaryAnchorIndex = 0;
  const temporaryAnchor = () => {
    let value: string;
    do {
      temporaryAnchorIndex += 1;
      value = `invalid-draft-anchor-${temporaryAnchorIndex}`;
    } while (occupiedAnchors.has(value));
    occupiedAnchors.add(value);
    return value;
  };
  for (const page of Object.values(structuralCandidate.pagesById)) {
    if (!rulebookAnchorSchema.safeParse(page.anchor).success || occupiedAnchors.has(page.anchor)) {
      page.anchor = temporaryAnchor();
    } else {
      occupiedAnchors.add(page.anchor);
    }
  }
  for (const block of Object.values(structuralCandidate.blocksById)) {
    if (block.anchor !== undefined) {
      if (!rulebookAnchorSchema.safeParse(block.anchor).success || occupiedAnchors.has(block.anchor)) {
        block.anchor = undefined;
      } else {
        occupiedAnchors.add(block.anchor);
      }
    }
    if (block.kind === 'text') {
      if (!normalizeFormattedText(block.text).ok) {
        block.text = '';
      }
    } else {
      for (const item of Object.values(block.itemsById)) {
        if (!normalizeFormattedText(item.text).ok) {
          item.text = '';
        }
      }
    }
  }
  const structural = rulebookContentsV1Schema.safeParse(structuralCandidate);
  if (!structural.success) {
    diagnostics.push(
      ...structural.error.issues.map(
        (issue) =>
          ({
            field: 'structure',
            code: 'invalid-contents',
            message: issue.message,
          }) as const
      )
    );
  }
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  const parsed = rulebookContentsV1Schema.safeParse(candidate);
  return parsed.success ? { diagnostics: [], candidate: parsed.data } : { diagnostics };
}

function structuralError(draft: RulebookContentsDraftV1): string | undefined {
  const validated = validateDraft(draft);
  return validated.diagnostics.find((diagnostic) => diagnostic.field === 'structure')?.message;
}

function textCombination(
  baseline: string | undefined,
  latest: string | undefined,
  local: string | undefined
): string | undefined {
  if (baseline === undefined || latest === undefined || local === undefined) {
    return undefined;
  }
  const units = (value: string) => [...graphemeSegments(value)].map(({ segment }) => segment);
  const range = (fromValue: string, toValue: string) => {
    const from = units(fromValue);
    const to = units(toValue);
    let start = 0;
    while (from[start] === to[start] && start < from.length && start < to.length) {
      start += 1;
    }
    let suffix = 0;
    while (
      from[from.length - 1 - suffix] === to[to.length - 1 - suffix] &&
      suffix < from.length - start &&
      suffix < to.length - start
    ) {
      suffix += 1;
    }
    return { start, end: from.length - suffix, replacement: to.slice(start, to.length - suffix) };
  };
  const savedChange = range(baseline, latest);
  const localChange = range(baseline, local);
  if (
    savedChange.start === localChange.start &&
    savedChange.end === savedChange.start &&
    localChange.end === localChange.start &&
    savedChange.replacement.length > 0 &&
    localChange.replacement.length > 0
  ) {
    return undefined;
  }
  if (savedChange.end <= localChange.start || localChange.end <= savedChange.start) {
    return [savedChange, localChange]
      .sort((left, right) => right.start - left.start)
      .reduce(
        (value, change) => [...value.slice(0, change.start), ...change.replacement, ...value.slice(change.end)],
        units(baseline)
      )
      .join('');
  }
  return undefined;
}

function placementChanged(
  baseline: RulebookContentsDraftV1,
  latest: RulebookContentsDraftV1,
  ref: RulebookEntityRef
): boolean {
  const baselinePlacement = findPlacement(baseline, ref);
  const latestPlacement = findPlacement(latest, ref);
  if (
    !baselinePlacement ||
    !latestPlacement ||
    !sameContainer(baselinePlacement.container, latestPlacement.container)
  ) {
    return true;
  }
  const baselineOrder = getOrder(baseline, baselinePlacement.container);
  const latestOrder = getOrder(latest, latestPlacement.container);
  const targetId = ref.kind === 'page' ? ref.pageId : ref.kind === 'block' ? ref.blockId : ref.itemId;
  if (!baselineOrder || !latestOrder) {
    return true;
  }
  const baselineIndex = baselineOrder.indexOf(targetId);
  const latestIndex = latestOrder.indexOf(targetId);
  if (baselineIndex < 0 || latestIndex < 0) {
    return true;
  }
  const previous = baselineOrder
    .slice(0, baselineIndex)
    .reverse()
    .find((id) => latestOrder.includes(id));
  const next = baselineOrder.slice(baselineIndex + 1).find((id) => latestOrder.includes(id));
  return (
    (previous !== undefined && latestOrder.indexOf(previous) >= latestIndex) ||
    (next !== undefined && latestIndex >= latestOrder.indexOf(next))
  );
}

function fieldIncompatibility(
  target: RulebookEntityRef,
  field: 'anchor' | 'text',
  baselineValue: string | undefined,
  latestValue: string | undefined,
  localValue: string | undefined
): RulebookFieldIncompatibility {
  const id = `field:${entityRefKey(target)}:${field}`;
  const dependencyFingerprint = stableFingerprint({ target, field, baselineValue, latestValue, localValue });
  return {
    id,
    kind: 'field',
    target,
    field,
    baselineValue,
    latestValue,
    localValue,
    combinedText: field === 'text' ? textCombination(baselineValue, latestValue, localValue) : undefined,
    dependencyFingerprint,
  };
}

function refsChanged(
  baseline: RulebookContentsDraftV1,
  latest: RulebookContentsDraftV1,
  refs: readonly RulebookEntityRef[]
): boolean {
  for (const ref of refs) {
    if (entityExists(baseline, ref) !== entityExists(latest, ref)) {
      return true;
    }
    if (!entityExists(baseline, ref)) {
      continue;
    }
    const baselineFields = fieldRecords(baseline).filter((record) => sameRef(record.target, ref));
    const latestFields = fieldRecords(latest).filter((record) => sameRef(record.target, ref));
    if (stableFingerprint(baselineFields) !== stableFingerprint(latestFields)) {
      return true;
    }
    if (placementChanged(baseline, latest, ref)) {
      return true;
    }
  }
  return false;
}

function containerOwner(container: RulebookOrderedContainerRef): RulebookEntityRef | undefined {
  return container.kind === 'page-slot'
    ? { kind: 'page', pageId: container.pageId }
    : container.kind === 'item-order'
      ? { kind: 'block', blockId: container.blockId }
      : undefined;
}

function patchTouchesRefs(patch: RulebookEditPatchV1, refs: ReadonlySet<string>): boolean {
  return (
    patch.sets.some((intent) => refs.has(entityRefKey(intent.target))) ||
    patch.placements.some((intent) => refs.has(entityRefKey(intent.target))) ||
    patch.deletes.some((intent) => intent.deletedRefs.some((ref) => refs.has(entityRefKey(ref)))) ||
    patch.creates.some((intent) => {
      const owner = containerOwner(intent.placement.container);
      return owner ? refs.has(entityRefKey(owner)) : false;
    })
  );
}

function anchorEntries(contents: RulebookContentsDraftV1): Array<{ ref: RulebookEntityRef; anchor: string }> {
  return [
    ...Object.values(contents.pagesById).map((page) => ({
      ref: { kind: 'page' as const, pageId: page.id },
      anchor: page.anchor,
    })),
    ...Object.values(contents.blocksById)
      .filter((block) => block.anchor !== undefined)
      .map((block) => ({ ref: { kind: 'block' as const, blockId: block.id }, anchor: block.anchor! })),
  ];
}

function anchorSuggestion(contents: RulebookContentsDraftV1, requested: string): string {
  const used = new Set(anchorEntries(contents).map(({ anchor }) => anchor));
  let suffix = 2;
  while (used.has(`${requested}-${suffix}`)) {
    suffix += 1;
  }
  return `${requested}-${suffix}`;
}

function reconcile(state: ReadyState): Reconciliation {
  const baseline = state.baseline.contents as RulebookContentsDraftV1;
  const latest = state.latest.contents as RulebookContentsDraftV1;
  let proposed = clone(latest);
  const incompatibilities: RulebookIncompatibility[] = [];
  const blockedRefs = new Set<string>();
  const reviewedDeletions: RulebookDeleteIntent[] = [];
  const latestDiff = diffContents(baseline, latest, state.baseline.revision);

  for (const restoration of state.patch.restorations) {
    const restoredRefs = snapshotRefs(restoration.snapshot);
    const collisions = restoredRefs.filter((ref) => entityExists(latest, ref));
    if (collisions.length > 0) {
      const latestSnapshot = entityExists(latest, restoration.root)
        ? snapshotSubtree(latest, restoration.root)
        : undefined;
      const latestPlacement = entityExists(latest, restoration.root)
        ? findPlacement(latest, restoration.root)
        : undefined;
      if (
        latestSnapshot &&
        latestPlacement &&
        stableFingerprint(latestSnapshot) === stableFingerprint(restoration.snapshot) &&
        samePlacement(latestPlacement, restoration.placement)
      ) {
        continue;
      }
      restoredRefs.forEach((ref) => blockedRefs.add(entityRefKey(ref)));
      incompatibilities.push({
        id: `restoration:${entityRefKey(restoration.root)}`,
        kind: 'deletion',
        direction: 'saved-deletion',
        root: restoration.root,
        affectedRefs: reviewedDeletionSet(latest, collisions),
        localRestorations: [restoration],
        dependencyFingerprint: stableFingerprint({
          root: restoration.root,
          latestSnapshot,
          latestPlacement,
          localRestorations: [restoration],
        }),
      });
      continue;
    }
    const destination = resolveGap(proposed, restoration.root, restoration.placement);
    if (!destination) {
      incompatibilities.push(
        placementIncompatibility(
          restoration.root,
          undefined,
          undefined,
          restoration.placement,
          unresolvedGapReason(proposed, restoration.placement),
          proposed
        )
      );
      continue;
    }
    restoreSnapshot(proposed, restoration.snapshot, destination);
  }

  for (const savedDeletion of latestDiff.deletes) {
    const closureKeys = new Set(savedDeletion.deletedRefs.map(entityRefKey));
    const coveredByLocalDeletion = savedDeletion.deletedRefs.every((savedRef) =>
      state.patch.deletes.some((localDeletion) =>
        localDeletion.deletedRefs.some((localRef) => sameRef(localRef, savedRef))
      )
    );
    if (coveredByLocalDeletion) {
      continue;
    }
    const remainingPatch = {
      ...state.patch,
      deletes: state.patch.deletes.filter((localDeletion) => !closureKeys.has(entityRefKey(localDeletion.root))),
    };
    if (!patchTouchesRefs(remainingPatch, closureKeys)) {
      continue;
    }
    savedDeletion.deletedRefs.forEach((ref) => blockedRefs.add(entityRefKey(ref)));
    const localRestorations = restorationIntentsForAffectedRefs(state.draft, savedDeletion.deletedRefs);
    const incompatibility = {
      id: `deletion:saved:${entityRefKey(savedDeletion.root)}`,
      kind: 'deletion' as const,
      direction: 'saved-deletion' as const,
      root: savedDeletion.root,
      affectedRefs: savedDeletion.deletedRefs,
      localRestorations,
      dependencyFingerprint: stableFingerprint({
        direction: 'saved-deletion',
        root: savedDeletion.root,
        affectedRefs: [...savedDeletion.deletedRefs].sort((left, right) =>
          compareCanonicalText(entityRefKey(left), entityRefKey(right))
        ),
        localRestorations,
      }),
    };
    incompatibilities.push(incompatibility);
  }

  for (const deletion of state.patch.deletes) {
    if (blockedRefs.has(entityRefKey(deletion.root))) {
      continue;
    }
    const latestClosure = reviewedDeletionSet(latest, deletion.deletedRefs);
    if (latestClosure.length === 0) {
      continue;
    }
    const baselineKeys = new Set(deletion.deletedRefs.map(entityRefKey));
    const hasNewDescendants = latestClosure.some((ref) => !baselineKeys.has(entityRefKey(ref)));
    if (hasNewDescendants || refsChanged(baseline, latest, latestClosure)) {
      incompatibilities.push({
        id: `deletion:local:${entityRefKey(deletion.root)}`,
        kind: 'deletion',
        direction: 'local-deletion',
        root: deletion.root,
        affectedRefs: latestClosure,
        dependencyFingerprint: stableFingerprint({
          direction: 'local-deletion',
          root: deletion.root,
          baseline: deletion.deletedRefs,
          latest: latestClosure,
          changed: fieldRecords(latest)
            .filter((record) => latestClosure.some((ref) => sameRef(ref, record.target)))
            .sort((left, right) => compareCanonicalText(fieldKey(left), fieldKey(right))),
        }),
      });
    } else {
      deleteExact(proposed, latestClosure);
      reviewedDeletions.push({ kind: 'delete', root: deletion.root, deletedRefs: clone(latestClosure) });
    }
  }

  const baselineFields = new Map(fieldRecords(baseline).map((record) => [fieldKey(record), record.value]));
  const latestFields = new Map(fieldRecords(latest).map((record) => [fieldKey(record), record.value]));
  for (const intent of state.patch.sets) {
    if (blockedRefs.has(entityRefKey(intent.target))) {
      continue;
    }
    if (!entityExists(latest, intent.target)) {
      continue;
    }
    const key = fieldKey(intent);
    const baselineValue = baselineFields.get(key);
    const latestValue = latestFields.get(key);
    if (fieldsEqual(intent.field, baselineValue, latestValue)) {
      setField(proposed, intent);
    } else if (!fieldsEqual(intent.field, latestValue, intent.value)) {
      incompatibilities.push(
        fieldIncompatibility(intent.target, intent.field, baselineValue, latestValue, intent.value)
      );
    }
  }

  const placementDraft = clone(proposed);
  const placementRequests: PlacementRequest[] = [];
  for (const creation of state.patch.creates) {
    const target = entityForNew(creation.entity);
    const owner = containerOwner(creation.placement.container);
    if (owner && blockedRefs.has(entityRefKey(owner))) {
      continue;
    }
    if (entityExists(latest, target)) {
      continue;
    }
    addEntityData(placementDraft, creation.entity);
    placementRequests.push({ target, destination: creation.placement });
  }

  const latestMoves = new Map(latestDiff.placements.map((intent) => [entityRefKey(intent.target), intent]));
  for (const intent of state.patch.placements) {
    if (blockedRefs.has(entityRefKey(intent.target)) || !entityExists(latest, intent.target)) {
      continue;
    }
    placementRequests.push({ target: intent.target, destination: intent.destination });
  }

  const placementFailures = applyPlacementBatch(placementDraft, placementRequests);
  for (const failure of placementFailures) {
    if (failure.kind === 'placement') {
      const original = state.patch.placements.find((intent) =>
        sameRef(intent.target, failure.request.target)
      )?.original;
      incompatibilities.push(
        placementIncompatibility(
          failure.request.target,
          original,
          findPlacement(latest, failure.request.target),
          failure.request.destination,
          failure.reason,
          latest
        )
      );
    } else {
      const localOrder = getOrder(state.draft, failure.container) ?? [];
      const latestOrder = getOrder(latest, failure.container) ?? [];
      const id = `order:${containerKey(failure.container)}`;
      const incompatibility: RulebookOrderingIncompatibility = {
        id,
        kind: 'collection-order',
        container: failure.container,
        latestOrder,
        localOrder,
        dependencyFingerprint: stableFingerprint({ container: failure.container, latestOrder, localOrder }),
      };
      incompatibilities.push(incompatibility);
    }
  }
  const competingMoves =
    placementFailures.length === 0
      ? state.patch.placements.filter((intent) => {
          const savedMove = latestMoves.get(entityRefKey(intent.target));
          return (
            savedMove !== undefined &&
            !samePlacement(findPlacement(placementDraft, intent.target), findPlacement(latest, intent.target))
          );
        })
      : [];
  for (const intent of competingMoves) {
    incompatibilities.push(
      placementIncompatibility(
        intent.target,
        intent.original,
        findPlacement(latest, intent.target),
        intent.destination,
        'competing-move',
        latest
      )
    );
  }
  if (placementFailures.length === 0 && competingMoves.length === 0) {
    proposed = placementDraft;
  }

  if (state.baseline.revision !== state.latest.revision) {
    const localAnchorTargets = new Set([
      ...state.patch.sets.filter((intent) => intent.field === 'anchor').map((intent) => entityRefKey(intent.target)),
      ...state.patch.creates.map((intent) => entityRefKey(entityForNew(intent.entity))),
      ...state.patch.restorations.flatMap((intent) => snapshotRefs(intent.snapshot).map(entityRefKey)),
    ]);
    const latestAnchors = anchorEntries(latest);
    for (const local of anchorEntries(proposed).filter(({ ref }) => localAnchorTargets.has(entityRefKey(ref)))) {
      const collision = latestAnchors.find(({ ref, anchor }) => anchor === local.anchor && !sameRef(ref, local.ref));
      if (!collision) {
        continue;
      }
      const id = `anchor:${entityRefKey(local.ref)}`;
      const conflict: RulebookAnchorIncompatibility = {
        id,
        kind: 'anchor',
        target: local.ref,
        value: local.anchor,
        collidesWith: collision.ref,
        suggestedValue: anchorSuggestion(proposed, local.anchor),
        dependencyFingerprint: stableFingerprint({
          target: local.ref,
          value: local.anchor,
          collidesWith: collision.ref,
          namespace: [...latestAnchors].sort((left, right) =>
            compareCanonicalText(entityRefKey(left.ref), entityRefKey(right.ref))
          ),
        }),
      };
      incompatibilities.push(conflict);
    }
  }

  const deduplicated = incompatibilities.filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index
  );
  const candidateLedger = state.ledger.filter((approval) => {
    const incompatibility = deduplicated.find((item) => item.id === approval.incompatibilityId);
    return (
      incompatibility?.dependencyFingerprint === approval.dependencyFingerprint &&
      outcomeFits(incompatibility, approval, proposed)
    );
  });
  const comparisonDraft = clone(proposed);
  const restoredRoots: RulebookEntityRef[] = [];
  const approvalPlacements: PlacementRequest[] = [];

  for (const incompatibility of deduplicated) {
    const approval = candidateLedger.find((candidate) => candidate.incompatibilityId === incompatibility.id);
    if (!approval) {
      continue;
    }
    const outcome = approval.outcome;
    if (
      incompatibility.kind === 'field' &&
      ((incompatibility.field === 'anchor' && outcome.kind === 'anchor') ||
        (incompatibility.field === 'text' && outcome.kind === 'text'))
    ) {
      setField(comparisonDraft, fieldIntent(incompatibility.target, incompatibility.field, outcome.value));
    } else if (incompatibility.kind === 'anchor' && outcome.kind === 'anchor') {
      setField(comparisonDraft, fieldIntent(incompatibility.target, 'anchor', outcome.value));
    } else if (incompatibility.kind === 'placement' && outcome.kind === 'placement') {
      approvalPlacements.push({ target: incompatibility.target, destination: outcome.destination });
    } else if (incompatibility.kind === 'collection-order' && outcome.kind === 'collection-order') {
      const order = getOrder(comparisonDraft, incompatibility.container);
      if (order) {
        order.splice(0, order.length, ...outcome.orderedIds);
      }
    } else if (incompatibility.kind === 'deletion' && incompatibility.direction === 'saved-deletion') {
      if (outcome.kind === 'restore-local-subtree' && incompatibility.localRestorations) {
        deleteExact(
          comparisonDraft,
          incompatibility.affectedRefs.filter((ref) => entityExists(comparisonDraft, ref))
        );
        for (const restoration of incompatibility.localRestorations) {
          restoreSnapshot(comparisonDraft, restoration.snapshot, restoration.placement);
          restoredRoots.push(restoration.root);
        }
      }
    } else if (
      incompatibility.kind === 'deletion' &&
      incompatibility.direction === 'local-deletion' &&
      outcome.kind === 'keep-local-deletion'
    ) {
      deleteExact(comparisonDraft, incompatibility.affectedRefs);
      reviewedDeletions.push({
        kind: 'delete',
        root: incompatibility.root,
        deletedRefs: clone([...incompatibility.affectedRefs]),
      });
    }
  }
  const approvalFailures = applyPlacementBatch(comparisonDraft, approvalPlacements);
  const invalidAnchorApprovals = new Set<string>();
  for (const approval of candidateLedger) {
    const incompatibility = deduplicated.find((item) => item.id === approval.incompatibilityId);
    const target =
      incompatibility?.kind === 'anchor' || (incompatibility?.kind === 'field' && incompatibility.field === 'anchor')
        ? incompatibility.target
        : undefined;
    if (!target || approval.outcome.kind !== 'anchor' || approval.outcome.value === undefined) {
      continue;
    }
    const anchorValue = approval.outcome.value;
    if (anchorEntries(comparisonDraft).some(({ ref, anchor }) => !sameRef(ref, target) && anchor === anchorValue)) {
      invalidAnchorApprovals.add(approval.incompatibilityId);
    }
  }
  const validLedger = candidateLedger.filter((approval) => !invalidAnchorApprovals.has(approval.incompatibilityId));
  const allResolved =
    deduplicated.length > 0 && validLedger.length === deduplicated.length && approvalFailures.length === 0;

  return {
    autoDraft: proposed,
    comparisonDraft,
    incompatibilities: deduplicated,
    validLedger,
    allResolved,
    restoredRoots,
    reviewedDeletions,
  };
}

function placementIncompatibility(
  target: RulebookEntityRef,
  baseline: RulebookPlacement | undefined,
  latest: RulebookPlacement | undefined,
  local: RulebookPlacement,
  reason: RulebookPlacementIncompatibility['reason'],
  dependencyContents: RulebookContentsDraftV1
): RulebookPlacementIncompatibility {
  const normalized = resolveGap(dependencyContents, target, local);
  const destinationOrder = getOrder(dependencyContents, local.container) ?? [];
  return {
    id: `placement:${entityRefKey(target)}`,
    kind: 'placement',
    target,
    baseline,
    latest,
    local,
    reason,
    dependencyFingerprint: stableFingerprint({
      target: entityRefKey(target),
      targetExists: entityExists(dependencyContents, target),
      destination: containerKey(local.container),
      boundaries: normalized
        ? { afterId: normalized.afterId, beforeId: normalized.beforeId }
        : {
            afterId: local.afterId !== null && destinationOrder.includes(local.afterId) ? local.afterId : null,
            beforeId: local.beforeId !== null && destinationOrder.includes(local.beforeId) ? local.beforeId : null,
          },
    }),
  };
}

function outcomeFits(
  incompatibility: RulebookIncompatibility,
  approval: RulebookResolutionApproval,
  proposed: RulebookContentsDraftV1
): boolean {
  const outcome = approval.outcome;
  if (incompatibility.kind === 'field') {
    if (incompatibility.field === 'text') {
      return outcome.kind === 'text' && typeof outcome.value === 'string';
    }
    return outcome.kind === 'anchor' && (incompatibility.target.kind === 'block' || typeof outcome.value === 'string');
  }
  if (incompatibility.kind === 'anchor') {
    if (outcome.kind !== 'anchor' || outcome.value === undefined) {
      return false;
    }
    return !anchorEntries(proposed).some(
      ({ ref, anchor }) => !sameRef(ref, incompatibility.target) && anchor === outcome.value
    );
  }
  if (incompatibility.kind === 'placement') {
    return (
      outcome.kind === 'placement' && resolveGap(proposed, incompatibility.target, outcome.destination) !== undefined
    );
  }
  if (incompatibility.kind === 'collection-order') {
    const current = getOrder(proposed, incompatibility.container);
    return (
      outcome.kind === 'collection-order' &&
      sameContainer(outcome.container, incompatibility.container) &&
      current !== undefined &&
      current.length === outcome.orderedIds.length &&
      current.every((id) => outcome.orderedIds.includes(id))
    );
  }
  return incompatibility.direction === 'saved-deletion'
    ? outcome.kind === 'accept-saved-deletion' || outcome.kind === 'restore-local-subtree'
    : outcome.kind === 'keep-local-deletion' || outcome.kind === 'accept-latest-subtree';
}

function stabilize(state: ReadyState): Reconciliation {
  for (let pass = 0; pass < 3; pass += 1) {
    const reconciliation = reconcile(state);
    state.ledger = reconciliation.validLedger;
    if (reconciliation.incompatibilities.length === 0) {
      if (state.baseline.revision !== state.latest.revision) {
        state.baseline = clone(state.latest);
        state.draft = reconciliation.autoDraft;
        state.patch = diffContents(state.latest.contents, state.draft, state.latest.revision, {
          restorationRoots: state.patch.restorations.map(({ root }) => root),
          reviewedDeletions: reconciliation.reviewedDeletions,
        });
        state.ledger = [];
        continue;
      }
      return reconciliation;
    }
    if (reconciliation.allResolved) {
      state.baseline = clone(state.latest);
      state.draft = reconciliation.comparisonDraft;
      state.patch = diffContents(state.latest.contents, state.draft, state.latest.revision, {
        restorationRoots: reconciliation.restoredRoots,
        reviewedDeletions: reconciliation.reviewedDeletions,
      });
      state.ledger = [];
      continue;
    }
    return reconciliation;
  }
  return reconcile(state);
}

function readyResult(state: ReadyState): RulebookEditorReadyResult {
  const reconciliation = reconcile(state);
  const validation = validateDraft(state.draft);
  const hasUnresolved = reconciliation.incompatibilities.length > 0;
  const saveCandidate = hasUnresolved ? undefined : validation.candidate;
  const hasChanges = patchHasChanges(state.patch);
  const canSave = Boolean(saveCandidate && hasChanges && !state.isSaving);
  return {
    status: 'ready',
    draft: clone(state.draft),
    comparisonDraft: clone(reconciliation.comparisonDraft),
    latest: clone(state.latest),
    diagnostics: validation.diagnostics,
    saveCandidate,
    incompatibilities: clone(reconciliation.incompatibilities),
    resolutionLedger: clone(reconciliation.validLedger),
    rebasedPatch: clone(state.patch),
    canSave,
    isSaving: state.isSaving,
    saveRequest: state.saveInFlight
      ? { expectedRevision: state.saveInFlight.revision, contents: clone(state.saveInFlight.contents) }
      : canSave && saveCandidate
        ? { expectedRevision: state.latest.revision, contents: clone(saveCandidate) }
        : undefined,
    operationError: state.operationError,
  };
}

function dispatchReady(
  state: ReadyState,
  action: RulebookEditorAction,
  authoritativeRevision?: SavedRulebookRevision
): void {
  state.operationError = undefined;
  if (action.kind === 'receive-latest' || action.kind === 'save-stale') {
    if (!authoritativeRevision) {
      throw new Error('The incoming saved revision was not validated');
    }
    state.latest = clone(authoritativeRevision);
    if (action.kind === 'save-stale') {
      state.isSaving = false;
      state.saveInFlight = undefined;
    }
    rememberPageLayouts(state, state.latest.contents);
    stabilize(state);
    return;
  }
  if (action.kind === 'save-succeeded') {
    if (!authoritativeRevision) {
      throw new Error('The saved result was not validated');
    }
    const saved = clone(authoritativeRevision);
    const saveInFlight = state.saveInFlight;
    if (saveInFlight) {
      state.patch = diffContents(saveInFlight.contents, state.draft, saveInFlight.revision);
      state.baseline = { revision: saveInFlight.revision, contents: clone(saveInFlight.contents) };
      state.latest = clone(saved);
    } else {
      state.baseline = clone(saved);
      state.latest = clone(saved);
      state.draft = clone(saved.contents) as RulebookContentsDraftV1;
      state.patch = emptyPatch(saved.revision);
    }
    state.ledger = [];
    state.isSaving = false;
    state.saveInFlight = undefined;
    rememberPageLayouts(state, state.draft);
    stabilize(state);
    return;
  }
  if (action.kind === 'begin-save') {
    const result = readyResult(state);
    if (!result.canSave || !result.saveRequest) {
      throw new Error('Save is not available for the current Rulebook draft');
    }
    state.saveInFlight = {
      revision: result.saveRequest.expectedRevision,
      contents: clone(result.saveRequest.contents),
    };
    state.isSaving = true;
    return;
  }
  if (action.kind === 'resolve') {
    state.ledger = [
      ...state.ledger.filter((approval) => approval.incompatibilityId !== action.approval.incompatibilityId),
      clone(action.approval),
    ];
    stabilize(state);
    return;
  }

  if (action.kind === 'replace-draft') {
    const layoutIssue = immutableLayoutError(state.knownPageLayouts, action.draft);
    if (layoutIssue) {
      throw new Error(layoutIssue);
    }
  }
  const nextDraft = action.kind === 'replace-draft' ? clone(action.draft) : clone(state.draft);
  if (action.kind === 'create') {
    const target = addEntityData(nextDraft, action.entity);
    const failures = applyPlacementBatch(nextDraft, [{ target, destination: action.placement }]);
    if (failures.length > 0) {
      throw new Error('The new entity needs a valid destination gap');
    }
  } else if (action.kind === 'delete') {
    const closure = ownedClosure(nextDraft, action.root);
    if (closure.length === 0) {
      throw new Error('The entity to delete does not exist');
    }
    deleteExact(nextDraft, closure);
  } else if (action.kind === 'set') {
    setField(nextDraft, action);
  } else if (action.kind === 'place') {
    const failures = applyPlacementBatch(nextDraft, [{ target: action.target, destination: action.destination }]);
    if (failures.length > 0) {
      throw new Error('The destination gap is not valid for this entity');
    }
  }

  const structuralIssue = structuralError(nextDraft);
  if (structuralIssue) {
    throw new Error(structuralIssue);
  }
  state.draft = nextDraft;
  rememberPageLayouts(state, state.draft);
  state.patch = diffContents(state.baseline.contents, state.draft, state.baseline.revision, {
    restorationRoots: state.patch.restorations.map(({ root }) => root),
    reviewedDeletions: state.patch.deletes,
  });
  stabilize(state);
}

function unsupportedManager(unsupported: { received: unknown; message: string }): RulebookEditorStateManager {
  const result = (): RulebookEditorResult => ({
    status: 'unsupported',
    received: clone(unsupported.received),
    message: unsupported.message,
    canSave: false,
    isSaving: false,
  });
  return {
    get result() {
      return result();
    },
    dispatch() {
      return result();
    },
  };
}

function restoreReadyState(target: ReadyState, source: ReadyState): void {
  target.baseline = clone(source.baseline);
  target.latest = clone(source.latest);
  target.draft = clone(source.draft);
  target.patch = clone(source.patch);
  target.ledger = clone(source.ledger);
  target.knownPageLayouts = clone(source.knownPageLayouts);
  target.isSaving = source.isSaving;
  target.saveInFlight = clone(source.saveInFlight);
  target.operationError = source.operationError;
}

function operationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The Rulebook edit could not be applied.';
}

function failedReadyResult(state: ReadyState): RulebookEditorReadyResult {
  return {
    status: 'ready',
    draft: clone(state.draft),
    comparisonDraft: clone(state.draft),
    latest: clone(state.latest),
    diagnostics: [],
    incompatibilities: [],
    resolutionLedger: clone(state.ledger),
    rebasedPatch: clone(state.patch),
    canSave: false,
    isSaving: state.isSaving,
    operationError: state.operationError,
  };
}

function safeReadyResult(state: ReadyState): RulebookEditorReadyResult {
  const before = clone(state);
  try {
    return readyResult(state);
  } catch (error) {
    restoreReadyState(state, before);
    state.operationError = operationErrorMessage(error);
    return failedReadyResult(state);
  }
}

function schemaVersionOf(value: unknown): unknown {
  return value && typeof value === 'object' && 'schemaVersion' in value
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined;
}

/**
 * The browser editor membrane.
 * Callers provide saved state and current intent, then dispatch semantic editor or save-lifecycle actions;
 * reconciliation, patch compaction, approvals, and eligibility stay inside.
 */
export function createRulebookEditorStateManager(input: RulebookEditorInput): RulebookEditorStateManager {
  const baseline = rulebookContentsV1Schema.safeParse(input.baseline.contents);
  const latest = rulebookContentsV1Schema.safeParse(input.latest.contents);
  const patch = rulebookEditPatchV1Schema.safeParse(input.patch);
  if (!baseline.success || !latest.success) {
    const hasUnsupportedVersion = [input.baseline.contents, input.latest.contents].some(
      (contents) => schemaVersionOf(contents) !== undefined && schemaVersionOf(contents) !== 1
    );
    return unsupportedManager({
      received: input,
      message: hasUnsupportedVersion
        ? 'This Rulebook uses a schema version this application does not support. Reload or use a compatible application version.'
        : 'This Rulebook contains invalid saved data and cannot be edited or saved. Reload without discarding the received data.',
    });
  }
  if (!patch.success) {
    const patchVersion = schemaVersionOf(input.patch);
    return unsupportedManager({
      received: input,
      message:
        patchVersion !== undefined && patchVersion !== 1
          ? 'This Rulebook edit uses a patch version this application does not support. Reload or use a compatible application version.'
          : 'This Rulebook edit patch is invalid and cannot be applied. Reload before editing.',
    });
  }
  const initialLayoutIssue = immutableLayoutError(pageLayoutMemory(baseline.data), latest.data);
  const patchIssue = patchValidationError(baseline.data, patch.data);
  if (
    initialLayoutIssue !== undefined ||
    patch.data.baselineRevision !== input.baseline.revision ||
    patchIssue !== undefined
  ) {
    return unsupportedManager({
      received: input,
      message:
        initialLayoutIssue ?? patchIssue ?? 'The edit patch baseline does not match the saved Rulebook revision.',
    });
  }

  let draft: RulebookContentsDraftV1;
  try {
    draft = applyPatch(baseline.data, patch.data);
  } catch {
    return unsupportedManager({
      received: input,
      message: 'This Rulebook edit patch is not compatible with its reconciliation baseline.',
    });
  }

  const core: ReadyState = {
    baseline: { revision: input.baseline.revision, contents: baseline.data },
    latest: { revision: input.latest.revision, contents: latest.data },
    draft,
    patch: clone(patch.data),
    ledger: clone([...input.resolutionLedger]),
    knownPageLayouts: {
      ...pageLayoutMemory(baseline.data),
      ...pageLayoutMemory(latest.data),
      ...pageLayoutMemory(draft),
    },
    isSaving: false,
  };
  stabilize(core);
  let unsupported: { received: unknown; message: string } | undefined;
  let cachedResult = safeReadyResult(core);

  return {
    get result() {
      return unsupported ? unsupportedManager(unsupported).result : cachedResult;
    },
    dispatch(action) {
      if (unsupported) {
        return unsupportedManager(unsupported).result;
      }
      const receivedRevision =
        action.kind === 'receive-latest' || action.kind === 'save-stale'
          ? action.latest
          : action.kind === 'save-succeeded'
            ? action.saved
            : undefined;
      let authoritativeRevision: SavedRulebookRevision | undefined;
      if (receivedRevision) {
        const incoming = rulebookContentsV1Schema.safeParse(receivedRevision.contents);
        const layoutIssue = incoming.success ? immutableLayoutError(core.knownPageLayouts, incoming.data) : undefined;
        if (!incoming.success || layoutIssue) {
          unsupported = {
            received: receivedRevision,
            message:
              layoutIssue ??
              'This saved Rulebook revision is unsupported or invalid. Reload or use a compatible application version before editing.',
          };
          return unsupportedManager(unsupported).result;
        }
        authoritativeRevision = { revision: receivedRevision.revision, contents: incoming.data };
      }
      const before = clone(core);
      try {
        dispatchReady(core, action, authoritativeRevision);
        cachedResult = readyResult(core);
        return cachedResult;
      } catch (error) {
        restoreReadyState(core, before);
        core.operationError = operationErrorMessage(error);
        cachedResult = safeReadyResult(core);
        return cachedResult;
      }
    },
  };
}
