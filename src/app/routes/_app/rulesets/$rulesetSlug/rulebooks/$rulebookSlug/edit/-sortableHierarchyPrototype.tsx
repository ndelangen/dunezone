import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragCancelEvent, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { NestedTabs } from '@ui/surface';
import {
  Circle,
  FileImage,
  FileText,
  Hexagon,
  Layers3,
  MessageSquareQuote,
  Plus,
  SlidersHorizontal,
  Triangle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

import styles from './-sortableHierarchyPrototype.module.css';

export type SortableHierarchyPrototypeVariant = 'A' | 'B' | 'C';

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

interface DropFeedback {
  regionId: string;
  valid: boolean;
  reason: string;
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

const variantDescriptions: Record<SortableHierarchyPrototypeVariant, { name: string; description: string }> = {
  A: {
    name: 'Boundary',
    description: 'The invalid region acts like a firm boundary. The pointer may travel, but the draft stays put.',
  },
  B: {
    name: 'State tint',
    description: 'The region and dragged item visibly change state while the draft stays at its last valid placement.',
  },
  C: {
    name: 'Explained pass-through',
    description: 'The invalid item is struck through and the region states why it cannot accept the Block.',
  },
};

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
    disabled: activeData !== null && activeData.kind !== dragKind,
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
}

function PrototypeRailGroupRoot({
  dropId,
  regionId,
  sortableIds,
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
    disabled: activeData !== null && activeData.kind !== 'block',
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

function targetPlacementFromSummaryOver(regions: readonly PrototypeRegion[], over: DragOverEvent['over']) {
  if (!over) {
    return null;
  }
  const targetRegion = idSuffix(over.id, 'summary:region:');
  if (targetRegion) {
    const region = regions.find((candidate) => candidate.id === targetRegion);
    return region ? { regionId: region.id, index: region.blockIds.length } : null;
  }
  const targetBlock = idSuffix(over.id, 'summary:block:');
  if (!targetBlock) {
    return null;
  }
  const placement = findBlockPlacement(regions, targetBlock);
  return placement;
}

function RegionDropMessage({
  variant,
  feedback,
  regionId,
}: {
  variant: SortableHierarchyPrototypeVariant;
  feedback: DropFeedback | null;
  regionId: string;
}) {
  if (variant !== 'C' || feedback?.regionId !== regionId || feedback.valid) {
    return null;
  }
  return <p className={styles.dropReason}>{feedback.reason}</p>;
}

function SummaryRegionDropTarget({
  region,
  feedback,
  variant,
  children,
}: {
  region: PrototypeRegion;
  feedback: DropFeedback | null;
  variant: SortableHierarchyPrototypeVariant;
  children: ReactNode;
}) {
  const droppable = useDroppable({
    id: summaryRegionId(region.id),
    data: { regionId: region.id },
  });
  const status = feedback?.regionId === region.id ? (feedback.valid ? 'valid' : 'invalid') : undefined;
  return (
    <section
      ref={droppable.setNodeRef}
      className={styles.summaryRegion}
      data-drop-status={status}
      data-prototype-over={droppable.isOver || undefined}
      data-variant={variant}
      aria-labelledby={`${region.id}-summary-heading`}
    >
      <header className={styles.summaryRegionHeader}>
        <div>
          <h3 id={`${region.id}-summary-heading`}>{region.label}</h3>
          <p>
            Accepts {region.accepts.join(', ')}. {region.blockIds.length}/{region.capacity} Blocks.
          </p>
        </div>
        <button type="button" className={styles.regionAddButton} aria-label={`Add a Block to ${region.label}`}>
          <Plus aria-hidden />
        </button>
      </header>
      <RegionDropMessage variant={variant} feedback={feedback} regionId={region.id} />
      {children}
    </section>
  );
}

function PageDetailsSummaries({
  regions,
  setRegions,
  blocks,
  variant,
  onSelectBlock,
}: {
  regions: PrototypeRegion[];
  setRegions: (value: PrototypeRegion[]) => void;
  blocks: Readonly<Record<string, PrototypeBlock>>;
  variant: SortableHierarchyPrototypeVariant;
  onSelectBlock: (blockId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const originalRegions = useRef<PrototypeRegion[] | null>(null);
  const lastValidPlacement = useRef<Placement | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [lastValid, setLastValid] = useState<Placement | null>(null);
  const [feedback, setFeedback] = useState<DropFeedback | null>(null);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const blockId = idSuffix(active.id, 'summary:block:');
    if (!blockId) {
      return;
    }
    originalRegions.current = cloneRegions(regions);
    lastValidPlacement.current = findBlockPlacement(regions, blockId);
    setLastValid(lastValidPlacement.current);
    setActiveBlockId(blockId);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const blockId = idSuffix(active.id, 'summary:block:');
    const placement = targetPlacementFromSummaryOver(regions, over);
    if (!blockId || !placement) {
      setFeedback(null);
      return;
    }
    const normalizedPlacement = normalizePlacement(regions, blockId, placement);
    const validity = placementValidity({
      regions,
      blocks,
      blockId,
      targetRegionId: normalizedPlacement.regionId,
    });
    setFeedback({ regionId: normalizedPlacement.regionId, ...validity });
    if (!validity.valid) {
      return;
    }
    const currentPlacement = findBlockPlacement(regions, blockId);
    if (currentPlacement?.regionId === normalizedPlacement.regionId) {
      lastValidPlacement.current = normalizedPlacement;
      setLastValid(normalizedPlacement);
      return;
    }
    const next = moveBlock(regions, blockId, normalizedPlacement.regionId, normalizedPlacement.index);
    const committedPlacement = findBlockPlacement(next, blockId);
    setRegions(next);
    lastValidPlacement.current = committedPlacement;
    setLastValid(committedPlacement);
  };

  const finishDrag = () => {
    setActiveBlockId(null);
    setFeedback(null);
    originalRegions.current = null;
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    if (originalRegions.current) {
      setRegions(cloneRegions(originalRegions.current));
    }
    finishDrag();
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const blockId = idSuffix(active.id, 'summary:block:');
    const placement = targetPlacementFromSummaryOver(regions, over);
    if (blockId && placement) {
      const normalizedPlacement = normalizePlacement(regions, blockId, placement);
      const validity = placementValidity({
        regions,
        blocks,
        blockId,
        targetRegionId: normalizedPlacement.regionId,
      });
      if (validity.valid) {
        setRegions(moveBlock(regions, blockId, normalizedPlacement.regionId, normalizedPlacement.index));
      } else if (lastValidPlacement.current) {
        setRegions(moveBlock(regions, blockId, lastValidPlacement.current.regionId, lastValidPlacement.current.index));
      }
    }
    finishDrag();
  };

  const activeInvalid = activeBlockId !== null && feedback?.valid === false;

  return (
    <div className={styles.detailsRoot} data-variant={variant}>
      <header className={styles.detailsHeading}>
        <div>
          <h2>Page details</h2>
          <p>Drag a handle to reorder these non-editable Block summaries inside Page details.</p>
        </div>
        <div className={styles.dragReadout} aria-live="polite">
          <span>Last valid</span>
          <strong>{placementLabel(regions, lastValid)}</strong>
        </div>
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.summaryRegions}>
          {regions.map((region) => (
            <SummaryRegionDropTarget region={region} feedback={feedback} variant={variant} key={region.id}>
              <SortableContext items={region.blockIds.map(summaryBlockId)} strategy={verticalListSortingStrategy}>
                <ul className={styles.summaryList}>
                  {region.blockIds.map((blockId) => {
                    const block = blocks[blockId];
                    const invalidDragging = activeBlockId === blockId && activeInvalid;
                    return (
                      <SortableItem
                        as="li"
                        id={summaryBlockId(blockId)}
                        className={`${styles.summaryItem} ${invalidDragging ? styles.invalidDragging : ''}`}
                        key={blockId}
                      >
                        {(handle) => (
                          <>
                            <a
                              href={`#${blockId}`}
                              className={styles.summaryLink}
                              onClick={(event) => {
                                event.preventDefault();
                                onSelectBlock(blockId);
                              }}
                            >
                              <span className={styles.summaryIcon}>{blockIcon(block.kind)}</span>
                              <span>
                                <strong>{block.label}</strong>
                                <small>{block.kind}</small>
                              </span>
                            </a>
                            <SortableReorderHandle label={`Move ${block.label}`} {...handle} />
                          </>
                        )}
                      </SortableItem>
                    );
                  })}
                </ul>
              </SortableContext>
            </SummaryRegionDropTarget>
          ))}
        </div>
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

function PrototypeSwitcher({
  variant,
  onVariantChange,
}: {
  variant: SortableHierarchyPrototypeVariant;
  onVariantChange: (variant: SortableHierarchyPrototypeVariant) => void;
}) {
  const variants = Object.keys(variantDescriptions) as SortableHierarchyPrototypeVariant[];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const current = variants.indexOf(variant);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      onVariantChange(variants[(current + direction + variants.length) % variants.length]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onVariantChange, variant, variants]);

  return (
    <div className={styles.variantSwitcher} aria-label="Invalid placement treatment">
      <div>
        <strong>
          {variant}: {variantDescriptions[variant].name}
        </strong>
        <span>{variantDescriptions[variant].description}</span>
      </div>
      <div className={styles.variantButtons}>
        {variants.map((candidate) => (
          <button
            type="button"
            aria-pressed={candidate === variant}
            onClick={() => onVariantChange(candidate)}
            key={candidate}
          >
            {candidate}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SortableHierarchyPrototype({
  variant,
  fit,
  onVariantChange,
}: {
  variant: SortableHierarchyPrototypeVariant;
  fit: 'height' | 'width';
  onVariantChange: (variant: SortableHierarchyPrototypeVariant) => void;
}) {
  const blocks = prototypeFixture.blocks;
  const [pages, setPages] = useState(() => [...prototypePages]);
  const [regions, setRegions] = useState(() => cloneRegions(prototypeFixture.regions));
  const [activePath, setActivePath] = useState<readonly string[]>([prototypePages[0].id, 'details']);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [feedback, setFeedback] = useState<DropFeedback | null>(null);
  const [lastValid, setLastValid] = useState<Placement | null>(null);
  const originalPages = useRef<PrototypePage[] | null>(null);
  const originalRegions = useRef<PrototypeRegion[] | null>(null);
  const lastValidPlacement = useRef<Placement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
      setFeedback(null);
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
      setFeedback(null);
      return;
    }
    const normalizedPlacement = normalizePlacement(regions, activeData.entityId, placement);
    const validity = placementValidity({
      regions,
      blocks,
      blockId: activeData.entityId,
      targetRegionId: normalizedPlacement.regionId,
    });
    setFeedback({ regionId: normalizedPlacement.regionId, ...validity });
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
    setFeedback(null);
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

  const activeInvalid = activeDrag?.kind === 'block' && feedback?.valid === false;

  return (
    <>
      <div className={styles.prototypeNotice}>
        <strong>Throwaway sorting prototype</strong>
        <span>Fixture state only. Valid placements commit during drag; Escape restores the drag origin.</span>
      </div>
      <DocumentEditorLayout ratio={210 / 297} fit={fit}>
        <DocumentEditorLayout.Sidebar>
          <DndContext
            sensors={sensors}
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
                  const regionStatus =
                    feedback?.regionId === region.id ? (feedback.valid ? 'valid' : 'invalid') : undefined;
                  return (
                    <NestedTabs.Group
                      as={PrototypeRailGroupRoot}
                      label={region.label}
                      icon={<Layers3 />}
                      dropId={`rail:region:${region.id}`}
                      regionId={region.id}
                      sortableIds={region.blockIds.map((blockId) => `rail:block:${blockId}`)}
                      className={styles.railGroup}
                      data-drop-status={regionStatus}
                      data-variant={variant}
                      data-drop-reason={feedback?.regionId === region.id ? feedback.reason : undefined}
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
                            onSelect={() => setActivePath([activePage.id, blockId])}
                            data-invalid-drag={activeDrag?.id === blockId && activeInvalid ? true : undefined}
                            data-variant={variant}
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
                  variant={variant}
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
        <span>Current region</span>
        <strong>{feedback?.reason ?? 'None'}</strong>
      </div>
      <PrototypeSwitcher variant={variant} onVariantChange={onVariantChange} />
    </>
  );
}
