import { normalizeFormattedText } from '@shared/formattedText';
import { rulebookAnchorSchema, rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type {
  RulebookBlockDraft,
  RulebookContentsDraftV1,
  RulebookContentsV1,
  RulebookPageDraft,
} from '@shared/rulebooks/contents';

import type {
  RulebookAnchorIncompatibility,
  RulebookCreateIntent,
  RulebookDeleteIntent,
  RulebookDraftSubtree,
  RulebookEditPatchV1,
  RulebookEditorAction,
  RulebookEditorInput,
  RulebookEditorReadyResult,
  RulebookEditorResult,
  RulebookEditorStateManager,
  RulebookEntityRef,
  RulebookFieldDiagnostic,
  RulebookFieldIncompatibility,
  RulebookIncompatibility,
  RulebookNewEntity,
  RulebookOrderedContainerRef,
  RulebookOrderingIncompatibility,
  RulebookPlacement,
  RulebookPlacementIncompatibility,
  RulebookPlaceIntent,
  RulebookResolutionApproval,
  RulebookRestoreIntent,
  RulebookSetIntent,
  SavedRulebookRevision,
} from './RulebookEditorState';

type ReadyState = {
  baseline: SavedRulebookRevision;
  latest: SavedRulebookRevision;
  draft: RulebookContentsDraftV1;
  patch: RulebookEditPatchV1;
  ledger: RulebookResolutionApproval[];
  isSaving: boolean;
  operationError?: string;
};

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
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  });
}

function pageSlotEntries(page: RulebookPageDraft): Array<[string, string[]]> {
  return Object.entries(page.slots) as Array<[string, string[]]>;
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
  return refs.sort((left, right) => entityRefKey(left).localeCompare(entityRefKey(right)));
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
      containers.push({ kind: 'page-slot', pageId: page.id, slotId: slotId as 'body' | 'left' | 'right' });
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
  for (const ref of [...refs].sort((left, right) => entityRefKey(right).localeCompare(entityRefKey(left)))) {
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

function applyPlacementBatch(
  contents: RulebookContentsDraftV1,
  requests: readonly PlacementRequest[]
): PlacementBatchFailure[] {
  if (requests.length === 0) {
    return [];
  }

  const failures: PlacementBatchFailure[] = [];
  removeFromPlacements(
    contents,
    requests.map(({ target }) => target)
  );
  const groups = new Map<string, { container: RulebookOrderedContainerRef; requests: PlacementRequest[] }>();

  for (const request of requests) {
    if (!entityExists(contents, request.target) || !containerAccepts(request.destination.container, request.target)) {
      failures.push({ kind: 'placement', request, reason: 'cross-container-neighbor' });
      continue;
    }
    const key = containerKey(request.destination.container);
    const group = groups.get(key) ?? { container: request.destination.container, requests: [] };
    group.requests.push(request);
    groups.set(key, group);
  }

  for (const { container, requests: groupRequests } of groups.values()) {
    const baseOrder = getOrder(contents, container);
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
    const nodes = [...baseOrder, ...groupRequests.map(({ target }) => entityId(target))];
    const nodeSet = new Set(nodes);
    const edges = new Map(nodes.map((id) => [id, new Set<string>()]));
    const addEdge = (from: string, to: string) => {
      if (from !== to) {
        edges.get(from)?.add(to);
      }
    };
    for (let index = 1; index < baseOrder.length; index += 1) {
      addEdge(baseOrder[index - 1]!, baseOrder[index]!);
    }

    let invalid = false;
    for (const request of groupRequests) {
      const targetId = entityId(request.target);
      const { afterId, beforeId } = request.destination;
      if ((afterId !== null && !nodeSet.has(afterId)) || (beforeId !== null && !nodeSet.has(beforeId))) {
        failures.push({ kind: 'placement', request, reason: 'missing-neighbor' });
        invalid = true;
        continue;
      }
      if (afterId === null && beforeId === null && baseOrder.length > 0) {
        failures.push({ kind: 'placement', request, reason: 'missing-neighbor' });
        invalid = true;
        continue;
      }
      if (afterId !== null) {
        addEdge(afterId, targetId);
      }
      if (beforeId !== null) {
        addEdge(targetId, beforeId);
      }
      if (afterId !== null && beforeId === null) {
        const next = baseOrder[baseOrder.indexOf(afterId) + 1];
        if (next) {
          addEdge(targetId, next);
        }
      }
      if (beforeId !== null && afterId === null) {
        const previous = baseOrder[baseOrder.indexOf(beforeId) - 1];
        if (previous) {
          addEdge(previous, targetId);
        }
      }
    }
    if (invalid) {
      continue;
    }

    const indegree = new Map(nodes.map((id) => [id, 0]));
    for (const outgoing of edges.values()) {
      for (const to of outgoing) {
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
    const ordered: string[] = [];
    while (ordered.length < nodes.length) {
      const next = nodes
        .filter((id) => !ordered.includes(id) && indegree.get(id) === 0)
        .sort((left, right) => left.localeCompare(right))[0];
      if (!next) {
        failures.push({ kind: 'cycle', container, requests: groupRequests });
        break;
      }
      ordered.push(next);
      for (const to of edges.get(next) ?? []) {
        indegree.set(to, indegree.get(to)! - 1);
      }
    }
    if (ordered.length === nodes.length) {
      const order = getOrder(contents, container)!;
      order.splice(0, order.length, ...ordered);
    }
  }

  return failures;
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

function validPatchShape(value: unknown): value is RulebookEditPatchV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const patch = value as Partial<RulebookEditPatchV1>;
  return (
    patch.schemaVersion === 1 &&
    typeof patch.baselineRevision === 'string' &&
    Array.isArray(patch.creates) &&
    Array.isArray(patch.deletes) &&
    Array.isArray(patch.sets) &&
    Array.isArray(patch.placements) &&
    Array.isArray(patch.restorations)
  );
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
  return left.join('\u0000').localeCompare(right.join('\u0000')) <= 0 ? left : right;
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
  return placements.sort((left, right) => entityRefKey(left.target).localeCompare(entityRefKey(right.target)));
}

function diffContents(
  source: RulebookContentsDraftV1,
  target: RulebookContentsDraftV1,
  baselineRevision: string,
  restorationRoots: readonly RulebookEntityRef[] = []
): RulebookEditPatchV1 {
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

  const creates: RulebookCreateIntent[] = newRefs.map((ref) => ({
    kind: 'create',
    entity: createEntityFromDraft(target, ref),
    placement: findPlacement(target, ref)!,
  }));

  const deletes: RulebookDeleteIntent[] = missingRefs
    .filter((ref) => {
      const parent = parentRef(source, ref);
      return !parent || !missingKeys.has(entityRefKey(parent));
    })
    .map((root) => ({
      kind: 'delete',
      root,
      deletedRefs: ownedClosure(source, root).filter((ref) => missingKeys.has(entityRefKey(ref))),
    }));

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
    sets.push({
      kind: 'set',
      target: record.target as never,
      field: record.field as never,
      value: record.value,
    } as RulebookSetIntent);
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
      entityRefKey(entityForNew(left.entity)).localeCompare(entityRefKey(entityForNew(right.entity)))
    ),
    deletes: deletes.sort((left, right) => entityRefKey(left.root).localeCompare(entityRefKey(right.root))),
    sets: sets.sort((left, right) => fieldKey(left).localeCompare(fieldKey(right))),
    placements: placementDiff(source, target, excluded),
    restorations: restorations.sort((left, right) => entityRefKey(left.root).localeCompare(entityRefKey(right.root))),
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

  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  const parsed = rulebookContentsV1Schema.safeParse(candidate);
  if (!parsed.success) {
    return {
      diagnostics: parsed.error.issues.map((issue) => ({
        field: 'structure',
        code: 'invalid-contents',
        message: issue.message,
      })),
    };
  }
  return { diagnostics: [], candidate: parsed.data };
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
  const range = (from: string, to: string) => {
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
  if (savedChange.end <= localChange.start || localChange.end <= savedChange.start) {
    return [savedChange, localChange]
      .sort((left, right) => right.start - left.start)
      .reduce((value, change) => value.slice(0, change.start) + change.replacement + value.slice(change.end), baseline);
  }
  return undefined;
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
    if (!samePlacement(findPlacement(baseline, ref), findPlacement(latest, ref))) {
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
  const proposed = clone(latest);
  const incompatibilities: RulebookIncompatibility[] = [];
  const blockedRefs = new Set<string>();
  const latestDiff = diffContents(baseline, latest, state.baseline.revision);

  for (const savedDeletion of latestDiff.deletes) {
    const closureKeys = new Set(savedDeletion.deletedRefs.map(entityRefKey));
    if (!patchTouchesRefs(state.patch, closureKeys)) {
      continue;
    }
    savedDeletion.deletedRefs.forEach((ref) => blockedRefs.add(entityRefKey(ref)));
    const rootExistsLocally = entityExists(state.draft, savedDeletion.root);
    const incompatibility = {
      id: `deletion:saved:${entityRefKey(savedDeletion.root)}`,
      kind: 'deletion' as const,
      direction: 'saved-deletion' as const,
      root: savedDeletion.root,
      affectedRefs: savedDeletion.deletedRefs,
      localSnapshot: rootExistsLocally ? snapshotSubtree(state.draft, savedDeletion.root) : undefined,
      localPlacement: rootExistsLocally ? findPlacement(state.draft, savedDeletion.root) : undefined,
      dependencyFingerprint: stableFingerprint({
        direction: 'saved-deletion',
        root: savedDeletion.root,
        affectedRefs: savedDeletion.deletedRefs,
        localSnapshot: rootExistsLocally ? snapshotSubtree(state.draft, savedDeletion.root) : undefined,
      }),
    };
    incompatibilities.push(incompatibility);
  }

  for (const deletion of state.patch.deletes) {
    if (blockedRefs.has(entityRefKey(deletion.root)) || !entityExists(latest, deletion.root)) {
      continue;
    }
    const latestClosure = ownedClosure(latest, deletion.root);
    const baselineKeys = new Set(deletion.deletedRefs.map(entityRefKey));
    const hasNewDescendants = latestClosure.some((ref) => !baselineKeys.has(entityRefKey(ref)));
    if (hasNewDescendants || refsChanged(baseline, latest, deletion.deletedRefs)) {
      incompatibilities.push({
        id: `deletion:local:${entityRefKey(deletion.root)}`,
        kind: 'deletion',
        direction: 'local-deletion',
        root: deletion.root,
        affectedRefs: [...deletion.deletedRefs, ...latestClosure].filter(
          (ref, index, all) => all.findIndex((candidate) => sameRef(candidate, ref)) === index
        ),
        dependencyFingerprint: stableFingerprint({
          direction: 'local-deletion',
          root: deletion.root,
          baseline: deletion.deletedRefs,
          latest: latestClosure,
          changed: fieldRecords(latest).filter((record) => latestClosure.some((ref) => sameRef(ref, record.target))),
        }),
      });
    } else {
      deleteExact(proposed, deletion.deletedRefs);
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
    addEntityData(proposed, creation.entity);
    const destination = resolveGap(proposed, target, creation.placement);
    if (destination) {
      placementRequests.push({ target, destination });
    } else {
      incompatibilities.push(
        placementIncompatibility(target, undefined, undefined, creation.placement, 'missing-neighbor')
      );
    }
  }

  const latestMoves = new Map(latestDiff.placements.map((intent) => [entityRefKey(intent.target), intent]));
  for (const intent of state.patch.placements) {
    if (blockedRefs.has(entityRefKey(intent.target)) || !entityExists(latest, intent.target)) {
      continue;
    }
    const destination = resolveGap(proposed, intent.target, intent.destination);
    if (!destination) {
      incompatibilities.push(
        placementIncompatibility(
          intent.target,
          intent.original,
          findPlacement(latest, intent.target),
          intent.destination,
          'missing-neighbor'
        )
      );
      continue;
    }
    const savedMove = latestMoves.get(entityRefKey(intent.target));
    const latestPlacement = findPlacement(latest, intent.target);
    if (!savedMove) {
      placementRequests.push({ target: intent.target, destination });
    } else if (!samePlacement(resolveGap(latest, intent.target, savedMove.destination), destination)) {
      incompatibilities.push(
        placementIncompatibility(intent.target, intent.original, latestPlacement, intent.destination, 'competing-move')
      );
    }
  }

  const placementFailures = applyPlacementBatch(proposed, placementRequests);
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
          failure.reason
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

  if (state.baseline.revision !== state.latest.revision) {
    const localAnchorTargets = new Set([
      ...state.patch.sets.filter((intent) => intent.field === 'anchor').map((intent) => entityRefKey(intent.target)),
      ...state.patch.creates.map((intent) => entityRefKey(entityForNew(intent.entity))),
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
          namespace: latestAnchors,
        }),
      };
      incompatibilities.push(conflict);
    }
  }

  const deduplicated = incompatibilities.filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index
  );
  const validLedger = state.ledger.filter((approval) => {
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
    const approval = validLedger.find((candidate) => candidate.incompatibilityId === incompatibility.id);
    if (!approval) {
      continue;
    }
    const outcome = approval.outcome;
    if ((incompatibility.kind === 'field' || incompatibility.kind === 'anchor') && outcome.kind === 'field') {
      setField(comparisonDraft, {
        kind: 'set',
        target: incompatibility.target as never,
        field: incompatibility.kind === 'anchor' ? 'anchor' : incompatibility.field,
        value: outcome.value,
      } as RulebookSetIntent);
    } else if (incompatibility.kind === 'placement' && outcome.kind === 'placement') {
      approvalPlacements.push({ target: incompatibility.target, destination: outcome.destination });
    } else if (incompatibility.kind === 'collection-order' && outcome.kind === 'collection-order') {
      const order = getOrder(comparisonDraft, outcome.container);
      if (order) {
        order.splice(0, order.length, ...outcome.orderedIds);
      }
    } else if (incompatibility.kind === 'deletion' && incompatibility.direction === 'saved-deletion') {
      if (outcome.kind === 'restore-local-subtree' && incompatibility.localSnapshot && incompatibility.localPlacement) {
        restoreSnapshot(comparisonDraft, incompatibility.localSnapshot, incompatibility.localPlacement);
        restoredRoots.push(incompatibility.root);
      }
    } else if (
      incompatibility.kind === 'deletion' &&
      incompatibility.direction === 'local-deletion' &&
      outcome.kind === 'keep-local-deletion'
    ) {
      deleteExact(comparisonDraft, ownedClosure(comparisonDraft, incompatibility.root));
    }
  }
  const approvalFailures = applyPlacementBatch(comparisonDraft, approvalPlacements);
  const allResolved =
    deduplicated.length > 0 && validLedger.length === deduplicated.length && approvalFailures.length === 0;

  return {
    autoDraft: proposed,
    comparisonDraft,
    incompatibilities: deduplicated,
    validLedger,
    allResolved,
    restoredRoots,
  };
}

function placementIncompatibility(
  target: RulebookEntityRef,
  baseline: RulebookPlacement | undefined,
  latest: RulebookPlacement | undefined,
  local: RulebookPlacement,
  reason: RulebookPlacementIncompatibility['reason']
): RulebookPlacementIncompatibility {
  return {
    id: `placement:${entityRefKey(target)}`,
    kind: 'placement',
    target,
    baseline,
    latest,
    local,
    reason,
    dependencyFingerprint: stableFingerprint({ target, baseline, latest, local, reason }),
  };
}

function outcomeFits(
  incompatibility: RulebookIncompatibility,
  approval: RulebookResolutionApproval,
  proposed: RulebookContentsDraftV1
): boolean {
  const outcome = approval.outcome;
  if (incompatibility.kind === 'field') {
    return outcome.kind === 'field';
  }
  if (incompatibility.kind === 'anchor') {
    if (outcome.kind !== 'field' || outcome.value === undefined) {
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
        state.patch = diffContents(state.latest.contents, state.draft, state.latest.revision);
        state.ledger = [];
        continue;
      }
      return reconciliation;
    }
    if (reconciliation.allResolved) {
      state.baseline = clone(state.latest);
      state.draft = reconciliation.comparisonDraft;
      state.patch = diffContents(
        state.latest.contents,
        state.draft,
        state.latest.revision,
        reconciliation.restoredRoots
      );
      state.ledger = [];
      continue;
    }
    return reconciliation;
  }
  return reconcile(state);
}

function readyResult(state: ReadyState): RulebookEditorReadyResult {
  const reconciliation = stabilize(state);
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
    saveRequest:
      canSave && saveCandidate
        ? { expectedRevision: state.latest.revision, contents: clone(saveCandidate) }
        : undefined,
    operationError: state.operationError,
  };
}

function dispatchReady(state: ReadyState, action: RulebookEditorAction): void {
  state.operationError = undefined;
  if (action.kind === 'receive-latest' || action.kind === 'save-stale') {
    const parsed = rulebookContentsV1Schema.safeParse(action.latest.contents);
    if (!parsed.success) {
      throw new Error('The incoming saved revision uses unsupported or invalid Rulebook Contents');
    }
    state.latest = { revision: action.latest.revision, contents: parsed.data };
    state.isSaving = false;
    stabilize(state);
    return;
  }
  if (action.kind === 'save-succeeded') {
    const parsed = rulebookContentsV1Schema.safeParse(action.saved.contents);
    if (!parsed.success) {
      throw new Error('The saved result uses unsupported or invalid Rulebook Contents');
    }
    const saved = { revision: action.saved.revision, contents: parsed.data };
    state.baseline = clone(saved);
    state.latest = clone(saved);
    state.draft = clone(saved.contents) as RulebookContentsDraftV1;
    state.patch = emptyPatch(saved.revision);
    state.ledger = [];
    state.isSaving = false;
    return;
  }
  if (action.kind === 'begin-save') {
    if (!readyResult(state).canSave) {
      throw new Error('Save is not available for the current Rulebook draft');
    }
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
  state.patch = diffContents(state.baseline.contents, state.draft, state.baseline.revision);
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

export function createRulebookEditorCore(input: RulebookEditorInput): RulebookEditorStateManager {
  const baseline = rulebookContentsV1Schema.safeParse(input.baseline.contents);
  const latest = rulebookContentsV1Schema.safeParse(input.latest.contents);
  if (
    !baseline.success ||
    !latest.success ||
    !validPatchShape(input.patch) ||
    input.patch.baselineRevision !== input.baseline.revision
  ) {
    return unsupportedManager({
      received: input,
      message: 'This Rulebook uses unsupported or invalid editor data. Reload or use a compatible application version.',
    });
  }

  let draft: RulebookContentsDraftV1;
  try {
    draft = applyPatch(baseline.data, input.patch);
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
    patch: clone(input.patch),
    ledger: clone([...input.resolutionLedger]),
    isSaving: false,
  };
  stabilize(core);

  return {
    get result() {
      return readyResult(core);
    },
    dispatch(action) {
      try {
        dispatchReady(core, action);
      } catch (error) {
        core.operationError = error instanceof Error ? error.message : 'The Rulebook edit could not be applied.';
      }
      return readyResult(core);
    },
  };
}
