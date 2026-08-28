import {
  closestCenter,
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  CollisionDetection,
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Alert, Badge, Box, Button, Group, Menu, Stack, Text, TextInput } from '@mantine/core';
import {
  createRulebookLocalId,
  getRulebookLayout,
  rulebookBlockKinds,
  rulebookLayoutCatalogue,
} from '@shared/rulebooks/contents';
import type {
  RulebookBlockDraft,
  RulebookBlockKind,
  RulebookBlockRegionKey,
  RulebookContentsDraftV1,
  RulebookPageDraft,
  RulebookPageLayoutId,
} from '@shared/rulebooks/contents';
import { createFileRoute } from '@tanstack/react-router';
import { ControlBlock } from '@ui/control/ControlBlock';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import type { DocumentEditorFit } from '@ui/layout/DocumentEditorLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { NestedTabs } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  Circle,
  FileImage,
  FileText,
  Hexagon,
  Layers3,
  Link2,
  ListTree,
  MessageSquareQuote,
  Plus,
  SlidersHorizontal,
  Triangle,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentPropsWithoutRef, CSSProperties, KeyboardEvent, ReactNode } from 'react';

import styles from './edit.module.css';
import { rulebookBlockEditors } from './edit/-rulebookBlockEditors';
import { rulebookControlRegionEditors } from './edit/-rulebookControlRegionEditors';
import { createRulebookEditorStateManager } from './edit/-rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './edit/-rulebookEditorState';
import { createEditorialRulebookEditorInput } from './edit/-rulebookEditorState.fixtures';
import { PageDetailsEdit } from './edit/-rulebookPageDetailsEdit';
import type {
  RulebookPageDetailsBlockMoveIntent,
  RulebookPageDetailsBlockRegion,
  RulebookPageDetailsDropStatus,
} from './edit/-rulebookPageDetailsEdit';

type ReadyResult = Extract<RulebookEditorResult, { status: 'ready' }>;
type BlockPlacement = Readonly<{ regionKey: RulebookBlockRegionKey; index: number }>;
type ActiveEditorPath =
  | Readonly<{ pageId: string; kind: 'details'; path: readonly [string, 'details']; hash: string }>
  | Readonly<{ pageId: string; kind: 'control'; regionKey: string; path: readonly [string, string]; hash: string }>
  | Readonly<{ pageId: string; kind: 'block'; blockId: string; path: readonly [string, string]; hash: string }>;
type RailDragData =
  | Readonly<{ kind: 'page'; pageId: string }>
  | Readonly<{ kind: 'block'; pageId: string; blockId: string; regionKey: RulebookBlockRegionKey }>
  | Readonly<{
      kind: 'region';
      pageId: string;
      regionKey: RulebookBlockRegionKey;
      dropEnabled: boolean;
    }>;
type ActiveRailDrag = Readonly<{ kind: 'page'; pageId: string }> | Readonly<{ kind: 'block'; blockId: string }>;

const pageLayoutLabels = Object.fromEntries(
  rulebookLayoutCatalogue.map((layout) => [layout.id, layout.label])
) as Record<RulebookPageLayoutId, string>;

const blockKindLabels = {
  text: 'Text',
  'repeated-text': 'Repeated text',
  'rule-group': 'Rule group',
  'asset-figure': 'Asset figure',
} satisfies Record<RulebookBlockKind, string>;

const restrictDragToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const railCollision: CollisionDetection = (args) => {
  const activeData = railDragData(args.active);
  if (activeData?.kind !== 'block') {
    const pageContainers = args.droppableContainers.filter(
      (container) => (container.data.current as RailDragData | undefined)?.kind === 'page'
    );
    return closestCenter({ ...args, droppableContainers: pageContainers });
  }

  const regionContainers = args.droppableContainers.filter(
    (container) => (container.data.current as RailDragData | undefined)?.kind === 'region'
  );
  const centerY = args.pointerCoordinates?.y ?? args.collisionRect.top + args.collisionRect.height / 2;
  const containingRegion = regionContainers.find((container) => {
    const rect = args.droppableRects.get(container.id);
    return rect ? centerY >= rect.top && centerY <= rect.bottom : false;
  });
  const nearestRegion = containingRegion
    ? undefined
    : closestCenter({ ...args, droppableContainers: regionContainers })[0];
  const regionContainer = containingRegion ?? regionContainers.find((container) => container.id === nearestRegion?.id);
  const regionData = regionContainer?.data.current as RailDragData | undefined;
  if (!regionContainer || regionData?.kind !== 'region' || !regionData.dropEnabled) {
    return [];
  }

  const blockContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as RailDragData | undefined;
    return data?.kind === 'block' && data.regionKey === regionData.regionKey && container.id !== args.active.id;
  });
  return closestCenter({
    ...args,
    droppableContainers: blockContainers.length > 0 ? blockContainers : [regionContainer],
  });
};

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit')({
  component: RulebookEditorPage,
});

function pageIcon(layoutId: RulebookPageLayoutId) {
  if (layoutId === 'chapter-opener') {
    return <Triangle />;
  }
  if (layoutId === 'visual-reference') {
    return <Hexagon />;
  }
  return <Circle />;
}

function blockIcon(kind: RulebookBlockKind) {
  if (kind === 'rule-group') {
    return <ListTree />;
  }
  if (kind === 'repeated-text') {
    return <MessageSquareQuote />;
  }
  if (kind === 'asset-figure') {
    return <FileImage />;
  }
  return <FileText />;
}

function blockLabel(block: RulebookBlockDraft) {
  if (block.kind === 'rule-group') {
    return block.title || 'Untitled rule group';
  }
  if (block.kind === 'asset-figure' && block.assetId) {
    return block.assetId;
  }
  if (block.kind === 'text') {
    return block.text || blockKindLabels[block.kind];
  }
  const firstItem = block.kind === 'repeated-text' ? block.itemsById[block.itemOrder[0] ?? ''] : undefined;
  return firstItem?.text || blockKindLabels[block.kind];
}

function blockOrders(page: RulebookPageDraft) {
  return page.blockOrderByRegion as Record<RulebookBlockRegionKey, string[]>;
}

function findBlockPlacement(page: RulebookPageDraft, blockId: string): BlockPlacement | null {
  for (const [regionKey, ids] of Object.entries(blockOrders(page))) {
    const index = ids.indexOf(blockId);
    if (index !== -1) {
      return { regionKey: regionKey as RulebookBlockRegionKey, index };
    }
  }
  return null;
}

function destinationForOrder(order: readonly string[], index: number) {
  return { afterId: order[index - 1] ?? null, beforeId: order[index + 1] ?? null };
}

function normalizeBlockPlacement(page: RulebookPageDraft, blockId: string, placement: BlockPlacement): BlockPlacement {
  const source = findBlockPlacement(page, blockId);
  const targetIds = blockOrders(page)[placement.regionKey] ?? [];
  const maximumIndex = targetIds.length - (source?.regionKey === placement.regionKey ? 1 : 0);
  return { regionKey: placement.regionKey, index: Math.max(0, Math.min(placement.index, maximumIndex)) };
}

function blockDropStatus(
  page: RulebookPageDraft,
  blockId: string,
  targetRegionKey: RulebookBlockRegionKey
): RulebookPageDetailsDropStatus {
  const block = page.blocksById[blockId];
  const source = findBlockPlacement(page, blockId);
  const region = getRulebookLayout(page.layoutId).regions.find(
    (candidate) => candidate.kind === 'block' && candidate.key === targetRegionKey
  );
  if (!block || !source || !region || region.kind !== 'block') {
    return { allowed: false, reason: 'The placement no longer exists.' };
  }
  if (!(region.acceptedBlockKinds as readonly RulebookBlockKind[]).includes(block.kind)) {
    return { allowed: false, reason: `${region.label} does not accept ${blockKindLabels[block.kind]} Blocks.` };
  }
  const currentCount = blockOrders(page)[targetRegionKey]?.length ?? 0;
  const countWithoutDraggedBlock = currentCount - (source.regionKey === targetRegionKey ? 1 : 0);
  if (region.cardinality.maximum !== null && countWithoutDraggedBlock >= region.cardinality.maximum) {
    return { allowed: false, reason: `${region.label} is full.` };
  }
  return { allowed: true, reason: `${region.label} accepts this Block.` };
}

function targetPlacementFromRailOver(page: RulebookPageDraft, over: DragOverEvent['over']): BlockPlacement | null {
  const data = railDragData(over);
  if (!data || data.kind === 'page' || data.pageId !== page.id) {
    return null;
  }
  if (data.kind === 'region') {
    return { regionKey: data.regionKey, index: blockOrders(page)[data.regionKey]?.length ?? 0 };
  }
  const target = findBlockPlacement(page, data.blockId);
  return target ? { regionKey: target.regionKey, index: target.index } : null;
}

function createPage(layoutId: RulebookPageLayoutId, id: string, anchor: string): RulebookPageDraft {
  if (layoutId === 'chapter-opener') {
    return {
      id,
      anchor,
      title: 'New chapter',
      layoutId,
      controlValues: { 'chapter-label': 'Chapter' },
      blockOrderByRegion: { feature: [] },
      blocksById: {},
    };
  }
  if (layoutId === 'rules-page') {
    return {
      id,
      anchor,
      title: 'New rules page',
      layoutId,
      controlValues: { guidance: { eyebrow: 'Rules', introduction: '' } },
      blockOrderByRegion: { rules: [], examples: [] },
      blocksById: {},
    };
  }
  return {
    id,
    anchor,
    title: 'New reference',
    layoutId,
    controlValues: {},
    blockOrderByRegion: { figures: [], notes: [] },
    blocksById: {},
  };
}

function createBlock(kind: RulebookBlockKind, id: string): RulebookBlockDraft {
  if (kind === 'rule-group') {
    return { id, kind, title: 'Untitled rule group', text: 'Replace this starter content with the rule text.' };
  }
  if (kind === 'repeated-text') {
    return { id, kind, itemOrder: [], itemsById: {} };
  }
  if (kind === 'text') {
    return { id, kind, text: 'Replace this starter content with your text.' };
  }
  return { id, kind, text: 'Add a short caption for this figure.' };
}

function editorHash(pageId: string, leaf: string) {
  return `#${encodeURIComponent(pageId)}/${encodeURIComponent(leaf)}`;
}

function activeEditorPath(draft: RulebookContentsDraftV1, hash: string): ActiveEditorPath | null {
  const firstPageId = draft.pageOrder[0];
  if (!firstPageId) {
    return null;
  }
  const [rawPageId, rawLeaf] = hash
    .replace(/^#/, '')
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part ?? '');
      } catch {
        return '';
      }
    });
  const pageId = rawPageId && draft.pagesById[rawPageId] ? rawPageId : firstPageId;
  const page = draft.pagesById[pageId]!;
  const leaf = rawLeaf || 'details';
  if (leaf === 'details') {
    return { pageId, kind: 'details', path: [pageId, 'details'], hash: editorHash(pageId, 'details') };
  }
  const controlRegion = getRulebookLayout(page.layoutId).regions.find(
    (region) => region.kind === 'control' && region.key === leaf
  );
  if (controlRegion?.kind === 'control') {
    return { pageId, kind: 'control', regionKey: leaf, path: [pageId, leaf], hash: editorHash(pageId, leaf) };
  }
  if (page.blocksById[leaf]) {
    return { pageId, kind: 'block', blockId: leaf, path: [pageId, leaf], hash: editorHash(pageId, leaf) };
  }
  return { pageId, kind: 'details', path: [pageId, 'details'], hash: editorHash(pageId, 'details') };
}

function subscribeToHash(change: () => void) {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}

function useEditorHash() {
  return useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => ''
  );
}

function railDragData(value: { data: { current?: unknown } } | null): RailDragData | null {
  return (value?.data.current as RailDragData | undefined) ?? null;
}

interface RailPageRootProps extends ComponentPropsWithoutRef<'a'> {
  dragId: string;
  pageId: string;
}

function RailPageRoot({ dragId, pageId, style, children, ...rootProps }: RailPageRootProps) {
  const data: RailDragData = { kind: 'page', pageId };
  const { active } = useDndContext();
  const activeData = railDragData(active);
  const draggable = useDraggable({ id: dragId, data, disabled: activeData !== null && activeData.kind !== 'page' });
  const droppable = useDroppable({ id: dragId, data, disabled: activeData !== null && activeData.kind !== 'page' });
  const setNodeRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };
  const { role: _role, tabIndex: _tabIndex, 'aria-pressed': _pressed, ...dragAttributes } = draggable.attributes;
  const translatedStyle: CSSProperties = {
    ...style,
    transform: draggable.transform ? `translate3d(0, ${draggable.transform.y}px, 0)` : undefined,
  };
  return (
    <a
      {...rootProps}
      {...dragAttributes}
      {...draggable.listeners}
      ref={setNodeRef}
      style={translatedStyle}
      draggable={false}
      data-rail-dragging={draggable.isDragging || undefined}
      data-rail-over={droppable.isOver || undefined}
    >
      {children}
    </a>
  );
}

interface RailBlockRootProps extends ComponentPropsWithoutRef<'a'> {
  dragId: string;
  pageId: string;
  blockId: string;
  regionKey: RulebookBlockRegionKey;
  dropEnabled: boolean;
}

function RailBlockRoot({
  dragId,
  pageId,
  blockId,
  regionKey,
  dropEnabled,
  style,
  children,
  ...rootProps
}: RailBlockRootProps) {
  const data: RailDragData = { kind: 'block', pageId, blockId, regionKey };
  const { active } = useDndContext();
  const activeData = railDragData(active);
  const sortable = useSortable({
    id: dragId,
    data,
    disabled: {
      draggable: activeData !== null && activeData.kind !== 'block',
      droppable: (activeData !== null && activeData.kind !== 'block') || !dropEnabled,
    },
  });
  const { role: _role, tabIndex: _tabIndex, 'aria-pressed': _pressed, ...dragAttributes } = sortable.attributes;
  const translatedStyle: CSSProperties = {
    ...style,
    transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
    transition: sortable.transition,
  };
  return (
    <a
      {...rootProps}
      {...dragAttributes}
      {...sortable.listeners}
      ref={sortable.setNodeRef}
      style={translatedStyle}
      draggable={false}
      data-rail-dragging={sortable.isDragging || undefined}
      data-rail-over={sortable.isOver || undefined}
    >
      {children}
    </a>
  );
}

interface RailRegionRootProps extends ComponentPropsWithoutRef<'li'> {
  pageId: string;
  regionKey: RulebookBlockRegionKey;
  sortableIds: string[];
  dropEnabled: boolean;
}

function RailRegionRoot({ pageId, regionKey, sortableIds, dropEnabled, children, ...rootProps }: RailRegionRootProps) {
  const { active } = useDndContext();
  const activeData = railDragData(active);
  const droppable = useDroppable({
    id: `rail:region:${pageId}:${regionKey}`,
    data: { kind: 'region', pageId, regionKey, dropEnabled } satisfies RailDragData,
    disabled: activeData !== null && activeData.kind !== 'block',
  });
  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      <li {...rootProps} ref={droppable.setNodeRef} data-rail-over={droppable.isOver || undefined}>
        {children}
      </li>
    </SortableContext>
  );
}

function AddMenu<Value extends string>({
  label,
  values,
  onPick,
}: Readonly<{ label: string; values: readonly Value[]; onPick: (value: Value) => void }>) {
  return (
    <Menu position="right-end" withinPortal>
      <Menu.Target>
        <button type="button" className={styles.railTool} aria-label={label}>
          <Plus aria-hidden />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        {values.map((value) => (
          <Menu.Item key={value} onClick={() => onPick(value)}>
            {value in pageLayoutLabels
              ? pageLayoutLabels[value as RulebookPageLayoutId]
              : blockKindLabels[value as RulebookBlockKind]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function blockEditorPanel(block: RulebookBlockDraft, replaceBlock: (block: RulebookBlockDraft) => void) {
  const anchorControl = (
    <ControlBlock
      title="Anchor"
      description="Set the stable public anchor used in links to this Block."
      input={
        <TextInput
          aria-label="Anchor"
          leftSection={<Link2 size={16} aria-hidden />}
          leftSectionPointerEvents="none"
          value={block.anchor ?? ''}
          onChange={(event) => replaceBlock({ ...block, anchor: event.currentTarget.value || undefined })}
        />
      }
    />
  );
  if (block.kind === 'text') {
    const Edit = rulebookBlockEditors.text;
    return (
      <Stack gap="lg">
        {anchorControl}
        <Edit value={{ text: block.text }} onChange={(value) => replaceBlock({ ...block, ...value })} />
      </Stack>
    );
  }
  if (block.kind === 'rule-group') {
    const Edit = rulebookBlockEditors['rule-group'];
    return (
      <Stack gap="lg">
        {anchorControl}
        <Edit
          value={{ title: block.title, text: block.text }}
          onChange={(value) => replaceBlock({ ...block, ...value })}
        />
      </Stack>
    );
  }
  if (block.kind === 'asset-figure') {
    const Edit = rulebookBlockEditors['asset-figure'];
    return (
      <Stack gap="lg">
        {anchorControl}
        <Edit
          value={{ assetId: block.assetId, text: block.text }}
          onChange={(value) => replaceBlock({ ...block, ...value })}
        />
      </Stack>
    );
  }
  const Edit = rulebookBlockEditors['repeated-text'];
  return (
    <Stack gap="lg">
      {anchorControl}
      <Edit
        value={{ itemOrder: block.itemOrder, itemsById: block.itemsById }}
        onChange={(value) => replaceBlock({ ...block, ...value })}
      />
    </Stack>
  );
}

function controlRegionPanel(
  page: RulebookPageDraft,
  regionKey: string,
  replacePage: (page: RulebookPageDraft) => void
) {
  if (page.layoutId === 'chapter-opener' && regionKey === 'chapter-label') {
    const Edit = rulebookControlRegionEditors['chapter-opener']['chapter-label'];
    return (
      <Edit
        value={page.controlValues['chapter-label']}
        onChange={(value) => replacePage({ ...page, controlValues: { 'chapter-label': value } })}
      />
    );
  }
  if (page.layoutId === 'rules-page' && regionKey === 'guidance') {
    const Edit = rulebookControlRegionEditors['rules-page'].guidance;
    return (
      <Edit
        value={page.controlValues.guidance}
        onChange={(value) => replacePage({ ...page, controlValues: { guidance: value } })}
      />
    );
  }
  return <Alert color="red">This Control region has no matching editor.</Alert>;
}

function PreviewPlaceholder({ page }: Readonly<{ page: RulebookPageDraft }>) {
  return (
    <div className={styles.previewPlaceholder} aria-label="Rulebook preview placeholder">
      <Text size="xs" tt="uppercase" c="dimmed">
        Preview
      </Text>
      <div aria-hidden />
      <Text size="sm" c="dimmed">
        {page.title}
      </Text>
    </div>
  );
}

function RulebookWorkspace({
  result,
  dispatch,
  fit,
}: Readonly<{
  result: ReadyResult;
  dispatch: RulebookEditorStateManager['dispatch'];
  fit: DocumentEditorFit;
}>) {
  const hash = useEditorHash();
  const active = activeEditorPath(result.draft, hash);
  const activeHash = active?.hash;
  const [collapsedRegionKeys, setCollapsedRegionKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [activeRailDrag, setActiveRailDrag] = useState<ActiveRailDrag | null>(null);
  const lastValidBlockPlacement = useRef<BlockPlacement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space] },
    })
  );

  useEffect(() => {
    if (activeHash && window.location.hash !== activeHash) {
      window.history.replaceState(null, '', activeHash);
    }
  }, [activeHash]);

  if (!active) {
    return <Alert color="yellow">This Rulebook has no Page to display.</Alert>;
  }

  const page = result.draft.pagesById[active.pageId]!;
  const layout = getRulebookLayout(page.layoutId);
  const replaceDraft = (draft: RulebookContentsDraftV1) => dispatch({ kind: 'replace-draft', draft });
  const replacePage = (nextPage: RulebookPageDraft) =>
    replaceDraft({ ...result.draft, pagesById: { ...result.draft.pagesById, [page.id]: nextPage } });
  const replaceBlock = (nextBlock: RulebookBlockDraft) =>
    replacePage({ ...page, blocksById: { ...page.blocksById, [nextBlock.id]: nextBlock } });

  const requestBlockPlacement = (blockId: string, placement: BlockPlacement) => {
    const source = findBlockPlacement(page, blockId);
    if (!source) {
      return;
    }
    const targetIds = blockOrders(page)[placement.regionKey] ?? [];
    const withoutActive = targetIds.filter((id) => id !== blockId);
    const insertionIndex = Math.max(0, Math.min(placement.index, withoutActive.length));
    const order = [...withoutActive];
    order.splice(insertionIndex, 0, blockId);
    const index = order.indexOf(blockId);
    dispatch({
      kind: 'place',
      target: { kind: 'block', pageId: page.id, blockId },
      destination: {
        container: { kind: 'block-region', pageId: page.id, regionKey: placement.regionKey },
        ...destinationForOrder(order, index),
      },
    });
  };

  const addPage = (layoutId: RulebookPageLayoutId) => {
    const pageId = createRulebookLocalId(result.draft.pageOrder);
    const nextPage = createPage(layoutId, pageId, `page-${pageId.toLowerCase()}`);
    dispatch({
      kind: 'create',
      entity: { kind: 'page', page: nextPage },
      placement: {
        container: { kind: 'page-order' },
        afterId: result.draft.pageOrder.at(-1) ?? null,
        beforeId: null,
      },
    });
    window.location.hash = editorHash(pageId, 'details');
  };

  const firstAvailableRegion = (kind: RulebookBlockKind) =>
    layout.regions.find((region) => {
      if (region.kind !== 'block' || !(region.acceptedBlockKinds as readonly RulebookBlockKind[]).includes(kind)) {
        return false;
      }
      const count = blockOrders(page)[region.key]?.length ?? 0;
      return region.cardinality.maximum === null || count < region.cardinality.maximum;
    });

  const addBlock = (regionKey: RulebookBlockRegionKey, kind: RulebookBlockKind) => {
    const blockId = createRulebookLocalId(Object.keys(page.blocksById));
    const ids = blockOrders(page)[regionKey] ?? [];
    dispatch({
      kind: 'create',
      entity: { kind: 'block', pageId: page.id, block: createBlock(kind, blockId) },
      placement: {
        container: { kind: 'block-region', pageId: page.id, regionKey },
        afterId: ids.at(-1) ?? null,
        beforeId: null,
      },
    });
    window.location.hash = editorHash(page.id, blockId);
  };

  const handleRailDragStart = ({ active: dragActive }: DragStartEvent) => {
    const data = railDragData(dragActive);
    if (!data || data.kind === 'region') {
      return;
    }
    if (data.kind === 'page') {
      setActiveRailDrag({ kind: 'page', pageId: data.pageId });
      return;
    }
    const placement = findBlockPlacement(page, data.blockId);
    lastValidBlockPlacement.current = placement;
    setActiveRailDrag({ kind: 'block', blockId: data.blockId });
  };

  const handleRailDragOver = ({ active: dragActive, over }: DragOverEvent) => {
    const activeData = railDragData(dragActive);
    const overData = railDragData(over);
    if (!activeData || !overData) {
      return;
    }
    if (activeData.kind === 'page') {
      return;
    }
    if (activeData.kind !== 'block') {
      return;
    }
    const placement = targetPlacementFromRailOver(page, over);
    if (!placement) {
      return;
    }
    const normalized = normalizeBlockPlacement(page, activeData.blockId, placement);
    if (!blockDropStatus(page, activeData.blockId, normalized.regionKey).allowed) {
      return;
    }
    lastValidBlockPlacement.current = normalized;
  };

  const finishRailDrag = () => {
    setActiveRailDrag(null);
    lastValidBlockPlacement.current = null;
  };

  const finishRailDragAfterClick = () => {
    window.requestAnimationFrame(finishRailDrag);
  };

  const handleRailDragEnd = ({ active: dragActive, over }: DragEndEvent) => {
    const activeData = railDragData(dragActive);
    if (activeData?.kind === 'page') {
      const overData = railDragData(over);
      if (overData?.kind === 'page') {
        const from = result.draft.pageOrder.indexOf(activeData.pageId);
        const to = result.draft.pageOrder.indexOf(overData.pageId);
        if (from !== -1 && to !== -1 && from !== to) {
          const nextOrder = [...result.draft.pageOrder];
          nextOrder.splice(from, 1);
          nextOrder.splice(to, 0, activeData.pageId);
          dispatch({
            kind: 'place',
            target: { kind: 'page', pageId: activeData.pageId },
            destination: { container: { kind: 'page-order' }, ...destinationForOrder(nextOrder, to) },
          });
        }
      }
    } else if (activeData?.kind === 'block') {
      const placement = targetPlacementFromRailOver(page, over);
      const normalized = placement ? normalizeBlockPlacement(page, activeData.blockId, placement) : null;
      const finalPlacement =
        normalized && blockDropStatus(page, activeData.blockId, normalized.regionKey).allowed
          ? normalized
          : lastValidBlockPlacement.current;
      if (finalPlacement) {
        requestBlockPlacement(activeData.blockId, finalPlacement);
      }
    }
    finishRailDragAfterClick();
  };

  const handleRailDragCancel = (_event: DragCancelEvent) => {
    finishRailDragAfterClick();
  };

  const detailsRegions: RulebookPageDetailsBlockRegion[] = layout.regions.flatMap((region) => {
    if (region.kind !== 'block') {
      return [];
    }
    const ids = blockOrders(page)[region.key] ?? [];
    const collapseKey = `${page.id}:${region.key}`;
    return [
      {
        key: region.key,
        label: region.label,
        acceptedBlockKinds: region.acceptedBlockKinds,
        minimum: region.cardinality.minimum,
        maximum: region.cardinality.maximum,
        blocks: ids.flatMap((id) => page.blocksById[id] ?? []),
        collapsed: collapsedRegionKeys.has(collapseKey),
        containsActiveBlock: active.kind === 'block' && ids.includes(active.blockId),
        canAddBlock: region.cardinality.maximum === null || ids.length < region.cardinality.maximum,
      },
    ];
  });

  const pageDiagnostic = (field: 'anchor' | 'title') =>
    result.diagnostics.find(
      (diagnostic) =>
        diagnostic.field === field && diagnostic.target?.kind === 'page' && diagnostic.target.pageId === page.id
    )?.message;

  const panel: ReactNode =
    active.kind === 'details' ? (
      <PageDetailsEdit
        value={{ anchor: page.anchor, title: page.title }}
        diagnostics={{ anchor: pageDiagnostic('anchor'), title: pageDiagnostic('title') }}
        regions={detailsRegions}
        onChange={(value) => replacePage({ ...page, ...value })}
        onNavigateBlock={(blockId) => {
          window.location.hash = editorHash(page.id, blockId);
        }}
        onAddBlock={addBlock}
        onToggleBlockRegion={(regionKey, collapsed) => {
          const key = `${page.id}:${regionKey}`;
          setCollapsedRegionKeys((current) => {
            const next = new Set(current);
            if (collapsed) {
              next.add(key);
            } else {
              next.delete(key);
            }
            return next;
          });
        }}
        getBlockDropStatus={(blockId, regionKey) => blockDropStatus(page, blockId, regionKey)}
        onMoveBlock={({ blockId, regionKey, index }: RulebookPageDetailsBlockMoveIntent) =>
          requestBlockPlacement(blockId, { regionKey, index })
        }
      />
    ) : active.kind === 'control' ? (
      controlRegionPanel(page, active.regionKey, replacePage)
    ) : (
      blockEditorPanel(page.blocksById[active.blockId]!, replaceBlock)
    );

  const availableBlockKinds = rulebookBlockKinds.filter((kind) => firstAvailableRegion(kind));
  const onWorkspaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
      return;
    }
    const scrollTrack = event.currentTarget.querySelector<HTMLElement>('[data-document-editor-layout]');
    if (!scrollTrack || scrollTrack.scrollWidth <= scrollTrack.clientWidth) {
      return;
    }
    event.preventDefault();
    scrollTrack.scrollBy({ left: event.key === 'ArrowLeft' ? -48 : 48 });
  };

  return (
    <Box role="region" aria-label="Rulebook editor and preview" tabIndex={0} onKeyDown={onWorkspaceKeyDown}>
      <DocumentEditorLayout ratio={210 / 297} fit={fit}>
        <DocumentEditorLayout.Sidebar>
          <DndContext
            sensors={sensors}
            modifiers={[restrictDragToVerticalAxis]}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            collisionDetection={railCollision}
            onDragStart={handleRailDragStart}
            onDragOver={handleRailDragOver}
            onDragEnd={handleRailDragEnd}
            onDragCancel={handleRailDragCancel}
          >
            <NestedTabs activePath={active.path} ariaLabel="Rulebook structure" className={styles.nestedTabs}>
              <NestedTabs.Level label="Pages">
                <SortableContext
                  items={result.draft.pageOrder.map((pageId) => `rail:page:${pageId}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {result.draft.pageOrder.map((pageId) => {
                    const candidate = result.draft.pagesById[pageId];
                    return candidate ? (
                      <NestedTabs.Item
                        as={RailPageRoot}
                        path={[pageId]}
                        label={candidate.title}
                        icon={pageIcon(candidate.layoutId)}
                        href={activeRailDrag ? undefined : editorHash(pageId, 'details')}
                        dragId={`rail:page:${pageId}`}
                        pageId={pageId}
                        key={pageId}
                      />
                    ) : null;
                  })}
                </SortableContext>
                <NestedTabs.Tools>
                  <AddMenu
                    label="Add Page"
                    values={rulebookLayoutCatalogue.map((candidate) => candidate.id)}
                    onPick={addPage}
                  />
                </NestedTabs.Tools>
              </NestedTabs.Level>
              <NestedTabs.Level label={page.title}>
                <NestedTabs.Item
                  as="a"
                  path={[page.id, 'details']}
                  label="Page details"
                  icon={<SlidersHorizontal />}
                  href={editorHash(page.id, 'details')}
                />
                {layout.regions.map((region) => {
                  if (region.kind === 'control') {
                    return (
                      <NestedTabs.Item
                        as="a"
                        path={[page.id, region.key]}
                        label={region.label}
                        icon={<SlidersHorizontal />}
                        href={editorHash(page.id, region.key)}
                        key={region.key}
                      />
                    );
                  }
                  const ids = blockOrders(page)[region.key] ?? [];
                  const eligibility =
                    activeRailDrag?.kind === 'block'
                      ? blockDropStatus(page, activeRailDrag.blockId, region.key).allowed
                        ? 'compatible'
                        : 'incompatible'
                      : undefined;
                  const dropEnabled = eligibility !== 'incompatible';
                  return (
                    <NestedTabs.Group
                      as={RailRegionRoot}
                      label={region.label}
                      icon={<Layers3 />}
                      pageId={page.id}
                      regionKey={region.key}
                      sortableIds={ids.map((blockId) => `rail:block:${blockId}`)}
                      dropEnabled={dropEnabled}
                      className={styles.railGroup}
                      data-drop-eligibility={eligibility}
                      key={region.key}
                    >
                      {ids.map((blockId) => {
                        const block = page.blocksById[blockId];
                        return block ? (
                          <NestedTabs.Item
                            as={RailBlockRoot}
                            path={[page.id, blockId]}
                            label={blockLabel(block)}
                            icon={blockIcon(block.kind)}
                            href={activeRailDrag ? undefined : editorHash(page.id, blockId)}
                            dragId={`rail:block:${blockId}`}
                            pageId={page.id}
                            blockId={blockId}
                            regionKey={region.key}
                            dropEnabled={dropEnabled}
                            key={blockId}
                          />
                        ) : null;
                      })}
                    </NestedTabs.Group>
                  );
                })}
                <NestedTabs.Tools>
                  <AddMenu
                    label="Add Block"
                    values={availableBlockKinds}
                    onPick={(kind) => {
                      const region = firstAvailableRegion(kind);
                      if (region?.kind === 'block') {
                        addBlock(region.key, kind);
                      }
                    }}
                  />
                </NestedTabs.Tools>
              </NestedTabs.Level>
              <NestedTabs.ContentPanel aria-label={`${page.title} editor`}>{panel}</NestedTabs.ContentPanel>
            </NestedTabs>
          </DndContext>
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <PreviewPlaceholder page={page} />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

function RulebookEditorPage() {
  const [manager] = useState(() => createRulebookEditorStateManager(createEditorialRulebookEditorInput()));
  const [result, setResult] = useState<RulebookEditorResult>(() => manager.result);
  const [fit, setFit] = useState<DocumentEditorFit>('height');
  const [saveLabel, setSaveLabel] = useState('Save');
  const dispatch: RulebookEditorStateManager['dispatch'] = (action) => {
    const next = manager.dispatch(action);
    setResult(next);
    setSaveLabel('Save');
    return next;
  };

  if (result.status !== 'ready') {
    return (
      <PageLayout>
        <PageLayout.Content>
          <Alert color="red" role="alert" title="This Rulebook could not open">
            {result.message}
          </Alert>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const hasLocalChanges = Object.values(result.rebasedPatch)
    .filter(Array.isArray)
    .some((value) => value.length > 0);
  const save = () => {
    const saving = manager.dispatch({ kind: 'begin-save' });
    if (saving.status !== 'ready' || !saving.saveRequest) {
      setResult(saving);
      return;
    }
    const saved = manager.dispatch({
      kind: 'save-succeeded',
      saved: { revision: `local-${Date.now()}`, contents: saving.saveRequest.contents },
    });
    setResult(saved);
    setSaveLabel('Saved');
  };

  return (
    <PageLayout>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="nowrap">
              <Badge
                variant="light"
                color={result.incompatibilities.length > 0 ? 'red' : hasLocalChanges ? 'yellow' : 'gray'}
              >
                {result.incompatibilities.length > 0
                  ? `${result.incompatibilities.length} conflicts`
                  : hasLocalChanges
                    ? 'Local changes'
                    : 'Saved draft'}
              </Badge>
              {result.operationError ? (
                <Text c="red" size="sm">
                  {result.operationError}
                </Text>
              ) : null}
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant="default"
                onClick={() => setFit((value) => (value === 'height' ? 'width' : 'height'))}
              >
                Fit {fit === 'height' ? 'width' : 'height'}
              </Button>
              <Button size="xs" color="confirm" disabled={!result.canSave} onClick={save}>
                {saveLabel}
              </Button>
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <section className={styles.editorRoot} aria-label="Rulebook editing workspace">
          <RulebookWorkspace result={result} dispatch={dispatch} fit={fit} />
        </section>
      </PageLayout.Content>
    </PageLayout>
  );
}
