import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
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
import { Group, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import type {
  RulebookBlockDraft,
  RulebookBlockKind,
  RulebookBlockRegionKey,
  RulebookPageDraft,
} from '@shared/rulebooks/contents';
import { IconAction } from '@ui/control/IconAction';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import {
  ChevronDown,
  ChevronRight,
  FileImage,
  FileText,
  Layers3,
  ListTree,
  MessageSquareQuote,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './-rulebookPageDetailsEdit.module.css';

export type RulebookPageDetailsValue = Readonly<Pick<RulebookPageDraft, 'title' | 'anchor'>>;

export type RulebookPageDetailsDiagnostics = Readonly<{
  title?: string;
  anchor?: string;
}>;

export type RulebookPageDetailsControlRegion = Readonly<{
  kind: 'control';
  key: string;
  label: string;
  summary: readonly string[];
  active: boolean;
  diagnostic?: string;
}>;

export type RulebookPageDetailsBlockRegion = Readonly<{
  kind: 'block';
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

export type RulebookPageDetailsRegion = RulebookPageDetailsControlRegion | RulebookPageDetailsBlockRegion;

export type RulebookPageDetailsDropStatus = Readonly<{
  allowed: boolean;
  reason: string;
}>;

export type RulebookPageDetailsBlockMoveIntent = Readonly<{
  blockId: string;
  regionKey: RulebookBlockRegionKey;
  index: number;
  reason: 'drag' | 'cancel';
}>;

export type RulebookPageDetailsEditProps = Readonly<{
  value: RulebookPageDetailsValue;
  diagnostics?: RulebookPageDetailsDiagnostics;
  regions: readonly RulebookPageDetailsRegion[];
  activeBlockId?: string;
  onChange: (nextValue: RulebookPageDetailsValue) => void;
  onNavigateControlRegion: (regionKey: string) => void;
  onNavigateBlock: (blockId: string) => void;
  onAddBlock: (regionKey: RulebookBlockRegionKey) => void;
  onToggleBlockRegion: (regionKey: RulebookBlockRegionKey, collapsed: boolean) => void;
  getBlockDropStatus: (blockId: string, regionKey: RulebookBlockRegionKey) => RulebookPageDetailsDropStatus;
  onMoveBlock: (intent: RulebookPageDetailsBlockMoveIntent) => void;
}>;

type BlockPlacement = Readonly<{
  regionKey: RulebookBlockRegionKey;
  index: number;
}>;

type BlockDragData =
  | Readonly<{
      kind: 'block';
      blockId: string;
      regionKey: RulebookBlockRegionKey;
    }>
  | Readonly<{
      kind: 'region';
      regionKey: RulebookBlockRegionKey;
      directTarget: boolean;
      dropEnabled: boolean;
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

function regionDropId(regionKey: RulebookBlockRegionKey) {
  return `page-details:region:${regionKey}`;
}

function idSuffix(id: string | number, prefix: string) {
  const value = String(id);
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function blockRegions(regions: readonly RulebookPageDetailsRegion[]) {
  return regions.filter((region): region is RulebookPageDetailsBlockRegion => region.kind === 'block');
}

function findBlockPlacement(regions: readonly RulebookPageDetailsRegion[], blockId: string): BlockPlacement | null {
  for (const region of blockRegions(regions)) {
    const index = region.blocks.findIndex((block) => block.id === blockId);
    if (index !== -1) {
      return { regionKey: region.key, index };
    }
  }
  return null;
}

function findBlock(regions: readonly RulebookPageDetailsRegion[], blockId: string) {
  for (const region of blockRegions(regions)) {
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
  regions: readonly RulebookPageDetailsRegion[],
  blockId: string,
  placement: BlockPlacement
): BlockPlacement {
  const source = findBlockPlacement(regions, blockId);
  const target = blockRegions(regions).find((region) => region.key === placement.regionKey);
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
  const minimum = region.minimum > 0 ? ` Minimum ${region.minimum}.` : '';
  if (region.maximum === null) {
    return `${region.blocks.length} Blocks.${minimum}`;
  }
  return `${region.blocks.length} of ${region.maximum} Blocks.${minimum}`;
}

const pageDetailsCollision: CollisionDetection = (args) => {
  const regionContainers = args.droppableContainers.filter(
    (container) => (container.data.current as BlockDragData | undefined)?.kind === 'region'
  );
  const centerY = args.collisionRect.top + args.collisionRect.height / 2;
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
  const rowContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as BlockDragData | undefined;
    return data?.kind === 'block' && data.regionKey === regionData.regionKey;
  });
  return closestCenter({
    ...args,
    droppableContainers: rowContainers.length > 0 ? rowContainers : [regionContainer],
  });
};

function BlockSummary({
  block,
  regionKey,
  dropEnabled,
  active,
  onNavigate,
}: Readonly<{
  block: RulebookBlockDraft;
  regionKey: RulebookBlockRegionKey;
  dropEnabled: boolean;
  active: boolean;
  onNavigate: () => void;
}>) {
  const sortable = useSortable({
    id: blockDragId(block.id),
    data: {
      kind: 'block',
      blockId: block.id,
      regionKey,
    } satisfies BlockDragData,
    disabled: { droppable: !dropEnabled },
  });
  const style: CSSProperties = {
    transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
    transition: sortable.transition,
  };
  const label = blockLabel(block);

  return (
    <li
      ref={sortable.setNodeRef}
      className={styles.blockSummary}
      style={style}
      data-dragging={sortable.isDragging || undefined}
      data-drop-target={sortable.isOver || undefined}
    >
      <UnstyledButton
        className={styles.blockNavigate}
        aria-label={`Edit ${label}`}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className={styles.blockIcon}>{blockIcon(block.kind)}</span>
        <span className={styles.blockWords}>
          <Text component="span" fw={700} truncate>
            {label}
          </Text>
          <Text component="span" size="xs" c="dimmed">
            {blockKindLabels[block.kind]}
          </Text>
        </span>
      </UnstyledButton>
      <SortableReorderHandle
        label={`Move ${label}`}
        setActivatorNodeRef={sortable.setActivatorNodeRef}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
      />
    </li>
  );
}

function BlockDragPreview({ block }: Readonly<{ block: RulebookBlockDraft }>) {
  return (
    <div className={`${styles.blockSummary} ${styles.blockDragPreview}`}>
      <div className={styles.blockNavigate}>
        <span className={styles.blockIcon}>{blockIcon(block.kind)}</span>
        <span className={styles.blockWords}>
          <Text component="span" fw={700} truncate>
            {blockLabel(block)}
          </Text>
          <Text component="span" size="xs" c="dimmed">
            {blockKindLabels[block.kind]}
          </Text>
        </span>
      </div>
    </div>
  );
}

function ControlRegionSummary({
  region,
  onNavigate,
}: Readonly<{
  region: RulebookPageDetailsControlRegion;
  onNavigate: () => void;
}>) {
  return (
    <section className={styles.region} aria-label={region.label} data-active={region.active || undefined}>
      <UnstyledButton className={styles.controlRegionNavigate} onClick={onNavigate}>
        <span className={styles.regionIcon}>
          <SlidersHorizontal aria-hidden />
        </span>
        <span className={styles.regionWords}>
          <Text component="span" fw={700}>
            {region.label}
          </Text>
          {region.summary.map((line) => (
            <Text component="span" size="sm" c="dimmed" key={line}>
              {line}
            </Text>
          ))}
          {region.diagnostic ? (
            <Text component="span" size="xs" c="red">
              {region.diagnostic}
            </Text>
          ) : null}
        </span>
        <ChevronRight aria-hidden />
      </UnstyledButton>
    </section>
  );
}

function BlockRegionSummary({
  region,
  activeBlockId,
  selectedBlockId,
  getBlockDropStatus,
  onNavigateBlock,
  onAddBlock,
  onToggle,
}: Readonly<{
  region: RulebookPageDetailsBlockRegion;
  activeBlockId: string | null;
  selectedBlockId?: string;
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

  return (
    <section
      ref={droppable.setNodeRef}
      className={styles.region}
      aria-label={region.label}
      aria-describedby={`${contentId}-description`}
      data-contains-active-block={region.containsActiveBlock || undefined}
      data-drop-eligibility={activeBlockId ? (dropEnabled ? 'compatible' : 'incompatible') : undefined}
      data-drop-target={droppable.isOver || undefined}
    >
      <div className={styles.blockRegionHeader}>
        <span className={styles.regionIcon}>
          <Layers3 aria-hidden />
        </span>
        <span className={styles.regionWords}>
          <Text component="span" fw={700}>
            {region.label}
          </Text>
          <Text component="span" size="xs" c="dimmed" id={`${contentId}-description`}>
            Accepts {acceptedKindsLabel(region.acceptedBlockKinds)}. {capacityLabel(region)}
          </Text>
          {region.diagnostic ? (
            <Text component="span" size="xs" c="red">
              {region.diagnostic}
            </Text>
          ) : null}
          {activeBlockId && dropStatus && !dropStatus.allowed ? (
            <Text component="span" size="xs" className={styles.visuallyHidden} aria-live="polite">
              {dropStatus.reason}
            </Text>
          ) : null}
        </span>
        <Group gap={4} wrap="nowrap">
          <IconAction
            label={`Add a Block to ${region.label}`}
            icon={<Plus aria-hidden />}
            variant="subtle"
            disabled={!region.canAddBlock}
            onClick={() => onAddBlock(region.key)}
          />
          <IconAction
            label={`${region.collapsed ? 'Expand' : 'Collapse'} ${region.label}`}
            icon={region.collapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
            variant="subtle"
            aria-expanded={!region.collapsed}
            aria-controls={contentId}
            onClick={() => onToggle(region.key, !region.collapsed)}
          />
        </Group>
      </div>

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
              dropEnabled={activeBlockId === null || dropEnabled}
              active={block.id === selectedBlockId}
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
  regions: readonly RulebookPageDetailsRegion[],
  blockId: string,
  over: DragOverEvent['over']
): BlockPlacement | null {
  if (!over) {
    return null;
  }
  if (over.id === blockDragId(blockId)) {
    return findBlockPlacement(regions, blockId);
  }
  const targetBlockId = idSuffix(over.id, 'page-details:block:');
  if (targetBlockId) {
    return findBlockPlacement(regions, targetBlockId);
  }
  const regionKey = idSuffix(over.id, 'page-details:region:') as RulebookBlockRegionKey | null;
  const region = blockRegions(regions).find((candidate) => candidate.key === regionKey);
  return region ? { regionKey: region.key, index: region.blocks.length } : null;
}

export function PageDetailsEdit({
  value,
  diagnostics,
  regions,
  activeBlockId: selectedBlockId,
  onChange,
  onNavigateControlRegion,
  onNavigateBlock,
  onAddBlock,
  onToggleBlockRegion,
  getBlockDropStatus,
  onMoveBlock,
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
  const dragOrigin = useRef<BlockPlacement | null>(null);
  const lastValidPlacement = useRef<BlockPlacement | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  const requestPlacement = (blockId: string, placement: BlockPlacement, reason: 'drag' | 'cancel') => {
    const normalized = normalizePlacement(regions, blockId, placement);
    if (reason === 'drag' && !getBlockDropStatus(blockId, normalized.regionKey).allowed) {
      return null;
    }
    if (reason === 'drag') {
      lastValidPlacement.current = normalized;
    }
    if (!samePlacement(findBlockPlacement(regions, blockId), normalized)) {
      onMoveBlock({ blockId, ...normalized, reason });
    }
    return normalized;
  };

  const finishDrag = () => {
    dragOrigin.current = null;
    lastValidPlacement.current = null;
    setDraggedBlockId(null);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const blockId = idSuffix(active.id, 'page-details:block:');
    if (!blockId) {
      return;
    }
    const placement = findBlockPlacement(regions, blockId);
    dragOrigin.current = placement;
    lastValidPlacement.current = placement;
    setDraggedBlockId(blockId);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const blockId = idSuffix(active.id, 'page-details:block:');
    const placement = blockId ? placementFromOver(regions, blockId, over) : null;
    if (blockId && placement) {
      requestPlacement(blockId, placement, 'drag');
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const blockId = idSuffix(active.id, 'page-details:block:');
    const placement = blockId ? placementFromOver(regions, blockId, over) : null;
    if (blockId && placement) {
      requestPlacement(blockId, placement, 'drag');
    }
    finishDrag();
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    if (draggedBlockId && dragOrigin.current) {
      requestPlacement(draggedBlockId, dragOrigin.current, 'cancel');
    }
    finishDrag();
  };

  const draggedBlock = draggedBlockId ? findBlock(regions, draggedBlockId) : undefined;

  return (
    <Stack className={styles.root} gap="lg" aria-label="Page details">
      <div className={styles.introduction}>
        <Text component="span" fw={800} size="xl">
          Page details
        </Text>
        <Text size="sm" c="dimmed">
          Edit this Page and arrange its Blocks. Open a Control region or Block to edit its own values.
        </Text>
      </div>

      <Stack component="section" aria-label="Common Page controls" gap="md">
        <TextInput
          label="Title"
          description="Name this Page in the editor and Rulebook."
          value={value.title}
          error={diagnostics?.title}
          onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
        />
        <TextInput
          label="Anchor"
          description="Set the stable public anchor used in links to this Page."
          value={value.anchor}
          error={diagnostics?.anchor}
          onChange={(event) => onChange({ ...value, anchor: event.currentTarget.value })}
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
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <Stack component="section" aria-label="Page regions" gap={0} className={styles.regions}>
          {regions.map((region) =>
            region.kind === 'control' ? (
              <ControlRegionSummary
                key={`control:${region.key}`}
                region={region}
                onNavigate={() => onNavigateControlRegion(region.key)}
              />
            ) : (
              <BlockRegionSummary
                key={`block:${region.key}`}
                region={region}
                activeBlockId={draggedBlockId}
                selectedBlockId={selectedBlockId}
                getBlockDropStatus={getBlockDropStatus}
                onNavigateBlock={onNavigateBlock}
                onAddBlock={onAddBlock}
                onToggle={onToggleBlockRegion}
              />
            )
          )}
        </Stack>
        <DragOverlay modifiers={[restrictDragToVerticalAxis]}>
          {draggedBlock ? <BlockDragPreview block={draggedBlock} /> : null}
        </DragOverlay>
      </DndContext>
    </Stack>
  );
}
