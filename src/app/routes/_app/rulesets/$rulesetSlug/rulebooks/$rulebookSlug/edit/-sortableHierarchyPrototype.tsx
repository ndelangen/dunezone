import {
  closestCenter,
  DndContext,
  DragOverlay,
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
  Modifiers,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { NestedTabs } from '@ui/surface';
import {
  Circle,
  ChevronDown,
  ChevronRight,
  FileImage,
  FileText,
  Hexagon,
  Layers3,
  MessageSquareQuote,
  Plus,
  SlidersHorizontal,
  Triangle,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';

import styles from './-sortableHierarchyPrototype.module.css';

type BlockKind = 'text' | 'figure' | 'callout';

interface PrototypePage {
  id: string;
  label: string;
  shape: 'triangle' | 'hexagon' | 'circle';
}

interface PrototypeBlock {
  id: string;
  label: string;
  kind: BlockKind;
}

interface PrototypeRegion {
  id: string;
  label: string;
  accepts: readonly BlockKind[];
  capacity: number;
  blockIds: string[];
}

interface Placement {
  regionId: string;
  index: number;
}

interface ActiveDrag {
  id: string;
  kind: 'page' | 'block';
}

interface RailDragData {
  kind: 'page' | 'block' | 'region';
  entityId: string;
  regionId?: string;
}

const prototypePages: readonly PrototypePage[] = Array.from({ length: 18 }, (_, index) => ({
  id: `p${String(index + 1).padStart(2, '0')}`,
  label: `Page ${index + 1}`,
  shape: (['triangle', 'hexagon', 'circle'] as const)[index % 3],
}));

const regionBlueprints: readonly Omit<PrototypeRegion, 'blockIds'>[] = [
  { id: 'r1', label: 'Opening', accepts: ['text', 'callout'], capacity: 9 },
  { id: 'r2', label: 'Rules', accepts: ['text'], capacity: 9 },
  { id: 'r3', label: 'Examples', accepts: ['callout'], capacity: 9 },
  { id: 'r4', label: 'Figures', accepts: ['figure'], capacity: 6 },
  { id: 'r5', label: 'Main flow', accepts: ['text', 'figure'], capacity: 9 },
  {
    id: 'r6',
    label: 'Supporting notes',
    accepts: ['text', 'callout'],
    capacity: 9,
  },
  { id: 'r7', label: 'Gallery', accepts: ['figure'], capacity: 9 },
  {
    id: 'r8',
    label: 'Examples continued',
    accepts: ['callout', 'figure'],
    capacity: 9,
  },
  { id: 'r9', label: 'Closing', accepts: ['text'], capacity: 6 },
  {
    id: 'r10',
    label: 'Empty region',
    accepts: ['text', 'figure', 'callout'],
    capacity: 9,
  },
];

function createPrototypeFixture() {
  const counts = [6, 6, 6, 6, 6, 6, 6, 6, 2, 0];
  const blocks: Record<string, PrototypeBlock> = {};
  let blockNumber = 1;
  const regions = regionBlueprints.map((region, regionIndex): PrototypeRegion => {
    const blockIds = Array.from({ length: counts[regionIndex] }, (_, blockIndex) => {
      const id = `b${String(blockNumber).padStart(2, '0')}`;
      const kind = region.accepts[blockIndex % region.accepts.length];
      blocks[id] = { id, label: `Block ${blockNumber}`, kind };
      blockNumber += 1;
      return id;
    });
    return { ...region, blockIds };
  });
  return { blocks, regions };
}

const prototypeFixture = createPrototypeFixture();

const restrictDragToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

const verticalDragModifiers: Modifiers = [restrictDragToVerticalAxis];

function cloneRegions(regions: readonly PrototypeRegion[]) {
  return regions.map((region) => ({
    ...region,
    blockIds: [...region.blockIds],
  }));
}

function pageIcon(page: PrototypePage) {
  if (page.shape === 'triangle') {
    return <Triangle />;
  }
  if (page.shape === 'hexagon') {
    return <Hexagon />;
  }
  return <Circle />;
}

function blockIcon(kind: BlockKind) {
  if (kind === 'figure') {
    return <FileImage />;
  }
  if (kind === 'callout') {
    return <MessageSquareQuote />;
  }
  return <FileText />;
}

function findBlockPlacement(regions: readonly PrototypeRegion[], blockId: string): Placement | null {
  for (const region of regions) {
    const index = region.blockIds.indexOf(blockId);
    if (index !== -1) {
      return { regionId: region.id, index };
    }
  }
  return null;
}

function placementLabel(regions: readonly PrototypeRegion[], placement: Placement | null) {
  if (!placement) {
    return 'None';
  }
  const region = regions.find((candidate) => candidate.id === placement.regionId);
  return `${region?.label ?? placement.regionId}, position ${placement.index + 1}`;
}

function normalizePlacement(regions: readonly PrototypeRegion[], blockId: string, placement: Placement): Placement {
  const source = findBlockPlacement(regions, blockId);
  const target = regions.find((region) => region.id === placement.regionId);
  if (!source || !target) {
    return placement;
  }
  const maximumIndex = target.blockIds.length - (source.regionId === target.id ? 1 : 0);
  return {
    regionId: placement.regionId,
    index: Math.max(0, Math.min(placement.index, maximumIndex)),
  };
}

function placementValidity({
  regions,
  blocks,
  blockId,
  targetRegionId,
}: {
  regions: readonly PrototypeRegion[];
  blocks: Readonly<Record<string, PrototypeBlock>>;
  blockId: string;
  targetRegionId: string;
}): { valid: boolean; reason: string } {
  const block = blocks[blockId];
  const target = regions.find((region) => region.id === targetRegionId);
  const source = findBlockPlacement(regions, blockId);
  if (!block || !target || !source) {
    return { valid: false, reason: 'The placement no longer exists.' };
  }
  if (!target.accepts.includes(block.kind)) {
    return {
      valid: false,
      reason: `${target.label} does not accept ${block.kind} Blocks.`,
    };
  }
  const targetCountWithoutDraggedBlock = target.blockIds.length - (source.regionId === target.id ? 1 : 0);
  if (targetCountWithoutDraggedBlock >= target.capacity) {
    return { valid: false, reason: `${target.label} is full.` };
  }
  return { valid: true, reason: `${target.label} accepts this Block.` };
}

function moveBlock(
  regions: readonly PrototypeRegion[],
  blockId: string,
  targetRegionId: string,
  targetIndex: number
): PrototypeRegion[] {
  const current = findBlockPlacement(regions, blockId);
  if (!current) {
    return cloneRegions(regions);
  }
  const next = cloneRegions(regions);
  for (const region of next) {
    region.blockIds = region.blockIds.filter((id) => id !== blockId);
  }
  const target = next.find((region) => region.id === targetRegionId);
  if (!target) {
    return cloneRegions(regions);
  }
  const index = Math.max(0, Math.min(targetIndex, target.blockIds.length));
  target.blockIds.splice(index, 0, blockId);
  return next;
}

function railDragData(value: { data: { current?: unknown } } | null): RailDragData | null {
  return (value?.data.current as RailDragData | undefined) ?? null;
}

interface PrototypeRailItemRootProps extends ComponentPropsWithoutRef<'a'> {
  href: string;
  dragId: string;
  dragKind: 'page' | 'block';
  entityId: string;
  regionId?: string;
  dropEnabled?: boolean;
  onSelect: () => void;
}

function PrototypeRailItemRoot({
  href,
  dragId,
  dragKind,
  entityId,
  regionId,
  onSelect,
  className,
  style,
  onClick,
  children,
  ...rootProps
}: PrototypeRailItemRootProps) {
  const data: RailDragData = { kind: dragKind, entityId, regionId };
  const { active } = useDndContext();
  const activeData = railDragData(active);
  const draggable = useDraggable({ id: dragId, data });
  const droppable = useDroppable({
    id: dragId,
    data,
    disabled: activeData !== null && activeData.kind !== dragKind,
  });
  const setNodeRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    'aria-pressed': _dragPressed,
    ...dragAttributes
  } = draggable.attributes;
  const translatedStyle: CSSProperties = {
    ...style,
    transform: draggable.transform ? `translate3d(0, ${draggable.transform.y}px, 0)` : undefined,
  };

  return (
    <a
      {...dragAttributes}
      {...draggable.listeners}
      {...rootProps}
      href={href}
      ref={setNodeRef}
      className={className}
      style={translatedStyle}
      draggable={false}
      data-prototype-dragging={draggable.isDragging || undefined}
      data-prototype-over={droppable.isOver || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </a>
  );
}

function PrototypeSortableRailItemRoot({
  href,
  dragId,
  dragKind,
  entityId,
  regionId,
  dropEnabled,
  onSelect,
  className,
  style,
  onClick,
  children,
  ...rootProps
}: PrototypeRailItemRootProps) {
  const data: RailDragData = { kind: dragKind, entityId, regionId };
  const { active } = useDndContext();
  const activeData = railDragData(active);
  const sortable = useSortable({
    id: dragId,
    data,
    disabled: {
      draggable: activeData !== null && activeData.kind !== dragKind,
      droppable: (activeData !== null && activeData.kind !== dragKind) || dropEnabled === false,
    },
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    'aria-pressed': _dragPressed,
    ...dragAttributes
  } = sortable.attributes;
  const translatedStyle: CSSProperties = {
    ...style,
    transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
    transition: sortable.transition,
  };

  return (
    <a
      {...dragAttributes}
      {...sortable.listeners}
      {...rootProps}
      ref={sortable.setNodeRef}
      href={href}
      className={className}
      style={translatedStyle}
      draggable={false}
      data-prototype-dragging={sortable.isDragging || undefined}
      data-prototype-over={sortable.isOver || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </a>
  );
}

interface PrototypeRailGroupRootProps extends ComponentPropsWithoutRef<'li'> {
  dropId: string;
  regionId: string;
  sortableIds: string[];
  dropEnabled?: boolean;
}

function PrototypeRailGroupRoot({
  dropId,
  regionId,
  sortableIds,
  dropEnabled,
  children,
  ...rootProps
}: PrototypeRailGroupRootProps) {
  const { active } = useDndContext();
  const activeData = railDragData(active);
  const droppable = useDroppable({
    id: dropId,
    data: {
      kind: 'region',
      entityId: regionId,
      regionId,
    } satisfies RailDragData,
    disabled: (activeData !== null && activeData.kind !== 'block') || dropEnabled === false,
  });
  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      <li {...rootProps} ref={droppable.setNodeRef} data-prototype-over={droppable.isOver || undefined}>
        {children}
      </li>
    </SortableContext>
  );
}

function targetPlacementFromRailOver(regions: readonly PrototypeRegion[], over: DragOverEvent['over']) {
  const data = railDragData(over);
  if (!data?.regionId) {
    return null;
  }
  if (data.kind === 'region') {
    const region = regions.find((candidate) => candidate.id === data.regionId);
    return region ? { regionId: region.id, index: region.blockIds.length } : null;
  }
  if (data.kind === 'block') {
    const region = regions.find((candidate) => candidate.id === data.regionId);
    if (!region) {
      return null;
    }
    const index = region.blockIds.indexOf(data.entityId);
    return {
      regionId: region.id,
      index: index === -1 ? region.blockIds.length : index,
    };
  }
  return null;
}

function summaryBlockId(blockId: string) {
  return `summary:block:${blockId}`;
}

function summaryRegionId(regionId: string) {
  return `summary:region:${regionId}`;
}

function idSuffix(id: string | number, prefix: string) {
  const value = String(id);
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

const summaryCollision: CollisionDetection = (args) => {
  const regionContainers = args.droppableContainers.filter(
    (container) => container.data.current?.kind === 'summary-region'
  );
  const centerY = args.collisionRect.top + args.collisionRect.height / 2;
  const containingRegion = regionContainers.find((container) => {
    const rect = args.droppableRects.get(container.id);
    return rect ? centerY >= rect.top && centerY <= rect.bottom : false;
  });
  const nearestRegionCollision = containingRegion
    ? null
    : closestCenter({ ...args, droppableContainers: regionContainers })[0];
  const regionContainer =
    containingRegion ??
    regionContainers.find((container) => container.id === nearestRegionCollision?.id);
  const regionData = regionContainer?.data.current;
  if (!regionContainer || regionData?.dropEnabled !== true) {
    return [];
  }
  if (regionData.directTarget === true) {
    return closestCenter({ ...args, droppableContainers: [regionContainer] });
  }
  const rowContainers = args.droppableContainers.filter(
    (container) =>
      container.data.current?.kind === 'summary-block' &&
      container.data.current.regionId === regionData.regionId
  );
  return closestCenter({
    ...args,
    droppableContainers: rowContainers.length > 0 ? rowContainers : [regionContainer],
  });
};

function DynamicSummaryItem({
  block,
  regionId,
  dropEnabled,
  onSelect,
}: {
  block: PrototypeBlock;
  regionId: string;
  dropEnabled: boolean;
  onSelect: () => void;
}) {
  const sortable = useSortable({
    id: summaryBlockId(block.id),
    data: { kind: 'summary-block', blockId: block.id, regionId },
    disabled: { droppable: !dropEnabled },
  });
  const style: CSSProperties = {
    transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
    transition: sortable.transition,
  };

  return (
    <li
      ref={sortable.setNodeRef}
      className={styles.summaryItem}
      style={style}
      data-dynamic-dragging={sortable.isDragging || undefined}
      data-prototype-over={sortable.isOver || undefined}
    >
      <a
        href={`#${block.id}`}
        className={styles.summaryLink}
        onClick={(event) => {
          event.preventDefault();
          onSelect();
        }}
      >
        <span className={styles.summaryIcon}>{blockIcon(block.kind)}</span>
        <span>
          <strong>{block.label}</strong>
          <small>{block.kind}</small>
        </span>
      </a>
      <SortableReorderHandle
        label={`Move ${block.label}`}
        setActivatorNodeRef={sortable.setActivatorNodeRef}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
      />
    </li>
  );
}

function SummaryDragPreview({ block }: { block: PrototypeBlock }) {
  return (
    <div className={`${styles.summaryItem} ${styles.summaryDragPreview}`} data-testid="summary-drag-preview">
      <div className={styles.summaryLink}>
        <span className={styles.summaryIcon}>{blockIcon(block.kind)}</span>
        <span>
          <strong>{block.label}</strong>
          <small>{block.kind}</small>
        </span>
      </div>
    </div>
  );
}

function DynamicSummaryRegion({
  region,
  regions,
  blocks,
  activeBlockId,
  collapsed,
  onToggleCollapsed,
  onSelectBlock,
}: {
  region: PrototypeRegion;
  regions: readonly PrototypeRegion[];
  blocks: Readonly<Record<string, PrototypeBlock>>;
  activeBlockId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectBlock: (blockId: string) => void;
}) {
  const validity = activeBlockId
    ? placementValidity({ regions, blocks, blockId: activeBlockId, targetRegionId: region.id })
    : null;
  const droppable = useDroppable({
    id: summaryRegionId(region.id),
    data: {
      kind: 'summary-region',
      regionId: region.id,
      dropEnabled: validity?.valid === true,
      directTarget: collapsed || region.blockIds.length === 0,
    },
    disabled: activeBlockId === null,
  });
  const eligibility = validity ? (validity.valid ? 'compatible' : 'incompatible') : undefined;
  const dropEnabled = activeBlockId !== null && validity?.valid === true;
  const contentId = `${region.id}-dynamic-summary-content`;

  return (
    <section
      ref={droppable.setNodeRef}
      className={styles.summaryRegion}
      data-drop-eligibility={eligibility}
      data-prototype-over={droppable.isOver || undefined}
      aria-labelledby={`${region.id}-dynamic-summary-heading`}
    >
      <header className={styles.summaryRegionHeader}>
        <div>
          <h3 id={`${region.id}-dynamic-summary-heading`}>{region.label}</h3>
          <p>
            Accepts {region.accepts.join(', ')}. {region.blockIds.length}/{region.capacity} Blocks.
          </p>
        </div>
        <div className={styles.regionActions}>
          <button
            type="button"
            className={styles.regionCollapseButton}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${region.label}`}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
          </button>
          <button type="button" className={styles.regionAddButton} aria-label={`Add a Block to ${region.label}`}>
            <Plus aria-hidden />
          </button>
        </div>
      </header>
      <SortableContext items={region.blockIds.map(summaryBlockId)} strategy={verticalListSortingStrategy}>
        <ul id={contentId} className={styles.summaryList} hidden={collapsed}>
          {region.blockIds.map((blockId) => (
            <DynamicSummaryItem
              block={blocks[blockId]}
              regionId={region.id}
              dropEnabled={dropEnabled}
              onSelect={() => onSelectBlock(blockId)}
              key={blockId}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function PageDetailsSummaries({
  regions,
  setRegions,
  blocks,
  onSelectBlock,
}: {
  regions: PrototypeRegion[];
  setRegions: (value: PrototypeRegion[]) => void;
  blocks: Readonly<Record<string, PrototypeBlock>>;
  onSelectBlock: (blockId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(KeyboardSensor)
  );
  const dragOriginRegions = useRef<PrototypeRegion[] | null>(null);
  const lastValidPlacement = useRef<Placement | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [lastValid, setLastValid] = useState<Placement | null>(null);
  const [collapsedRegionIds, setCollapsedRegionIds] = useState<ReadonlySet<string>>(() => new Set());

  const validPlacement = (blockId: string, placement: Placement) => {
    const normalizedPlacement = normalizePlacement(regions, blockId, placement);
    const validity = placementValidity({
      regions,
      blocks,
      blockId,
      targetRegionId: normalizedPlacement.regionId,
    });
    if (!validity.valid) {
      return null;
    }
    lastValidPlacement.current = normalizedPlacement;
    setLastValid((current) =>
      current?.regionId === normalizedPlacement.regionId && current.index === normalizedPlacement.index
        ? current
        : normalizedPlacement
    );
    return normalizedPlacement;
  };

  const placementFromOver = (blockId: string, over: DragOverEvent['over']) => {
    if (!over || over.id === summaryBlockId(blockId)) {
      return null;
    }
    const targetBlockId = idSuffix(over.id, 'summary:block:');
    if (targetBlockId) {
      const target = findBlockPlacement(regions, targetBlockId);
      return target ? { regionId: target.regionId, index: target.index } : null;
    }
    const regionId = idSuffix(over.id, 'summary:region:');
    const region = regions.find((candidate) => candidate.id === regionId);
    return region ? { regionId: region.id, index: region.blockIds.length } : null;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const blockId = idSuffix(active.id, 'summary:block:');
    if (!blockId) {
      return;
    }
    const placement = findBlockPlacement(regions, blockId);
    dragOriginRegions.current = cloneRegions(regions);
    lastValidPlacement.current = placement;
    setLastValid(placement);
    setActiveBlockId(blockId);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const blockId = idSuffix(active.id, 'summary:block:');
    if (!blockId) {
      return;
    }
    const placement = placementFromOver(blockId, over);
    const normalizedPlacement = placement ? validPlacement(blockId, placement) : null;
    const source = findBlockPlacement(regions, blockId);
    if (!normalizedPlacement || !source || source.regionId === normalizedPlacement.regionId) {
      return;
    }
    setRegions(moveBlock(regions, blockId, normalizedPlacement.regionId, normalizedPlacement.index));
  };

  const finishDrag = () => {
    dragOriginRegions.current = null;
    lastValidPlacement.current = null;
    setActiveBlockId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const blockId = idSuffix(active.id, 'summary:block:');
    const placement = blockId ? placementFromOver(blockId, over) : null;
    const normalizedPlacement = blockId && placement ? validPlacement(blockId, placement) : null;
    const finalPlacement = normalizedPlacement ?? lastValidPlacement.current;
    if (blockId && finalPlacement) {
      setRegions(moveBlock(regions, blockId, finalPlacement.regionId, finalPlacement.index));
    }
    finishDrag();
  };

  const handleDragCancel = () => {
    if (dragOriginRegions.current) {
      setRegions(dragOriginRegions.current);
    }
    finishDrag();
  };

  return (
    <div className={styles.detailsRoot}>
      <header className={styles.detailsHeading}>
        <div>
          <h2>Page details</h2>
          <p>Drag Blocks between compatible Block regions. Collapse regions to shorten long drags.</p>
        </div>
        <div className={styles.dragReadout} aria-live="polite">
          <span>Last valid</span>
          <strong>{placementLabel(regions, lastValid)}</strong>
        </div>
      </header>
      <DndContext
        sensors={sensors}
        modifiers={verticalDragModifiers}
        collisionDetection={summaryCollision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.summaryRegions}>
          {regions.map((region) => (
            <DynamicSummaryRegion
              region={region}
              regions={regions}
              blocks={blocks}
              activeBlockId={activeBlockId}
              collapsed={collapsedRegionIds.has(region.id)}
              onToggleCollapsed={() => {
                setCollapsedRegionIds((current) => {
                  const next = new Set(current);
                  if (next.has(region.id)) {
                    next.delete(region.id);
                  } else {
                    next.add(region.id);
                  }
                  return next;
                });
              }}
              onSelectBlock={onSelectBlock}
              key={region.id}
            />
          ))}
        </div>
        <DragOverlay>
          {activeBlockId ? <SummaryDragPreview block={blocks[activeBlockId]} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PreviewPlaceholder({
  activePage,
  regions,
}: {
  activePage: PrototypePage;
  regions: readonly PrototypeRegion[];
}) {
  const blockCount = regions.reduce((count, region) => count + region.blockIds.length, 0);
  return (
    <div className={styles.previewPlaceholder}>
      <header>
        <span>Preview</span>
        <strong>{activePage.label}</strong>
      </header>
      <div className={styles.previewLines} aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <footer>
        {regions.length} Block regions / {blockCount} Blocks
      </footer>
    </div>
  );
}

export function SortableHierarchyPrototype({ fit }: { fit: 'height' | 'width' }) {
  const blocks = prototypeFixture.blocks;
  const [pages, setPages] = useState(() => [...prototypePages]);
  const [regions, setRegions] = useState(() => cloneRegions(prototypeFixture.regions));
  const [activePath, setActivePath] = useState<readonly string[]>([prototypePages[0].id, 'details']);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [lastValid, setLastValid] = useState<Placement | null>(null);
  const originalPages = useRef<PrototypePage[] | null>(null);
  const originalRegions = useRef<PrototypeRegion[] | null>(null);
  const lastValidPlacement = useRef<Placement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const activePage = pages.find((page) => page.id === activePath[0]) ?? pages[0];

  const regionByBlock = useMemo(() => {
    const result: Record<string, string> = {};
    for (const region of regions) {
      for (const blockId of region.blockIds) {
        result[blockId] = region.id;
      }
    }
    return result;
  }, [regions]);

  const handleRailDragStart = ({ active }: DragStartEvent) => {
    const data = railDragData(active);
    if (!data || data.kind === 'region') {
      return;
    }
    originalPages.current = [...pages];
    originalRegions.current = cloneRegions(regions);
    setActiveDrag({ id: data.entityId, kind: data.kind });
    if (data.kind === 'block') {
      const placement = findBlockPlacement(regions, data.entityId);
      lastValidPlacement.current = placement;
      setLastValid(placement);
    }
  };

  const handleRailDragOver = ({ active, over }: DragOverEvent) => {
    const activeData = railDragData(active);
    const overData = railDragData(over);
    if (!activeData || !overData) {
      return;
    }
    if (activeData.kind === 'page' && overData.kind === 'page') {
      const activeIndex = pages.findIndex((page) => page.id === activeData.entityId);
      const overIndex = pages.findIndex((page) => page.id === overData.entityId);
      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const next = [...pages];
        const [page] = next.splice(activeIndex, 1);
        next.splice(overIndex, 0, page);
        setPages(next);
      }
      return;
    }
    if (activeData.kind !== 'block') {
      return;
    }
    const placement = targetPlacementFromRailOver(regions, over);
    if (!placement) {
      return;
    }
    const normalizedPlacement = normalizePlacement(regions, activeData.entityId, placement);
    const validity = placementValidity({
      regions,
      blocks,
      blockId: activeData.entityId,
      targetRegionId: normalizedPlacement.regionId,
    });
    if (!validity.valid) {
      return;
    }
    const currentPlacement = findBlockPlacement(regions, activeData.entityId);
    if (currentPlacement?.regionId === normalizedPlacement.regionId) {
      lastValidPlacement.current = normalizedPlacement;
      setLastValid(normalizedPlacement);
      return;
    }
    const next = moveBlock(regions, activeData.entityId, normalizedPlacement.regionId, normalizedPlacement.index);
    const committedPlacement = findBlockPlacement(next, activeData.entityId);
    setRegions(next);
    lastValidPlacement.current = committedPlacement;
    setLastValid(committedPlacement);
  };

  const finishRailDrag = () => {
    setActiveDrag(null);
    originalPages.current = null;
    originalRegions.current = null;
  };

  const handleRailDragCancel = (_event: DragCancelEvent) => {
    if (originalPages.current) {
      setPages([...originalPages.current]);
    }
    if (originalRegions.current) {
      setRegions(cloneRegions(originalRegions.current));
    }
    finishRailDrag();
  };

  const handleRailDragEnd = ({ active, over }: DragEndEvent) => {
    const activeData = railDragData(active);
    if (activeData?.kind === 'block') {
      const placement = targetPlacementFromRailOver(regions, over);
      if (placement) {
        const normalizedPlacement = normalizePlacement(regions, activeData.entityId, placement);
        const validity = placementValidity({
          regions,
          blocks,
          blockId: activeData.entityId,
          targetRegionId: normalizedPlacement.regionId,
        });
        if (validity.valid) {
          setRegions(moveBlock(regions, activeData.entityId, normalizedPlacement.regionId, normalizedPlacement.index));
        } else if (lastValidPlacement.current) {
          setRegions(
            moveBlock(
              regions,
              activeData.entityId,
              lastValidPlacement.current.regionId,
              lastValidPlacement.current.index
            )
          );
        }
      }
    }
    finishRailDrag();
  };

  return (
    <>
      <div className={styles.prototypeNotice}>
        <strong>Throwaway sorting prototype</strong>
        <span>
          Fixture state only. Compatible Block regions accept drops; collapse long regions to shorten the route.
        </span>
      </div>
      <DocumentEditorLayout ratio={210 / 297} fit={fit}>
        <DocumentEditorLayout.Sidebar>
          <DndContext
            sensors={sensors}
            modifiers={verticalDragModifiers}
            collisionDetection={closestCenter}
            onDragStart={handleRailDragStart}
            onDragOver={handleRailDragOver}
            onDragEnd={handleRailDragEnd}
            onDragCancel={handleRailDragCancel}
          >
            <NestedTabs activePath={activePath} ariaLabel="Rulebook structure" className={styles.nestedTabs}>
              <NestedTabs.Level label="Pages">
                {pages.map((page) => (
                  <NestedTabs.Item
                    as={PrototypeRailItemRoot}
                    path={[page.id]}
                    label={page.label}
                    icon={pageIcon(page)}
                    href={`#${page.id}`}
                    dragId={`rail:page:${page.id}`}
                    dragKind="page"
                    entityId={page.id}
                    onSelect={() => setActivePath([page.id, 'details'])}
                    key={page.id}
                  />
                ))}
                <NestedTabs.Tools>
                  <button type="button" className={styles.railTool} aria-label="Add Page">
                    <Plus aria-hidden />
                  </button>
                </NestedTabs.Tools>
              </NestedTabs.Level>
              <NestedTabs.Level label={activePage.label}>
                <NestedTabs.Item
                  as="a"
                  path={[activePage.id, 'details']}
                  label="Page details"
                  icon={<SlidersHorizontal />}
                  href="#details"
                  onClick={(event) => {
                    event.preventDefault();
                    setActivePath([activePage.id, 'details']);
                  }}
                />
                {regions.map((region) => {
                  const dropEligibility =
                    activeDrag?.kind === 'block'
                      ? placementValidity({
                          regions,
                          blocks,
                          blockId: activeDrag.id,
                          targetRegionId: region.id,
                        }).valid
                        ? 'compatible'
                        : 'incompatible'
                      : undefined;
                  const dropEnabled = dropEligibility !== 'incompatible';
                  return (
                    <NestedTabs.Group
                      as={PrototypeRailGroupRoot}
                      label={region.label}
                      icon={<Layers3 />}
                      dropId={`rail:region:${region.id}`}
                      regionId={region.id}
                      sortableIds={region.blockIds.map((blockId) => `rail:block:${blockId}`)}
                      dropEnabled={dropEnabled}
                      className={styles.railGroup}
                      data-drop-eligibility={dropEligibility}
                      key={region.id}
                    >
                      {region.blockIds.map((blockId) => {
                        const block = blocks[blockId];
                        return (
                          <NestedTabs.Item
                            as={PrototypeSortableRailItemRoot}
                            path={[activePage.id, blockId]}
                            label={`${block.label}, ${block.kind}`}
                            icon={blockIcon(block.kind)}
                            href={`#${blockId}`}
                            dragId={`rail:block:${blockId}`}
                            dragKind="block"
                            entityId={blockId}
                            regionId={regionByBlock[blockId]}
                            dropEnabled={dropEnabled}
                            onSelect={() => setActivePath([activePage.id, blockId])}
                            key={blockId}
                          />
                        );
                      })}
                    </NestedTabs.Group>
                  );
                })}
              </NestedTabs.Level>
              <NestedTabs.ContentPanel aria-label="Page details">
                <PageDetailsSummaries
                  regions={regions}
                  setRegions={setRegions}
                  blocks={blocks}
                  onSelectBlock={(blockId) => setActivePath([activePage.id, blockId])}
                />
              </NestedTabs.ContentPanel>
            </NestedTabs>
          </DndContext>
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <PreviewPlaceholder activePage={activePage} regions={regions} />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
      <div className={styles.prototypeState} aria-live="polite">
        <span>Rail drag</span>
        <strong>{activeDrag ? `${activeDrag.kind} ${activeDrag.id}` : 'Idle'}</strong>
        <span>Last valid</span>
        <strong>{placementLabel(regions, lastValid)}</strong>
      </div>
    </>
  );
}
