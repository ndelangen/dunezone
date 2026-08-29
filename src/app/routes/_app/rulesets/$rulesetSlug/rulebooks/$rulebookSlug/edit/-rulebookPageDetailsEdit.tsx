import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  CollisionDetection,
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
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
import { Box, Menu, Stack, Text, TextInput, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import type {
  RulebookBlockDraft,
  RulebookBlockKind,
  RulebookBlockRegionKey,
  RulebookPageDraft,
} from '@shared/rulebooks/contents';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileImage,
  FileText,
  Layers3,
  Link2,
  ListTree,
  MessageSquareQuote,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { blockInsertionIndex, blockSlotInsertionIndex, verticalRectCenter } from './-rulebookBlockPlacement';
import type { BlockPlacement, VerticalRect } from './-rulebookBlockPlacement';
import {
  collisionPointerY,
  collisionsWithPointerY,
  pointerInsertionSlot,
  useCoalescedDragPosition,
} from './-rulebookDragCollision';
import styles from './-rulebookPageDetailsEdit.module.css';

export type RulebookPageDetailsValue = Readonly<Pick<RulebookPageDraft, 'title' | 'anchor'>>;

export type RulebookPageDetailsDiagnostics = Readonly<{
  title?: string;
  anchor?: string;
}>;

export type RulebookPageDetailsBlockRegion = Readonly<{
  key: RulebookBlockRegionKey;
  label: string;
  acceptedBlockKinds: readonly RulebookBlockKind[];
  minimum: number;
  maximum: number | null;
  blocks: readonly RulebookBlockDraft[];
  collapsed: boolean;
  containsActiveBlock: boolean;
  canAddBlock: boolean;
  diagnostic?: string;
}>;

export type RulebookPageDetailsDropStatus = Readonly<{
  allowed: boolean;
  reason: string;
}>;

export type RulebookPageDetailsBlockDragEvent =
  | Readonly<{ kind: 'start'; blockId: string; placement: BlockPlacement }>
  | Readonly<{ kind: 'preview'; blockId: string; placement: BlockPlacement }>
  | Readonly<{ kind: 'commit'; blockId: string; placement: BlockPlacement }>
  | Readonly<{ kind: 'cancel'; blockId: string }>;

export type RulebookPageDetailsEditProps = Readonly<{
  value: RulebookPageDetailsValue;
  diagnostics?: RulebookPageDetailsDiagnostics;
  regions: readonly RulebookPageDetailsBlockRegion[];
  onChange: (nextValue: RulebookPageDetailsValue) => void;
  onNavigateBlock: (blockId: string) => void;
  onAddBlock: (regionKey: RulebookBlockRegionKey, kind: RulebookBlockKind) => void;
  onToggleBlockRegion: (regionKey: RulebookBlockRegionKey, collapsed: boolean) => void;
  getBlockDropStatus: (blockId: string, regionKey: RulebookBlockRegionKey) => RulebookPageDetailsDropStatus;
  onBlockDrag: (event: RulebookPageDetailsBlockDragEvent) => void;
}>;

type BlockDragData =
  | Readonly<{
      kind: 'block';
      blockId: string;
      regionKey: RulebookBlockRegionKey;
      originRegionKey: RulebookBlockRegionKey;
    }>
  | Readonly<{
      kind: 'region';
      regionKey: RulebookBlockRegionKey;
      directTarget: boolean;
      dropEnabled: boolean;
    }>
  | Readonly<{
      kind: 'slot';
      targetBlockId: string;
      regionKey: RulebookBlockRegionKey;
      side: 'before' | 'after';
    }>;

const blockKindLabels = {
  text: 'Text',
  'repeated-text': 'Repeated text',
  'rule-group': 'Rule group',
  'asset-figure': 'Asset figure',
} satisfies Record<RulebookBlockKind, string>;

const restrictDragToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

function blockDragId(blockId: string) {
  return `page-details:block:${blockId}`;
}

function blockSlotId(blockId: string, side: 'before' | 'after') {
  return `page-details:slot:${blockId}:${side}`;
}

function ResponsiveRegionDescription({ id, label, text }: { id: string; label: string; text: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measurementRef = useRef<HTMLSpanElement>(null);
  const [usesHelp, setUsesHelp] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurement = measurementRef.current;
    if (!container || !measurement) {
      return;
    }

    const update = () => setUsesHelp(measurement.getBoundingClientRect().width > container.clientWidth);
    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measurement);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={containerRef} className={styles.regionDescription}>
      <VisuallyHidden id={id}>{text}</VisuallyHidden>
      <Text
        component="span"
        size="xs"
        c="dimmed"
        aria-hidden
        hidden={usesHelp}
        className={styles.regionDescriptionText}
      >
        {text}
      </Text>
      <span ref={measurementRef} aria-hidden className={styles.regionDescriptionMeasurement}>
        {text}
      </span>
      {usesHelp ? (
        <Tooltip
          label={text}
          multiline
          maw={360}
          position="top-start"
          withArrow
          events={{ hover: true, focus: true, touch: true }}
        >
          <Box
            component="span"
            role="img"
            aria-label={`${label} details`}
            aria-describedby={id}
            tabIndex={0}
            className={styles.regionHelp}
          >
            <CircleHelp size={14} aria-hidden />
          </Box>
        </Tooltip>
      ) : null}
    </span>
  );
}

function regionDropId(regionKey: RulebookBlockRegionKey) {
  return `page-details:region:${regionKey}`;
}

function idSuffix(id: string | number, prefix: string) {
  const value = String(id);
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function findBlockPlacement(
  regions: readonly RulebookPageDetailsBlockRegion[],
  blockId: string
): BlockPlacement | null {
  for (const region of regions) {
    const index = region.blocks.findIndex((block) => block.id === blockId);
    if (index !== -1) {
      return { regionKey: region.key, index };
    }
  }
  return null;
}

function findBlock(regions: readonly RulebookPageDetailsBlockRegion[], blockId: string) {
  for (const region of regions) {
    const block = region.blocks.find((candidate) => candidate.id === blockId);
    if (block) {
      return block;
    }
  }
  return undefined;
}

function samePlacement(left: BlockPlacement | null, right: BlockPlacement | null) {
  return left?.regionKey === right?.regionKey && left?.index === right?.index;
}

function normalizePlacement(
  regions: readonly RulebookPageDetailsBlockRegion[],
  blockId: string,
  placement: BlockPlacement
): BlockPlacement {
  const source = findBlockPlacement(regions, blockId);
  const target = regions.find((region) => region.key === placement.regionKey);
  if (!source || !target) {
    return placement;
  }
  const maximumIndex = target.blocks.length - (source.regionKey === target.key ? 1 : 0);
  return {
    regionKey: placement.regionKey,
    index: Math.max(0, Math.min(placement.index, maximumIndex)),
  };
}

function blockLabel(block: RulebookBlockDraft) {
  if (block.kind === 'rule-group' && block.title.trim()) {
    return block.title;
  }
  if (block.kind === 'asset-figure' && block.assetId?.trim()) {
    return block.assetId;
  }
  if (block.kind === 'repeated-text') {
    const firstItemId = block.itemOrder[0];
    const firstItem = firstItemId ? block.itemsById[firstItemId] : undefined;
    if (firstItem?.text.trim()) {
      return firstItem.text;
    }
  }
  if (block.kind === 'text' && block.text.trim()) {
    return block.text;
  }
  return `${blockKindLabels[block.kind]} Block`;
}

function blockIcon(kind: RulebookBlockKind): ReactNode {
  if (kind === 'rule-group') {
    return <ListTree aria-hidden />;
  }
  if (kind === 'repeated-text') {
    return <MessageSquareQuote aria-hidden />;
  }
  if (kind === 'asset-figure') {
    return <FileImage aria-hidden />;
  }
  return <FileText aria-hidden />;
}

function acceptedKindsLabel(kinds: readonly RulebookBlockKind[]) {
  return kinds.map((kind) => blockKindLabels[kind]).join(', ');
}

function capacityLabel(region: RulebookPageDetailsBlockRegion) {
  const blockCountLabel = (count: number) => `${count} Block${count === 1 ? '' : 's'}`;
  const minimum = region.minimum > 0 ? ` Minimum ${region.minimum}.` : '';
  if (region.maximum === null) {
    return `${blockCountLabel(region.blocks.length)}.${minimum}`;
  }
  return `${region.blocks.length} of ${blockCountLabel(region.maximum)}.${minimum}`;
}

const pageDetailsCollision: CollisionDetection = (args) => {
  const regionContainers = args.droppableContainers.filter(
    (container) => (container.data.current as BlockDragData | undefined)?.kind === 'region'
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
  const regionData = regionContainer?.data.current as BlockDragData | undefined;
  if (!regionContainer || regionData?.kind !== 'region') {
    return [];
  }
  if (!regionData.dropEnabled) {
    return [];
  }
  if (regionData.directTarget) {
    return closestCenter({ ...args, droppableContainers: [regionContainer] });
  }
  const activeData = args.active.data.current as BlockDragData | undefined;
  const slotContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as BlockDragData | undefined;
    return (
      data?.kind === 'slot' &&
      data.regionKey === regionData.regionKey &&
      (activeData?.kind !== 'block' || data.targetBlockId !== activeData.blockId)
    );
  });
  const rowContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as BlockDragData | undefined;
    return data?.kind === 'block' && data.regionKey === regionData.regionKey;
  });
  const usesInsertionSlots =
    args.pointerCoordinates && activeData?.kind === 'block' && activeData.originRegionKey !== regionData.regionKey;
  const targetContainers = usesInsertionSlots ? slotContainers : rowContainers;
  const insertionRows = rowContainers.filter((container) => {
    const data = container.data.current as BlockDragData | undefined;
    return data?.kind === 'block' && (activeData?.kind !== 'block' || data.blockId !== activeData.blockId);
  });
  const insertionSlot = usesInsertionSlots
    ? pointerInsertionSlot(slotContainers, insertionRows, args.pointerCoordinates!.y)
    : null;
  const pointerCollisions = insertionSlot ? closestCenter({ ...args, droppableContainers: [insertionSlot] }) : [];
  return collisionsWithPointerY(
    pointerCollisions.length > 0
      ? pointerCollisions
      : closestCenter({
          ...args,
          droppableContainers: targetContainers.length > 0 ? targetContainers : [regionContainer],
        }),
    args.pointerCoordinates?.y ?? null
  );
};

function BlockSummary({
  block,
  regionKey,
  dragOriginRegionKey,
  dropEnabled,
  disableSortingTransform,
  onNavigate,
}: Readonly<{
  block: RulebookBlockDraft;
  regionKey: RulebookBlockRegionKey;
  dragOriginRegionKey: RulebookBlockRegionKey | null;
  dropEnabled: boolean;
  disableSortingTransform: boolean;
  onNavigate: () => void;
}>) {
  const { active, activatorEvent } = useDndContext();
  const activeData = active?.data.current as BlockDragData | undefined;
  const insertionSlotsEnabled =
    activeData?.kind === 'block' &&
    activeData.originRegionKey !== regionKey &&
    dropEnabled &&
    (typeof KeyboardEvent === 'undefined' || !(activatorEvent instanceof KeyboardEvent));
  const sortable = useSortable({
    id: blockDragId(block.id),
    data: {
      kind: 'block',
      blockId: block.id,
      regionKey,
      originRegionKey: dragOriginRegionKey ?? regionKey,
    } satisfies BlockDragData,
    disabled: { droppable: !dropEnabled },
  });
  const beforeSlot = useDroppable({
    id: blockSlotId(block.id, 'before'),
    data: {
      kind: 'slot',
      targetBlockId: block.id,
      regionKey,
      side: 'before',
    } satisfies BlockDragData,
    disabled: !insertionSlotsEnabled,
  });
  const afterSlot = useDroppable({
    id: blockSlotId(block.id, 'after'),
    data: {
      kind: 'slot',
      targetBlockId: block.id,
      regionKey,
      side: 'after',
    } satisfies BlockDragData,
    disabled: !insertionSlotsEnabled,
  });
  const style: CSSProperties = {
    transform:
      !disableSortingTransform && sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
    transition: disableSortingTransform ? undefined : sortable.transition,
  };
  const label = blockLabel(block);

  return (
    <li
      ref={sortable.setNodeRef}
      className={styles.blockSummary}
      style={style}
      data-dragging={sortable.isDragging || undefined}
    >
      <span ref={beforeSlot.setNodeRef} className={styles.blockDropSlot} data-side="before" aria-hidden />
      <span ref={afterSlot.setNodeRef} className={styles.blockDropSlot} data-side="after" aria-hidden />
      <UnstyledButton
        ref={sortable.setActivatorNodeRef}
        className={styles.blockNavigate}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`Edit ${label}`}
        onClick={(event) => {
          if (sortable.isDragging) {
            event.preventDefault();
            return;
          }
          onNavigate();
        }}
      >
        <span className={styles.blockIcon}>{blockIcon(block.kind)}</span>
        <span className={styles.blockWords}>
          <Text component="span" fw={700} truncate>
            {label}
          </Text>
        </span>
      </UnstyledButton>
    </li>
  );
}

function BlockDragPreview({ block, width }: Readonly<{ block: RulebookBlockDraft; width: number | null }>) {
  return (
    <div
      className={`${styles.blockSummary} ${styles.blockDragPreview}`}
      style={{ inlineSize: width ?? undefined }}
      data-block-drag-preview
    >
      <div className={styles.blockNavigate}>
        <span className={styles.blockIcon}>{blockIcon(block.kind)}</span>
        <span className={styles.blockWords}>
          <Text component="span" fw={700} truncate>
            {blockLabel(block)}
          </Text>
        </span>
      </div>
    </div>
  );
}

function BlockRegionSummary({
  region,
  activeBlockId,
  dragOriginRegionKey,
  disableSortingTransforms,
  getBlockDropStatus,
  onNavigateBlock,
  onAddBlock,
  onToggle,
}: Readonly<{
  region: RulebookPageDetailsBlockRegion;
  activeBlockId: string | null;
  dragOriginRegionKey: RulebookBlockRegionKey | null;
  disableSortingTransforms: boolean;
  getBlockDropStatus: RulebookPageDetailsEditProps['getBlockDropStatus'];
  onNavigateBlock: RulebookPageDetailsEditProps['onNavigateBlock'];
  onAddBlock: RulebookPageDetailsEditProps['onAddBlock'];
  onToggle: RulebookPageDetailsEditProps['onToggleBlockRegion'];
}>) {
  const dropStatus = activeBlockId ? getBlockDropStatus(activeBlockId, region.key) : null;
  const dropEnabled = dropStatus?.allowed === true;
  const droppable = useDroppable({
    id: regionDropId(region.key),
    data: {
      kind: 'region',
      regionKey: region.key,
      directTarget: region.collapsed || region.blocks.length === 0,
      dropEnabled,
    } satisfies BlockDragData,
    disabled: activeBlockId === null,
  });
  const contentId = `page-details-region-${region.key}`;
  const description = `Accepts ${acceptedKindsLabel(region.acceptedBlockKinds)}. ${capacityLabel(region)}`;

  return (
    <section
      ref={droppable.setNodeRef}
      className={styles.region}
      aria-label={region.label}
      aria-describedby={`${contentId}-description`}
      data-contains-active-block={region.containsActiveBlock || undefined}
      data-drop-eligibility={activeBlockId ? (dropEnabled ? 'compatible' : 'incompatible') : undefined}
    >
      <div className={styles.blockRegionHeader} data-region-header>
        <span className={styles.regionIcon}>
          <Layers3 aria-hidden />
        </span>
        <span className={styles.regionWords}>
          <Text component="span" fw={700} className={styles.regionTitle}>
            {region.label}
          </Text>
          <ResponsiveRegionDescription id={`${contentId}-description`} label={region.label} text={description} />
          {activeBlockId && dropStatus && !dropStatus.allowed ? (
            <Text component="span" size="xs" className={styles.visuallyHidden} aria-live="polite">
              {dropStatus.reason}
            </Text>
          ) : null}
        </span>
        <div className={styles.regionActions}>
          <IconAction
            label={`${region.collapsed ? 'Expand' : 'Collapse'} ${region.label}`}
            icon={region.collapsed ? <ChevronRight size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
            variant="subtle"
            color="gray"
            size="sm"
            aria-expanded={!region.collapsed}
            aria-controls={contentId}
            onClick={() => onToggle(region.key, !region.collapsed)}
          />
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <AddAction label={`Add a Block to ${region.label}`} disabled={!region.canAddBlock} />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Block type</Menu.Label>
              {region.acceptedBlockKinds.map((kind) => (
                <Menu.Item key={kind} leftSection={blockIcon(kind)} onClick={() => onAddBlock(region.key, kind)}>
                  {blockKindLabels[kind]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
      {region.diagnostic ? (
        <Text component="div" size="xs" c="red" className={styles.regionDiagnostic}>
          {region.diagnostic}
        </Text>
      ) : null}

      <SortableContext
        items={region.blocks.map((block) => blockDragId(block.id))}
        strategy={verticalListSortingStrategy}
      >
        <ul id={contentId} className={styles.blockList} hidden={region.collapsed}>
          {region.blocks.map((block) => (
            <BlockSummary
              key={block.id}
              block={block}
              regionKey={region.key}
              dragOriginRegionKey={dragOriginRegionKey}
              dropEnabled={activeBlockId === null || dropEnabled}
              disableSortingTransform={disableSortingTransforms}
              onNavigate={() => onNavigateBlock(block.id)}
            />
          ))}
          {region.blocks.length === 0 ? (
            <Text component="li" size="sm" c="dimmed" className={styles.emptyRegion}>
              No Blocks in this region.
            </Text>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}

function placementFromOver(
  regions: readonly RulebookPageDetailsBlockRegion[],
  blockId: string,
  crossedRegion: boolean,
  activeRect: VerticalRect | null,
  activeCenterY: number | null,
  over: DragOverEvent['over']
): BlockPlacement | null {
  if (!over) {
    return null;
  }
  const overData = over.data.current as BlockDragData | undefined;
  if (overData?.kind === 'slot') {
    const source = findBlockPlacement(regions, blockId);
    const target = findBlockPlacement(regions, overData.targetBlockId);
    if (!source || !target) {
      return null;
    }
    const targetIndex = target.index - Number(source.regionKey === target.regionKey && source.index < target.index);
    return {
      regionKey: target.regionKey,
      index: blockSlotInsertionIndex(targetIndex, overData.side),
    };
  }
  if (over.id === blockDragId(blockId)) {
    return findBlockPlacement(regions, blockId);
  }
  const targetBlockId = idSuffix(over.id, 'page-details:block:');
  if (targetBlockId) {
    const source = findBlockPlacement(regions, blockId);
    const target = findBlockPlacement(regions, targetBlockId);
    if (!source || !target) {
      return null;
    }
    return {
      regionKey: target.regionKey,
      index:
        source.regionKey === target.regionKey && !crossedRegion
          ? target.index
          : blockInsertionIndex({
              sourceIndex: source.index,
              targetIndex: target.index,
              sameRegion: source.regionKey === target.regionKey,
              activeCenterY: activeCenterY ?? verticalRectCenter(activeRect),
              targetRect: over.rect,
            }),
    };
  }
  const regionKey = idSuffix(over.id, 'page-details:region:') as RulebookBlockRegionKey | null;
  const region = regions.find((candidate) => candidate.key === regionKey);
  return region ? { regionKey: region.key, index: region.blocks.length } : null;
}

export function PageDetailsEdit({
  value,
  diagnostics,
  regions,
  onChange,
  onNavigateBlock,
  onAddBlock,
  onToggleBlockRegion,
  getBlockDropStatus,
  onBlockDrag,
}: RulebookPageDetailsEditProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Tab],
      },
    })
  );
  const lastValidPlacement = useRef<BlockPlacement | null>(null);
  const lastHandledPointerY = useRef<number | null>(null);
  const dragOriginRegionKey = useRef<RulebookBlockRegionKey | null>(null);
  const crossedBlockRegion = useRef(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [draggedBlockWidth, setDraggedBlockWidth] = useState<number | null>(null);
  const [disableSortingTransforms, setDisableSortingTransforms] = useState(false);

  const validPlacement = (blockId: string, placement: BlockPlacement) => {
    const normalized = normalizePlacement(regions, blockId, placement);
    if (!getBlockDropStatus(blockId, normalized.regionKey).allowed) {
      return null;
    }
    lastValidPlacement.current = normalized;
    return normalized;
  };

  const previewPlacement = (blockId: string, placement: BlockPlacement) => {
    if (!samePlacement(findBlockPlacement(regions, blockId), placement)) {
      onBlockDrag({ kind: 'preview', blockId, placement });
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const blockId = idSuffix(active.id, 'page-details:block:');
    if (!blockId) {
      return;
    }
    const placement = findBlockPlacement(regions, blockId);
    lastValidPlacement.current = placement;
    lastHandledPointerY.current = null;
    dragOriginRegionKey.current = placement?.regionKey ?? null;
    crossedBlockRegion.current = false;
    setDisableSortingTransforms(false);
    if (placement) {
      onBlockDrag({ kind: 'start', blockId, placement });
    }
    setDraggedBlockId(blockId);
    setDraggedBlockWidth(active.rect.current.initial?.width ?? null);
  };

  const processDragPosition = ({ active, collisions, over }: DragMoveEvent) => {
    const pointerY = collisionPointerY(collisions);
    if (pointerY !== null && pointerY === lastHandledPointerY.current) {
      return;
    }
    lastHandledPointerY.current = pointerY;
    const blockId = idSuffix(active.id, 'page-details:block:');
    const placement = blockId
      ? placementFromOver(regions, blockId, crossedBlockRegion.current, active.rect.current.translated, pointerY, over)
      : null;
    const normalized = blockId && placement ? validPlacement(blockId, placement) : null;
    const source = blockId ? findBlockPlacement(regions, blockId) : null;
    if (!blockId || !normalized || !source) {
      return;
    }
    if (source.regionKey !== normalized.regionKey) {
      crossedBlockRegion.current = true;
      setDisableSortingTransforms(true);
    }
    if (
      !samePlacement(source, normalized) &&
      (source.regionKey !== normalized.regionKey || crossedBlockRegion.current)
    ) {
      previewPlacement(blockId, normalized);
    }
  };

  const {
    schedule: scheduleDragPosition,
    flush: flushDragPosition,
    cancel: cancelDragPosition,
  } = useCoalescedDragPosition(processDragPosition);

  const finishDrag = () => {
    cancelDragPosition();
    lastValidPlacement.current = null;
    lastHandledPointerY.current = null;
    dragOriginRegionKey.current = null;
    crossedBlockRegion.current = false;
    setDisableSortingTransforms(false);
    setDraggedBlockId(null);
    setDraggedBlockWidth(null);
  };

  const handleDragEnd = ({ active, collisions, over }: DragEndEvent) => {
    flushDragPosition();
    const blockId = idSuffix(active.id, 'page-details:block:');
    const placement = blockId
      ? placementFromOver(
          regions,
          blockId,
          crossedBlockRegion.current,
          active.rect.current.translated,
          collisionPointerY(collisions),
          over
        )
      : null;
    const normalized = !crossedBlockRegion.current && blockId && placement ? validPlacement(blockId, placement) : null;
    const currentPlacement = blockId ? findBlockPlacement(regions, blockId) : null;
    const renderedCrossRegionPlacement =
      currentPlacement &&
      dragOriginRegionKey.current !== null &&
      currentPlacement.regionKey !== dragOriginRegionKey.current
        ? currentPlacement
        : null;
    const finalPlacement = crossedBlockRegion.current
      ? (renderedCrossRegionPlacement ?? lastValidPlacement.current)
      : (normalized ?? lastValidPlacement.current);
    if (blockId && finalPlacement) {
      onBlockDrag({ kind: 'commit', blockId, placement: finalPlacement });
    } else if (blockId) {
      onBlockDrag({ kind: 'cancel', blockId });
    }
    finishDrag();
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    if (draggedBlockId) {
      onBlockDrag({ kind: 'cancel', blockId: draggedBlockId });
    }
    finishDrag();
  };

  const draggedBlock = draggedBlockId ? findBlock(regions, draggedBlockId) : undefined;

  return (
    <Stack className={styles.root} gap="lg" aria-label="Page details">
      <Stack component="section" aria-label="Common Page controls" gap="md">
        <ControlBlock
          title="Anchor"
          description="Set the stable public anchor used in links to this Page."
          input={
            <TextInput
              aria-label="Anchor"
              leftSection={<Link2 size={16} aria-hidden />}
              leftSectionPointerEvents="none"
              value={value.anchor}
              error={diagnostics?.anchor}
              onChange={(event) => onChange({ ...value, anchor: event.currentTarget.value })}
            />
          }
        />
        <ControlBlock
          title="Title"
          description="Name this Page in the editor and Rulebook."
          input={
            <TextInput
              aria-label="Title"
              value={value.title}
              error={diagnostics?.title}
              onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
            />
          }
        />
      </Stack>

      <DndContext
        sensors={sensors}
        modifiers={[restrictDragToVerticalAxis]}
        collisionDetection={pageDetailsCollision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'To move a Block, press Space. Use the arrow keys to choose a compatible position, then press Space to drop or Escape to cancel.',
          },
        }}
        onDragStart={handleDragStart}
        onDragMove={scheduleDragPosition}
        onDragOver={scheduleDragPosition}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <Stack component="section" aria-label="Page regions" gap={0} className={styles.regions}>
          {regions.map((region) => (
            <BlockRegionSummary
              key={region.key}
              region={region}
              activeBlockId={draggedBlockId}
              dragOriginRegionKey={dragOriginRegionKey.current}
              disableSortingTransforms={disableSortingTransforms}
              getBlockDropStatus={getBlockDropStatus}
              onNavigateBlock={onNavigateBlock}
              onAddBlock={onAddBlock}
              onToggle={onToggleBlockRegion}
            />
          ))}
        </Stack>
        <DragOverlay modifiers={[restrictDragToVerticalAxis]} dropAnimation={null} style={{ pointerEvents: 'none' }}>
          {draggedBlock ? <BlockDragPreview block={draggedBlock} width={draggedBlockWidth} /> : null}
        </DragOverlay>
      </DndContext>
    </Stack>
  );
}
