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
import { Alert, Badge, Box, Button, Group, Menu, Popover, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  canonicalRulebookCoverControlValues,
  createRulebookLocalId,
  getRulebookCoverFooter,
  getRulebookLayout,
  getRulebookLayoutsForSize,
  getRulebookRegionOrder,
  isRulebookCollectionBlock,
  rulebookAssetExplainerTargetSchema,
  rulebookBlockKinds,
  rulebookDraftEntitySchemas,
  rulebookLayoutCatalogue,
  findRulebookItem,
  rulebookItemCollections,
} from '@shared/rulebooks/contents';
import type {
  RulebookBlockDraft,
  RulebookBlockKind,
  RulebookBlockRegionKey,
  RulebookContentsDraftV1,
  RulebookPageDraft,
  RulebookPageLayoutId,
} from '@shared/rulebooks/contents';
import { RULEBOOK_EDITION_ARTIFACT_KINDS } from '@shared/rulebooks/editionArtifacts';
import type { RulebookEditionArtifactKind } from '@shared/rulebooks/editionArtifacts';
import { rulebookNameSchema } from '@shared/rulebooks/metadata';
import { collectRulebookReferenceIds } from '@shared/rulebooks/references';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { rulebookSourceReferenceSchema } from '@shared/rulebooks/sources';
import { createFileRoute, deepEqual, Link, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { Section } from '@ui/block/Section';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import type { DocumentEditorFit } from '@ui/layout/DocumentEditorLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { NestedTabs, Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Link2, SlidersHorizontal, TextCursorInput } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ComponentPropsWithoutRef, CSSProperties, KeyboardEvent, ReactNode } from 'react';

import { mutationErrorMessage } from '@db/core/mutationError';
import {
  loadRulebookEditor,
  usePublishRulebook,
  useRenameRulebook,
  useRulebookEditor,
  useSaveRulebook,
} from '@db/rulebooks';
import type { RulebookEditorPageData, RulebookMetadata } from '@db/rulebooks';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { FactionPicker } from '@app/pickers/FactionPicker';
import { projectRulebookDraftRenderPage } from '@app/print/rulebook/projectRulebookRenderDocument';
import type {
  RulebookResolvedAssetsById,
  RulebookResolvedFactionsById,
} from '@app/print/rulebook/projectRulebookRenderDocument';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RulebookPageRenderer } from '@game/rulebook/RulebookRenderer';

import {
  clippedRulebookBlocks,
  clippedRulebookCoverFooterFields,
  markClippedRulebookBlocks,
  markClippedRulebookCoverFooterFields,
  stripRulebookMeasurementIds,
} from '../rulebookClipping';
import type { ClippedRulebookBlock, ClippedRulebookCoverFooterField } from '../rulebookClipping';
import styles from './route.module.css';
import { rulebookBlockEditors } from './rulebookBlockEditors';
import {
  blockInsertionIndex,
  blockSlotInsertionIndex,
  projectBlockPlacement,
  verticalRectCenter,
} from './rulebookBlockPlacement';
import type { BlockPlacement, VerticalRect } from './rulebookBlockPlacement';
import { rulebookControlRegionEditors } from './rulebookControlRegionEditors';
import {
  collisionPointerY,
  collisionsWithPointerY,
  pointerInsertionSlot,
  useCoalescedDragPosition,
} from './rulebookDragCollision';
import { rulebookBlockIcon, rulebookLayoutIcon, rulebookRegionIcon } from './rulebookEditorIcons';
import type { RulebookEditorIconArrangement } from './rulebookEditorIcons';
import { receiveRulebookEditorQuery } from './rulebookEditorQueryState';
import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './rulebookEditorState';
import { PageDetailsEdit } from './rulebookPageDetailsEdit';
import type {
  RulebookPageDetailsBlockDragEvent,
  RulebookPageDetailsBlockRegion,
  RulebookPageDetailsDropStatus,
} from './rulebookPageDetailsEdit';

type ReadyResult = Extract<RulebookEditorResult, { status: 'ready' }>;

type ActiveEditorPath =
  | Readonly<{
      pageId: string;
      kind: 'details';
      path: readonly [string, 'details'];
      hash: string;
    }>
  | Readonly<{
      pageId: string;
      kind: 'control';
      regionKey: string;
      path: readonly [string, string];
      hash: string;
    }>
  | Readonly<{
      pageId: string;
      kind: 'block';
      blockId: string;
      path: readonly [string, string];
      hash: string;
    }>;
type RailDragData =
  | Readonly<{ kind: 'page'; pageId: string }>
  | Readonly<{
      kind: 'block';
      pageId: string;
      blockId: string;
      regionKey: RulebookBlockRegionKey;
      originRegionKey: RulebookBlockRegionKey;
    }>
  | Readonly<{
      kind: 'region';
      pageId: string;
      regionKey: RulebookBlockRegionKey;
      dropEnabled: boolean;
    }>
  | Readonly<{
      kind: 'slot';
      pageId: string;
      targetBlockId: string;
      regionKey: RulebookBlockRegionKey;
      side: 'before' | 'after';
    }>;
type ActiveRailDrag =
  | Readonly<{ kind: 'page'; pageId: string; width: number | null; height: number | null }>
  | Readonly<{
      kind: 'block';
      blockId: string;
      originRegionKey: RulebookBlockRegionKey;
      width: number | null;
      height: number | null;
    }>;
type WorkspaceDragState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'rail-page'; pageId: string; width: number | null; height: number | null }>
  | Readonly<{
      kind: 'block';
      source: 'rail' | 'details';
      pageId: string;
      blockId: string;
      originRegionKey: RulebookBlockRegionKey;
      candidate: BlockPlacement;
      width: number | null;
      height: number | null;
      disableRailSortingTransforms: boolean;
    }>
  | Readonly<{
      kind: 'settling-rail-block';
      blockId: string;
      originRegionKey: RulebookBlockRegionKey;
      width: number | null;
      height: number | null;
      disableRailSortingTransforms: boolean;
    }>;
type WorkspaceDragEvent =
  | Readonly<{ kind: 'start-page'; pageId: string; width: number | null; height: number | null }>
  | Readonly<{
      kind: 'start-block';
      source: 'rail' | 'details';
      pageId: string;
      blockId: string;
      placement: BlockPlacement;
      width: number | null;
      height: number | null;
    }>
  | Readonly<{
      kind: 'preview-block';
      blockId: string;
      placement: BlockPlacement;
      crossedRailRegion: boolean;
    }>
  | Readonly<{ kind: 'settle-block' }>
  | Readonly<{ kind: 'finish' }>;
type RailDragMemory = {
  lastValidPlacement: BlockPlacement | null;
  lastHandledPointerY: number | null;
  crossedRegion: boolean;
};

const idleWorkspaceDragState: WorkspaceDragState = { kind: 'idle' };

function reduceWorkspaceDragState(state: WorkspaceDragState, event: WorkspaceDragEvent): WorkspaceDragState {
  switch (event.kind) {
    case 'start-page':
      return { kind: 'rail-page', pageId: event.pageId, width: event.width, height: event.height };
    case 'start-block':
      return {
        kind: 'block',
        source: event.source,
        pageId: event.pageId,
        blockId: event.blockId,
        originRegionKey: event.placement.regionKey,
        candidate: event.placement,
        width: event.width,
        height: event.height,
        disableRailSortingTransforms: false,
      };
    case 'preview-block': {
      if (state.kind !== 'block' || state.blockId !== event.blockId) {
        return state;
      }
      const sameCandidate =
        state.candidate.regionKey === event.placement.regionKey && state.candidate.index === event.placement.index;
      const disableRailSortingTransforms =
        state.disableRailSortingTransforms || (state.source === 'rail' && event.crossedRailRegion);
      if (sameCandidate && disableRailSortingTransforms === state.disableRailSortingTransforms) {
        return state;
      }
      return {
        ...state,
        candidate: sameCandidate ? state.candidate : event.placement,
        disableRailSortingTransforms,
      };
    }
    case 'settle-block': {
      if (state.kind !== 'block') {
        return state;
      }
      if (state.source === 'details') {
        return idleWorkspaceDragState;
      }
      const { blockId, originRegionKey, width, height, disableRailSortingTransforms } = state;
      return {
        kind: 'settling-rail-block',
        blockId,
        originRegionKey,
        width,
        height,
        disableRailSortingTransforms,
      };
    }
    case 'finish':
      return idleWorkspaceDragState;
  }
}

function activeRailDrag(state: WorkspaceDragState): ActiveRailDrag | null {
  if (state.kind === 'rail-page') {
    return { kind: 'page', pageId: state.pageId, width: state.width, height: state.height };
  }
  if (state.kind === 'settling-rail-block' || (state.kind === 'block' && state.source === 'rail')) {
    return {
      kind: 'block',
      blockId: state.blockId,
      originRegionKey: state.originRegionKey,
      width: state.width,
      height: state.height,
    };
  }
  return null;
}

function railSortingTransformsDisabled(state: WorkspaceDragState) {
  return state.kind === 'block' || state.kind === 'settling-rail-block' ? state.disableRailSortingTransforms : false;
}

function openingRailDragMemory(lastValidPlacement: BlockPlacement | null = null): RailDragMemory {
  return { lastValidPlacement, lastHandledPointerY: null, crossedRegion: false };
}

const pageLayoutLabels = Object.fromEntries(
  rulebookLayoutCatalogue.map((layout) => [layout.id, layout.label])
) as Record<RulebookPageLayoutId, string>;

const blockKindLabels = {
  text: 'Text',
  'section-heading': 'Section heading',
  list: 'List',
  callout: 'Callout',
  'question-answer': 'Question and answer',
  'referenced-illustration': 'Referenced illustration',
  'illustrated-inventory': 'Illustrated inventory',
  'card-entry': 'Card entry',
  'card-group': 'Card group',
  'asset-explainer': 'AssetExplainer',
  'faction-introduction': 'Faction introduction',
  'reference-table': 'Reference table',
  credits: 'Credits',
} satisfies Record<RulebookBlockKind, string>;

const restrictDragToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

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

  const slotContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as RailDragData | undefined;
    return (
      data?.kind === 'slot' && data.regionKey === regionData.regionKey && data.targetBlockId !== activeData.blockId
    );
  });
  const blockContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current as RailDragData | undefined;
    return data?.kind === 'block' && data.regionKey === regionData.regionKey;
  });
  const usesInsertionSlots = args.pointerCoordinates && activeData.originRegionKey !== regionData.regionKey;
  const targetContainers = usesInsertionSlots ? slotContainers : blockContainers;
  const insertionRows = blockContainers.filter((container) => {
    const data = container.data.current as RailDragData | undefined;
    return data?.kind === 'block' && data.blockId !== activeData.blockId;
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

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit')({
  loader: ({ params }) => loadRulebookEditor(params),
  errorComponent: RulebookEditorError,
  component: RulebookEditorPage,
});

function blockLabel(block: RulebookBlockDraft) {
  if ('title' in block && block.title) {
    return block.title;
  }
  if (block.kind === 'text') {
    return block.name || block.text || blockKindLabels[block.kind];
  }
  const firstItem = isRulebookCollectionBlock(block) ? block.itemsById[block.itemOrder[0] ?? ''] : undefined;
  return firstItem?.text || blockKindLabels[block.kind];
}

type RulebookPageClipping = Readonly<{
  blocks: readonly ClippedRulebookBlock[];
  footerFields: readonly ClippedRulebookCoverFooterField[];
}>;

type RulebookPageClippingReport = RulebookPageClipping & Readonly<{ pageId: string }>;

type RulebookClippingReport = readonly RulebookPageClippingReport[];

function sameClippedBlocks(left: readonly ClippedRulebookBlock[], right: readonly ClippedRulebookBlock[]) {
  return (
    left.length === right.length &&
    left.every((warning, index) => {
      const candidate = right[index];
      return warning.blockId === candidate?.blockId && warning.regionKey === candidate.regionKey;
    })
  );
}

function samePageClipping(left: RulebookPageClipping, right: RulebookPageClipping) {
  return (
    sameClippedBlocks(left.blocks, right.blocks) &&
    left.footerFields.length === right.footerFields.length &&
    left.footerFields.every((field, index) => field === right.footerFields[index])
  );
}

function sameClippingReport(left: RulebookClippingReport, right: RulebookClippingReport) {
  return (
    left.length === right.length &&
    left.every((page, index) => {
      const candidate = right[index];
      return page.pageId === candidate?.pageId && samePageClipping(page, candidate);
    })
  );
}

type ClippingReporter = (pageId: string, measurement: RulebookPageClipping | null) => void;

const noClipping: RulebookPageClipping = { blocks: [], footerFields: [] };

/**
 * One hidden Page of the clipping measurement.
 * The state manager hands the editor a fresh clone of the draft after every edit, and the live query hands it a fresh Asset map after every push, so an unchanged Page is recognised structurally rather than by identity.
 * A recognised Page keeps its projection, its rendered DOM, and its observer, and a keystroke pays for the edited Page alone.
 * The hidden copy carries the same anchors as the visible Page, so it loses its ids before anything can reach two elements by one name.
 * Stripping re-runs on `enabled` as well as on the Page.
 * No re-render was seen to restore the ids.
 * React leaving an unchanged attribute alone is a fact about its diffing rather than a promise, and one cheap pass when a drag starts costs nothing.
 */
const ClippingMeasurementPage = memo(
  function ClippingMeasurementPage({
    page,
    settings,
    pageNumber,
    assetsById,
    factionsById,
    enabled,
    onMeasure,
  }: Readonly<{
    page: RulebookPageDraft;
    settings: RulebookSettings;
    pageNumber: number;
    assetsById: RulebookResolvedAssetsById;
    factionsById: RulebookResolvedFactionsById;
    enabled: boolean;
    onMeasure: ClippingReporter;
  }>) {
    const rootRef = useRef<HTMLDivElement>(null);
    const rendered = useMemo(
      () => projectRulebookDraftRenderPage(page, assetsById, factionsById),
      [assetsById, factionsById, page]
    );

    useLayoutEffect(() => {
      const root = rootRef.current;
      if (root) {
        stripRulebookMeasurementIds(root);
      }
    }, [enabled, rendered]);

    useLayoutEffect(() => {
      const root = rootRef.current;
      if (!root || !enabled) {
        return;
      }
      let frame = 0;
      const measure = () => {
        frame = 0;
        const blocks = clippedRulebookBlocks(root);
        const footerFields = clippedRulebookCoverFooterFields(root);
        markClippedRulebookBlocks(root, blocks);
        markClippedRulebookCoverFooterFields(root, footerFields);
        onMeasure(page.id, { blocks, footerFields });
      };
      const scheduleMeasure = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(measure);
      };
      /* The observed Regions, Blocks and footer fields resize with the Page, so the window listener only stands in where ResizeObserver is missing. */
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleMeasure);
      if (observer) {
        root
          .querySelectorAll<HTMLElement>(
            '[data-rulebook-region], [data-rulebook-block-id], [data-rulebook-cover-footer-field]'
          )
          .forEach((element) => {
            observer.observe(element);
          });
      } else {
        window.addEventListener('resize', scheduleMeasure);
      }
      /* A loaded font can change overflow inside a footer field without resizing the field itself. */
      root.ownerDocument.fonts?.addEventListener('loadingdone', scheduleMeasure);
      measure();
      return () => {
        cancelAnimationFrame(frame);
        observer?.disconnect();
        window.removeEventListener('resize', scheduleMeasure);
        root.ownerDocument.fonts?.removeEventListener('loadingdone', scheduleMeasure);
      };
    }, [enabled, onMeasure, page.id, pageNumber, rendered, settings]);

    useEffect(() => () => onMeasure(page.id, null), [onMeasure, page.id]);

    return (
      <div ref={rootRef} className={styles.clippingMeasurementPage}>
        <RulebookPageRenderer page={rendered} settings={settings} pageNumber={pageNumber} />
      </div>
    );
  },
  (previous, next) =>
    previous.enabled === next.enabled &&
    previous.onMeasure === next.onMeasure &&
    previous.pageNumber === next.pageNumber &&
    deepEqual(previous.settings, next.settings) &&
    deepEqual(previous.assetsById, next.assetsById) &&
    deepEqual(previous.factionsById, next.factionsById) &&
    deepEqual(previous.page, next.page)
);

function withPageMeasurement(
  current: ReadonlyMap<string, RulebookPageClipping>,
  pageId: string,
  measurement: RulebookPageClipping | null
) {
  const existing = current.get(pageId);
  if (measurement === null) {
    if (existing === undefined) {
      return current;
    }
    const next = new Map(current);
    next.delete(pageId);
    return next;
  }
  if (existing !== undefined && samePageClipping(existing, measurement)) {
    return current;
  }
  const next = new Map(current);
  next.set(pageId, measurement);
  return next;
}

/*
 * Collects the per-Page measurements into the report the header reads, in Page order, and marks the visible preview for the open Page.
 * A Block drag turns measurement off, because measuring the transient placement could open the header and move the drop geometry beneath the pointer; the last report stands until the drag settles.
 */
function useRulebookClipping(
  pageOrder: readonly string[],
  activePageId: string | undefined,
  previewVersion: unknown,
  enabled: boolean,
  onChange: (report: RulebookClippingReport) => void
) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [clippedByPage, setClippedByPage] = useState<ReadonlyMap<string, RulebookPageClipping>>(() => new Map());
  const receiveMeasurement = useCallback<ClippingReporter>((pageId, measurement) => {
    setClippedByPage((current) => withPageMeasurement(current, pageId, measurement));
  }, []);
  const report = useMemo<RulebookClippingReport>(
    () =>
      pageOrder.flatMap((pageId) => {
        const measurement = clippedByPage.get(pageId);
        return measurement ? [{ pageId, ...measurement }] : [];
      }),
    [clippedByPage, pageOrder]
  );
  useEffect(() => {
    onChange(report);
  }, [onChange, report]);

  const measurement = (activePageId === undefined ? undefined : clippedByPage.get(activePageId)) ?? noClipping;
  useLayoutEffect(() => {
    if (enabled && previewRef.current) {
      markClippedRulebookBlocks(previewRef.current, measurement.blocks);
      markClippedRulebookCoverFooterFields(previewRef.current, measurement.footerFields);
    }
  }, [measurement, enabled, previewVersion]);

  return { clipped: measurement.blocks, previewRef, receiveMeasurement };
}

function blockOrders(page: RulebookPageDraft) {
  return page.blockOrderByRegion as Record<RulebookBlockRegionKey, string[]>;
}

function blockWarningLabel(page: RulebookPageDraft, block: RulebookBlockDraft) {
  const sameKind = getRulebookLayout(page.layoutId).regions.flatMap((region) =>
    region.kind === 'block'
      ? (blockOrders(page)[region.key] ?? []).flatMap((blockId) => {
          const candidate = page.blocksById[blockId];
          return candidate?.kind === block.kind ? [candidate] : [];
        })
      : []
  );
  const position = sameKind.findIndex((candidate) => candidate.id === block.id);
  return sameKind.length > 1 && position >= 0
    ? `${blockKindLabels[block.kind]} ${position + 1}`
    : blockKindLabels[block.kind];
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
  return {
    afterId: order[index - 1] ?? null,
    beforeId: order[index + 1] ?? null,
  };
}

function normalizeBlockPlacement(page: RulebookPageDraft, blockId: string, placement: BlockPlacement): BlockPlacement {
  const source = findBlockPlacement(page, blockId);
  const targetIds = blockOrders(page)[placement.regionKey] ?? [];
  const maximumIndex = targetIds.length - (source?.regionKey === placement.regionKey ? 1 : 0);
  return {
    regionKey: placement.regionKey,
    index: Math.max(0, Math.min(placement.index, maximumIndex)),
  };
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
    return {
      allowed: false,
      reason: `${region.label} does not accept ${blockKindLabels[block.kind]} Blocks.`,
    };
  }
  const currentCount = blockOrders(page)[targetRegionKey]?.length ?? 0;
  const countWithoutDraggedBlock = currentCount - (source.regionKey === targetRegionKey ? 1 : 0);
  if (region.cardinality.maximum !== null && countWithoutDraggedBlock >= region.cardinality.maximum) {
    return { allowed: false, reason: `${region.label} is full.` };
  }
  return { allowed: true, reason: `${region.label} accepts this Block.` };
}

function targetPlacementFromRailOver(
  page: RulebookPageDraft,
  blockId: string,
  crossedRegion: boolean,
  activeRect: VerticalRect | null,
  activeCenterY: number | null,
  over: DragOverEvent['over']
): BlockPlacement | null {
  if (!over) {
    return null;
  }
  const data = railDragData(over);
  if (!data || data.kind === 'page' || data.pageId !== page.id) {
    return null;
  }
  if (data.kind === 'region') {
    return {
      regionKey: data.regionKey,
      index: blockOrders(page)[data.regionKey]?.length ?? 0,
    };
  }
  const source = findBlockPlacement(page, blockId);
  const targetBlockId = data.kind === 'slot' ? data.targetBlockId : data.blockId;
  const target = findBlockPlacement(page, targetBlockId);
  if (!source || !target) {
    return null;
  }
  if (targetBlockId === blockId) {
    return source;
  }
  if (data.kind === 'slot') {
    const targetIndex = target.index - Number(source.regionKey === target.regionKey && source.index < target.index);
    return {
      regionKey: target.regionKey,
      index: blockSlotInsertionIndex(targetIndex, data.side),
    };
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

type PageChoice = RulebookPageLayoutId | 'wide-left' | 'wide-right' | 'band-top' | 'band-bottom';
const arrangementLabels: Record<string, string> = {
  'wide-left': 'Wide left / narrow right',
  'wide-right': 'Narrow left / wide right',
  'band-top': 'Band above two columns',
  'band-bottom': 'Two columns above band',
};

function pageChoiceIcon(choice: PageChoice) {
  switch (choice) {
    case 'wide-left':
      return rulebookLayoutIcon('wide-narrow', { widePosition: 'left' });
    case 'wide-right':
      return rulebookLayoutIcon('wide-narrow', { widePosition: 'right' });
    case 'band-top':
      return rulebookLayoutIcon('band-columns', { bandPosition: 'top' });
    case 'band-bottom':
      return rulebookLayoutIcon('band-columns', { bandPosition: 'bottom' });
    default:
      return rulebookLayoutIcon(choice);
  }
}

function pageIconArrangement(page: RulebookPageDraft, pageNumber: number): RulebookEditorIconArrangement {
  return {
    widePosition: page.layoutId === 'wide-narrow' ? page.controlValues.widePosition : undefined,
    bandPosition: page.layoutId === 'band-columns' ? page.controlValues.bandPosition : undefined,
    outerRailSide: pageNumber % 2 === 0 ? 'left' : 'right',
  };
}

function pageChoices(settings: RulebookSettings): PageChoice[] {
  return getRulebookLayoutsForSize(settings.size).flatMap((layout): PageChoice[] =>
    layout.id === 'wide-narrow'
      ? ['wide-left', 'wide-right']
      : layout.id === 'band-columns'
        ? ['band-top', 'band-bottom']
        : [layout.id]
  );
}

function createPage(choice: PageChoice, id: string, anchor: string): RulebookPageDraft {
  const layoutId =
    choice.startsWith('wide-') && choice !== 'wide-narrow'
      ? 'wide-narrow'
      : choice.startsWith('band-') && choice !== 'band-columns'
        ? 'band-columns'
        : (choice as RulebookPageLayoutId);
  const layout = getRulebookLayout(layoutId);
  const controlValues =
    layoutId === 'cover'
      ? Object.fromEntries(
          layout.regions
            .filter((region) => region.kind === 'control')
            .map((region) => [region.key, structuredClone(region.initialValue)])
        )
      : layoutId === 'wide-narrow'
        ? { widePosition: choice === 'wide-right' ? 'right' : 'left' }
        : layoutId === 'band-columns'
          ? { bandPosition: choice === 'band-bottom' ? 'bottom' : 'top' }
          : {};
  return rulebookDraftEntitySchemas.page.parse({
    id,
    anchor,
    title: layoutId === 'cover' ? 'New cover' : 'New page',
    layoutId,
    showHeading: true,
    controlValues,
    blockOrderByRegion: Object.fromEntries(
      layout.regions.filter((region) => region.kind === 'block').map((region) => [region.key, []])
    ),
    blocksById: {},
  });
}

function createBlock(kind: RulebookBlockKind, id: string): RulebookBlockDraft {
  switch (kind) {
    case 'asset-explainer':
      return { id, kind, caption: '', numbering: 'automatic', colorMode: 'automatic', itemOrder: [], itemsById: {} };
    case 'card-entry':
      return { id, kind, text: '' };
    case 'card-group':
      return { id, kind, title: '', text: '', variant: 'compact', itemOrder: [], itemsById: {} };
    case 'referenced-illustration':
      return { id, kind, caption: '' };
    case 'illustrated-inventory':
      return { id, kind, introduction: '', itemOrder: [], itemsById: {} };
    case 'faction-introduction':
      return { id, kind, text: '' };
    case 'section-heading':
      return { id, kind, title: '' };
    case 'list':
      return { id, kind, style: 'bulleted', itemOrder: [], itemsById: {} };
    case 'callout':
      return { id, kind, variant: 'note', text: '' };
    case 'question-answer':
      return { id, kind, question: '', answer: '' };
    case 'reference-table':
      return { id, kind, columnOrder: [], columnsById: {}, rowOrder: [], rowsById: {}, note: '' };
    case 'credits':
      return { id, kind, groupOrder: [], groupsById: {} };
    case 'text':
      return { id, kind, text: '' };
  }
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
  if (leaf === 'details' || (page.layoutId === 'cover' && leaf === 'cover')) {
    return {
      pageId,
      kind: 'details',
      path: [pageId, 'details'],
      hash: editorHash(pageId, 'details'),
    };
  }
  const controlRegion = getRulebookLayout(page.layoutId).regions.find(
    (region) => region.kind === 'control' && region.key === leaf
  );
  if (controlRegion?.kind === 'control') {
    return {
      pageId,
      kind: 'control',
      regionKey: leaf,
      path: [pageId, leaf],
      hash: editorHash(pageId, leaf),
    };
  }
  if (page.blocksById[leaf]) {
    return {
      pageId,
      kind: 'block',
      blockId: leaf,
      path: [pageId, leaf],
      hash: editorHash(pageId, leaf),
    };
  }
  return {
    pageId,
    kind: 'details',
    path: [pageId, 'details'],
    hash: editorHash(pageId, 'details'),
  };
}

function subscribeToHash(change: () => void) {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
}

function browserHash() {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

/**
 * The hydrating render reads the browser hash like every other render.
 * The prerendered shell never carries the editor, because `editorPage` answers `sign-in-required` to the anonymous prerender, so there is no server markup for that render to agree with.
 * An empty hydration snapshot would show the first Page for one paint and let the normalization effect write it over the incoming link (#977).
 */
function useEditorHash() {
  return useSyncExternalStore(subscribeToHash, browserHash, browserHash);
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
  const sortable = useSortable({
    id: dragId,
    data,
    disabled: activeData !== null && activeData.kind !== 'page',
  });
  const { role: _role, tabIndex: _tabIndex, 'aria-pressed': _pressed, ...dragAttributes } = sortable.attributes;
  return (
    <a
      {...rootProps}
      {...dragAttributes}
      {...sortable.listeners}
      ref={sortable.setNodeRef}
      style={{
        ...style,
        transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
        transition: sortable.transition,
      }}
      draggable={false}
      data-rail-dragging={sortable.isDragging || undefined}
      data-rail-drag-placeholder={sortable.isDragging || undefined}
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
  dragOriginRegionKey: RulebookBlockRegionKey | null;
  dropEnabled: boolean;
  disableSortingTransform: boolean;
}

function RailBlockRoot({
  dragId,
  pageId,
  blockId,
  regionKey,
  dragOriginRegionKey,
  dropEnabled,
  disableSortingTransform,
  style,
  children,
  ...rootProps
}: RailBlockRootProps) {
  const { active, activatorEvent } = useDndContext();
  const data: RailDragData = {
    kind: 'block',
    pageId,
    blockId,
    regionKey,
    originRegionKey: dragOriginRegionKey ?? regionKey,
  };
  const activeData = railDragData(active);
  const insertionSlotsEnabled =
    activeData?.kind === 'block' &&
    activeData.originRegionKey !== regionKey &&
    dropEnabled &&
    (typeof KeyboardEvent === 'undefined' || !(activatorEvent instanceof KeyboardEvent));
  const sortable = useSortable({
    id: dragId,
    data,
    disabled: {
      draggable: activeData !== null && activeData.kind !== 'block',
      droppable: (activeData !== null && activeData.kind !== 'block') || !dropEnabled,
    },
  });
  const beforeSlot = useDroppable({
    id: `rail:slot:${blockId}:before`,
    data: {
      kind: 'slot',
      pageId,
      targetBlockId: blockId,
      regionKey,
      side: 'before',
    } satisfies RailDragData,
    disabled: !insertionSlotsEnabled,
  });
  const afterSlot = useDroppable({
    id: `rail:slot:${blockId}:after`,
    data: {
      kind: 'slot',
      pageId,
      targetBlockId: blockId,
      regionKey,
      side: 'after',
    } satisfies RailDragData,
    disabled: !insertionSlotsEnabled,
  });
  const { role: _role, tabIndex: _tabIndex, 'aria-pressed': _pressed, ...dragAttributes } = sortable.attributes;
  const translatedStyle: CSSProperties = {
    ...style,
    transform:
      !disableSortingTransform && sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
    transition: disableSortingTransform ? undefined : sortable.transition,
  };
  return (
    <a
      {...rootProps}
      {...dragAttributes}
      {...sortable.listeners}
      ref={sortable.setNodeRef}
      style={translatedStyle}
      draggable={false}
      data-rail-dragging={activeData?.kind === 'block' && activeData.blockId === blockId ? true : undefined}
      data-rail-drag-placeholder={activeData?.kind === 'block' && activeData.blockId === blockId ? true : undefined}
    >
      <span ref={beforeSlot.setNodeRef} className={styles.railBlockDropSlot} data-side="before" aria-hidden />
      <span ref={afterSlot.setNodeRef} className={styles.railBlockDropSlot} data-side="after" aria-hidden />
      {children}
    </a>
  );
}

function RailDragPreview({
  icon,
  width,
  height,
}: Readonly<{
  icon: ReactNode;
  width: number | null;
  height: number | null;
}>) {
  return (
    <div
      className={styles.railDragPreview}
      style={{ inlineSize: width ?? undefined, blockSize: height ?? undefined }}
      aria-hidden
    >
      {icon}
    </div>
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
    data: {
      kind: 'region',
      pageId,
      regionKey,
      dropEnabled,
    } satisfies RailDragData,
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
  icon,
}: Readonly<{
  label: string;
  values: readonly Value[];
  icon: (value: Value) => ReactNode;
  onPick: (value: Value) => void;
}>) {
  return (
    <Menu position="right-end" withinPortal>
      <Menu.Target>
        <AddAction label={label} />
      </Menu.Target>
      <Menu.Dropdown>
        {values.map((value) => (
          <Menu.Item key={value} leftSection={icon(value)} onClick={() => onPick(value)}>
            {value in arrangementLabels
              ? arrangementLabels[value]
              : value in pageLayoutLabels
                ? pageLayoutLabels[value as RulebookPageLayoutId]
                : blockKindLabels[value as RulebookBlockKind]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function FactionReferenceControl({
  factionId,
  factionsById,
  onChange,
  title = 'Faction',
  description = "Optional live reference. The heading follows the faction's current colour.",
}: {
  factionId?: string;
  factionsById: RulebookResolvedFactionsById;
  onChange: (id: string | undefined) => void;
  title?: string;
  description?: string;
}) {
  const [opened, setOpened] = useState(false);
  const chosenName = factionId ? (factionsById[factionId]?.name ?? 'Unavailable faction') : undefined;
  return (
    <ControlBlock
      title={title}
      description={description}
      input={
        <Stack gap="sm">
          <Group gap="sm">
            <Button
              variant="default"
              aria-label={
                title === 'Faction'
                  ? undefined
                  : [`Choose ${title.toLowerCase()}`, chosenName].filter(Boolean).join(': ')
              }
              onClick={() => setOpened(!opened)}
            >
              {chosenName ?? 'Choose faction'}
            </Button>
            {factionId ? (
              <Button variant="subtle" onClick={() => onChange(undefined)}>
                Clear
              </Button>
            ) : null}
          </Group>
          {opened ? (
            <FactionPicker
              copy={{
                title: 'Choose faction',
                intro: 'Choose a live faction reference.',
                errorTitle: 'Factions could not be loaded',
                emptyMessage: 'No factions are available.',
                confirmTitle: 'Selected faction',
                confirmLabel: 'Use faction',
                confirmIntent: 'positive',
              }}
              onPick={(picked) => {
                onChange(picked.id);
                setOpened(false);
              }}
              onCancel={() => setOpened(false)}
            />
          ) : null}
        </Stack>
      }
    />
  );
}

function blockEditorPanel(
  block: RulebookBlockDraft,
  replaceBlock: (block: RulebookBlockDraft) => void,
  factionsById: RulebookResolvedFactionsById,
  assetsById: RulebookResolvedAssetsById
) {
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
  const change = (value: object) => replaceBlock({ ...block, ...value });
  let editor: ReactNode;
  switch (block.kind) {
    case 'asset-explainer': {
      const Edit = rulebookBlockEditors['asset-explainer'];
      editor = <Edit value={block} onChange={change} references={{ assetsById, factionsById }} />;
      break;
    }
    case 'card-entry': {
      const Edit = rulebookBlockEditors['card-entry'];
      editor = <Edit value={block} onChange={change} references={{ assetsById, factionsById }} />;
      break;
    }
    case 'card-group': {
      const Edit = rulebookBlockEditors['card-group'];
      editor = <Edit value={block} onChange={change} references={{ assetsById, factionsById }} />;
      break;
    }
    case 'referenced-illustration': {
      const Edit = rulebookBlockEditors['referenced-illustration'];
      editor = <Edit value={block} onChange={change} references={{ assetsById, factionsById }} />;
      break;
    }
    case 'illustrated-inventory': {
      const Edit = rulebookBlockEditors['illustrated-inventory'];
      editor = <Edit value={block} onChange={change} references={{ assetsById, factionsById }} />;
      break;
    }
    case 'faction-introduction': {
      const Edit = rulebookBlockEditors['faction-introduction'];
      editor = <Edit value={block} onChange={change} references={{ assetsById, factionsById }} />;
      break;
    }
    case 'text':
      editor = <rulebookBlockEditors.text value={block} onChange={change} />;
      break;
    case 'section-heading': {
      const Edit = rulebookBlockEditors['section-heading'];
      editor = (
        <Stack gap="md">
          <Edit value={block} onChange={change} />
          <FactionReferenceControl
            factionId={block.factionId}
            factionsById={factionsById}
            onChange={(factionId) => replaceBlock({ ...block, factionId })}
          />
        </Stack>
      );
      break;
    }
    case 'list':
      editor = <rulebookBlockEditors.list value={block} onChange={change} />;
      break;
    case 'callout':
      editor = <rulebookBlockEditors.callout value={block} onChange={change} />;
      break;
    case 'question-answer': {
      const Edit = rulebookBlockEditors['question-answer'];
      editor = <Edit value={block} onChange={change} />;
      break;
    }
    case 'reference-table': {
      const Edit = rulebookBlockEditors['reference-table'];
      editor = <Edit value={block} onChange={change} />;
      break;
    }
    case 'credits': {
      editor = <rulebookBlockEditors.credits value={block} onChange={change} />;
      break;
    }
  }
  return (
    <Stack gap="lg">
      {anchorControl}
      {editor}
    </Stack>
  );
}

function controlRegionPanel(
  page: RulebookPageDraft,
  regionKey: string,
  replacePage: (page: RulebookPageDraft) => void,
  factionsById: RulebookResolvedFactionsById
) {
  if (page.layoutId === 'cover' && regionKey === 'cover') {
    const Edit = rulebookControlRegionEditors.cover.cover;
    return (
      <Edit
        value={page.controlValues.cover}
        onChange={(cover) => replacePage({ ...page, controlValues: { ...page.controlValues, cover } })}
      />
    );
  }
  if (page.layoutId === 'cover' && regionKey === 'footer') {
    const Edit = rulebookControlRegionEditors.cover.footer;
    const footer = getRulebookCoverFooter(page.controlValues);
    const update = (value: typeof footer) =>
      replacePage({
        ...page,
        controlValues: { ...canonicalRulebookCoverControlValues(page.controlValues), footer: value },
      });
    return (
      <Edit
        value={footer}
        onChange={update}
        footerFactionControls={
          footer.enabled ? (
            <>
              <FactionReferenceControl
                title="Left faction"
                description="Show this faction's current emblem on the left."
                factionId={footer.leftFactionId}
                factionsById={factionsById}
                onChange={(leftFactionId) => update({ ...footer, leftFactionId })}
              />
              <FactionReferenceControl
                title="Right faction"
                description="Show this faction's current emblem on the right."
                factionId={footer.rightFactionId}
                factionsById={factionsById}
                onChange={(rightFactionId) => update({ ...footer, rightFactionId })}
              />
            </>
          ) : undefined
        }
      />
    );
  }
  return <Alert color="red">This Control region has no matching editor.</Alert>;
}

function RulebookWorkspace({
  result,
  settings,
  dispatch,
  fit,
  assetsById,
  factionsById,
  onClippingChange,
  onSettle,
}: Readonly<{
  result: ReadyResult;
  settings: RulebookSettings;
  dispatch: RulebookEditorStateManager['dispatch'];
  fit: DocumentEditorFit;
  assetsById: RulebookResolvedAssetsById;
  factionsById: RulebookResolvedFactionsById;
  onClippingChange: (report: RulebookClippingReport) => void;
  onSettle: () => void;
}>) {
  const hash = useEditorHash();
  const size = getRulebookSize(settings.size);
  const active = activeEditorPath(result.draft, hash);
  const activeHash = active?.hash;
  const [collapsedRegionKeys, setCollapsedRegionKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [dragState, sendDrag] = useReducer(reduceWorkspaceDragState, idleWorkspaceDragState);
  const railDrag = activeRailDrag(dragState);
  const railDragMemory = useRef<RailDragMemory>(openingRailDragMemory());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
      },
    })
  );
  const clippingMeasurementEnabled = dragState.kind !== 'block';
  const activePage = active ? result.draft.pagesById[active.pageId] : undefined;
  const projectedActivePage =
    activePage && dragState.kind === 'block' && dragState.pageId === activePage.id
      ? projectBlockPlacement(activePage, dragState.blockId, dragState.candidate)
      : activePage;
  const previewPage = useMemo(
    () =>
      projectedActivePage ? projectRulebookDraftRenderPage(projectedActivePage, assetsById, factionsById) : undefined,
    [assetsById, factionsById, projectedActivePage]
  );
  const { clipped, previewRef, receiveMeasurement } = useRulebookClipping(
    result.draft.pageOrder,
    active?.pageId,
    previewPage,
    clippingMeasurementEnabled,
    onClippingChange
  );

  useEffect(() => {
    if (activeHash && window.location.hash !== activeHash) {
      window.history.replaceState(null, '', activeHash);
    }
    onSettle();
  }, [activeHash, onSettle]);

  const addPage = (layoutId: PageChoice) => {
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

  const {
    schedule: scheduleRailDragPosition,
    flush: flushRailDragPosition,
    cancel: cancelRailDragPosition,
  } = useCoalescedDragPosition(processRailDragPosition);

  if (!active || !activePage || !projectedActivePage) {
    return (
      <Stack gap="md">
        <Text>This Rulebook has no Pages.</Text>
        <AddMenu label="Add Page" values={pageChoices(settings)} icon={pageChoiceIcon} onPick={addPage} />
      </Stack>
    );
  }

  const page = activePage;
  const projectedPage = projectedActivePage;
  const layout = getRulebookLayout(page.layoutId);
  const orderedRegions = [
    ...layout.regions.filter((region) => region.kind === 'control'),
    ...getRulebookRegionOrder(page, result.draft.pageOrder.indexOf(page.id) + 1).flatMap(
      (key) => layout.regions.find((region) => region.key === key) ?? []
    ),
  ];
  const replaceDraft = (draft: RulebookContentsDraftV1) => dispatch({ kind: 'replace-draft', draft });
  const replacePage = (nextPage: RulebookPageDraft) =>
    replaceDraft({
      ...result.draft,
      pagesById: { ...result.draft.pagesById, [page.id]: nextPage },
    });
  const replaceBlock = (nextBlock: RulebookBlockDraft) =>
    replacePage({
      ...page,
      blocksById: { ...page.blocksById, [nextBlock.id]: nextBlock },
    });

  const commitBlockPlacement = (blockId: string, placement: BlockPlacement) => {
    const source = findBlockPlacement(page, blockId);
    if (!source || (source.regionKey === placement.regionKey && source.index === placement.index)) {
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
        container: {
          kind: 'block-region',
          pageId: page.id,
          regionKey: placement.regionKey,
        },
        ...destinationForOrder(order, index),
      },
    });
  };

  const deletePage = () => {
    const index = result.draft.pageOrder.indexOf(page.id);
    const nextId = result.draft.pageOrder[index + 1] ?? result.draft.pageOrder[index - 1];
    dispatch({ kind: 'delete', root: { kind: 'page', pageId: page.id } });
    window.location.hash = nextId ? editorHash(nextId, 'details') : '';
  };
  const deleteBlock = (blockId: string) => {
    dispatch({ kind: 'delete', root: { kind: 'block', pageId: page.id, blockId } });
    window.location.hash = editorHash(page.id, 'details');
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
      entity: {
        kind: 'block',
        pageId: page.id,
        block: createBlock(kind, blockId),
      },
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
    if (!data || data.kind === 'region' || data.kind === 'slot') {
      return;
    }
    if (data.kind === 'page') {
      sendDrag({
        kind: 'start-page',
        pageId: data.pageId,
        width: dragActive.rect.current.initial?.width ?? null,
        height: dragActive.rect.current.initial?.height ?? null,
      });
      return;
    }
    const placement = findBlockPlacement(page, data.blockId);
    if (!placement) {
      return;
    }
    railDragMemory.current = openingRailDragMemory(placement);
    sendDrag({
      kind: 'start-block',
      source: 'rail',
      pageId: page.id,
      blockId: data.blockId,
      placement,
      width: dragActive.rect.current.initial?.width ?? null,
      height: dragActive.rect.current.initial?.height ?? null,
    });
  };

  function processRailDragPosition({ active: dragActive, collisions, over }: DragMoveEvent) {
    const pointerY = collisionPointerY(collisions);
    if (pointerY !== null && pointerY === railDragMemory.current.lastHandledPointerY) {
      return;
    }
    railDragMemory.current.lastHandledPointerY = pointerY;
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
    const placement = targetPlacementFromRailOver(
      projectedPage,
      activeData.blockId,
      railDragMemory.current.crossedRegion,
      dragActive.rect.current.translated,
      pointerY,
      over
    );
    if (!placement) {
      return;
    }
    const normalized = normalizeBlockPlacement(projectedPage, activeData.blockId, placement);
    if (!blockDropStatus(projectedPage, activeData.blockId, normalized.regionKey).allowed) {
      return;
    }
    railDragMemory.current.lastValidPlacement = normalized;
    const source = findBlockPlacement(projectedPage, activeData.blockId);
    if (!source) {
      return;
    }
    if (source.regionKey !== normalized.regionKey) {
      railDragMemory.current.crossedRegion = true;
    }
    if (
      source.regionKey !== normalized.regionKey ||
      (railDragMemory.current.crossedRegion && source.index !== normalized.index)
    ) {
      sendDrag({
        kind: 'preview-block',
        blockId: activeData.blockId,
        placement: normalized,
        crossedRailRegion: railDragMemory.current.crossedRegion,
      });
    }
  }

  const finishRailDrag = () => {
    cancelRailDragPosition();
    railDragMemory.current = openingRailDragMemory();
    sendDrag({ kind: 'finish' });
  };

  const finishRailDragAfterClick = () => {
    sendDrag({ kind: 'settle-block' });
    window.requestAnimationFrame(finishRailDrag);
  };

  const requestRailPagePlacement = (pageId: string, over: DragEndEvent['over']) => {
    const overData = railDragData(over);
    if (overData?.kind !== 'page') {
      return;
    }
    const from = result.draft.pageOrder.indexOf(pageId);
    const to = result.draft.pageOrder.indexOf(overData.pageId);
    if (from === -1 || to === -1 || from === to) {
      return;
    }
    const nextOrder = [...result.draft.pageOrder];
    nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, pageId);
    dispatch({
      kind: 'place',
      target: { kind: 'page', pageId },
      destination: {
        container: { kind: 'page-order' },
        ...destinationForOrder(nextOrder, to),
      },
    });
  };

  const requestRailBlockPlacement = (
    blockId: string,
    activeRect: VerticalRect | null,
    activeCenterY: number | null,
    over: DragEndEvent['over']
  ) => {
    const placement = targetPlacementFromRailOver(
      projectedPage,
      blockId,
      railDragMemory.current.crossedRegion,
      activeRect,
      activeCenterY,
      over
    );
    const normalized = placement ? normalizeBlockPlacement(projectedPage, blockId, placement) : null;
    const currentPlacement = findBlockPlacement(projectedPage, blockId);
    const renderedCrossRegionPlacement =
      currentPlacement && railDrag?.kind === 'block' && currentPlacement.regionKey !== railDrag.originRegionKey
        ? currentPlacement
        : null;
    let finalPlacement = railDragMemory.current.lastValidPlacement;
    if (railDragMemory.current.crossedRegion) {
      finalPlacement = renderedCrossRegionPlacement ?? finalPlacement;
    } else if (normalized && blockDropStatus(projectedPage, blockId, normalized.regionKey).allowed) {
      finalPlacement = normalized;
    }
    if (finalPlacement) {
      commitBlockPlacement(blockId, finalPlacement);
    }
  };

  const handleRailDragEnd = ({ active: dragActive, collisions, over }: DragEndEvent) => {
    flushRailDragPosition();
    const activeData = railDragData(dragActive);
    if (activeData?.kind === 'page') {
      requestRailPagePlacement(activeData.pageId, over);
    }
    if (activeData?.kind === 'block') {
      requestRailBlockPlacement(
        activeData.blockId,
        dragActive.rect.current.translated,
        collisionPointerY(collisions),
        over
      );
    }
    finishRailDragAfterClick();
  };

  const handleRailDragCancel = (_event: DragCancelEvent) => {
    finishRailDragAfterClick();
  };

  const draggedRailPage = railDrag?.kind === 'page' ? result.draft.pagesById[railDrag.pageId] : undefined;
  const draggedRailBlock = railDrag?.kind === 'block' ? page.blocksById[railDrag.blockId] : undefined;

  const iconArrangement = pageIconArrangement(page, result.draft.pageOrder.indexOf(page.id) + 1);
  const detailsRegions: RulebookPageDetailsBlockRegion[] = orderedRegions.flatMap((region) => {
    if (region.kind !== 'block') {
      return [];
    }
    const ids = blockOrders(projectedPage)[region.key] ?? [];
    const collapseKey = `${page.id}:${region.key}`;
    return [
      {
        key: region.key,
        label: region.label,
        icon: rulebookRegionIcon(region.key, iconArrangement),
        acceptedBlockKinds: region.acceptedBlockKinds,
        minimum: region.cardinality.minimum,
        maximum: region.cardinality.maximum,
        blocks: ids.flatMap((id) => projectedPage.blocksById[id] ?? []),
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

  const handlePageDetailsBlockDrag = (event: RulebookPageDetailsBlockDragEvent) => {
    if (event.kind === 'start') {
      sendDrag({
        kind: 'start-block',
        source: 'details',
        pageId: page.id,
        blockId: event.blockId,
        placement: event.placement,
        width: null,
        height: null,
      });
      return;
    }
    if (event.kind === 'preview') {
      sendDrag({
        kind: 'preview-block',
        blockId: event.blockId,
        placement: event.placement,
        crossedRailRegion: false,
      });
      return;
    }
    if (event.kind === 'commit') {
      commitBlockPlacement(event.blockId, event.placement);
    }
    sendDrag({ kind: 'settle-block' });
  };

  const clippedBlocks = clipped.flatMap(({ blockId }) => {
    const block = projectedPage.blocksById[blockId];
    return block ? [block] : [];
  });
  const activeClippedBlock =
    active.kind === 'block' ? clippedBlocks.find((block) => block.id === active.blockId) : undefined;

  const panel: ReactNode =
    active.kind === 'details' ? (
      <PageDetailsEdit
        coverControls={
          page.layoutId === 'cover' ? controlRegionPanel(page, 'cover', replacePage, factionsById) : undefined
        }
        value={{
          anchor: page.anchor,
          title: page.title,
          ...('showHeading' in page ? { showHeading: page.showHeading } : {}),
        }}
        diagnostics={{
          anchor: pageDiagnostic('anchor'),
          title: pageDiagnostic('title'),
        }}
        regions={detailsRegions}
        onChange={(value) => replacePage({ ...page, ...value })}
        onNavigateBlock={(blockId) => {
          window.location.hash = editorHash(page.id, blockId);
        }}
        onAddBlock={addBlock}
        onDeleteBlock={deleteBlock}
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
        getBlockDropStatus={(blockId, regionKey) => blockDropStatus(projectedPage, blockId, regionKey)}
        onBlockDrag={handlePageDetailsBlockDrag}
      />
    ) : active.kind === 'control' ? (
      controlRegionPanel(page, active.regionKey, replacePage, factionsById)
    ) : (
      <Stack gap="md">
        {blockEditorPanel(page.blocksById[active.blockId]!, replaceBlock, factionsById, assetsById)}
        <Group justify="flex-end">
          <ConfirmDeleteAction
            key={active.blockId}
            label="Delete Block"
            size="sm"
            pending={false}
            onConfirm={() => deleteBlock(active.blockId)}
          />
        </Group>
      </Stack>
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
    <Box
      role="region"
      aria-label="Rulebook editor and preview"
      tabIndex={0}
      onBlurCapture={onSettle}
      onKeyDown={onWorkspaceKeyDown}
    >
      <DocumentEditorLayout ratio={size.widthMm / size.heightMm} fit={fit}>
        <DocumentEditorLayout.Sidebar>
          <DndContext
            sensors={sensors}
            modifiers={[restrictDragToVerticalAxis]}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            collisionDetection={railCollision}
            onDragStart={handleRailDragStart}
            onDragMove={scheduleRailDragPosition}
            onDragOver={scheduleRailDragPosition}
            onDragEnd={handleRailDragEnd}
            onDragCancel={handleRailDragCancel}
          >
            <NestedTabs activePath={active.path} ariaLabel="Rulebook structure" className={styles.nestedTabs}>
              <NestedTabs.Level label="Pages">
                <SortableContext
                  items={result.draft.pageOrder.map((pageId) => `rail:page:${pageId}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {result.draft.pageOrder.map((pageId, index) => {
                    const candidate = result.draft.pagesById[pageId];
                    return candidate ? (
                      <NestedTabs.Item
                        as={RailPageRoot}
                        path={[pageId]}
                        label={candidate.title}
                        icon={rulebookLayoutIcon(candidate.layoutId, pageIconArrangement(candidate, index + 1))}
                        href={railDrag ? undefined : editorHash(pageId, 'details')}
                        target="_self"
                        dragId={`rail:page:${pageId}`}
                        pageId={pageId}
                        key={pageId}
                      />
                    ) : null;
                  })}
                </SortableContext>
                <NestedTabs.Tools>
                  <AddMenu label="Add Page" values={pageChoices(settings)} icon={pageChoiceIcon} onPick={addPage} />
                </NestedTabs.Tools>
              </NestedTabs.Level>
              <NestedTabs.Level label={page.title}>
                <NestedTabs.Item
                  as="a"
                  path={[page.id, 'details']}
                  label="Page details"
                  icon={<SlidersHorizontal />}
                  href={editorHash(page.id, 'details')}
                  target="_self"
                />
                {orderedRegions.map((region) => {
                  if (page.layoutId === 'cover' && region.key === 'cover') {
                    return null;
                  }
                  if (region.kind === 'control') {
                    return (
                      <NestedTabs.Item
                        as="a"
                        path={[page.id, region.key]}
                        label={region.label}
                        icon={rulebookRegionIcon(region.key, iconArrangement)}
                        href={editorHash(page.id, region.key)}
                        target="_self"
                        key={region.key}
                      />
                    );
                  }
                  const ids = blockOrders(projectedPage)[region.key] ?? [];
                  let eligibility: 'compatible' | 'incompatible' | undefined;
                  if (railDrag?.kind === 'block') {
                    eligibility = blockDropStatus(projectedPage, railDrag.blockId, region.key).allowed
                      ? 'compatible'
                      : 'incompatible';
                  }
                  const dropEnabled = eligibility !== 'incompatible';
                  return (
                    <NestedTabs.Group
                      as={RailRegionRoot}
                      label={region.label}
                      icon={rulebookRegionIcon(region.key, iconArrangement)}
                      pageId={page.id}
                      regionKey={region.key}
                      sortableIds={ids.map((blockId) => `rail:block:${blockId}`)}
                      dropEnabled={dropEnabled}
                      className={styles.railGroup}
                      data-drop-eligibility={eligibility}
                      key={region.key}
                    >
                      {ids.map((blockId) => {
                        const block = projectedPage.blocksById[blockId];
                        return block ? (
                          <NestedTabs.Item
                            as={RailBlockRoot}
                            path={[page.id, blockId]}
                            label={blockLabel(block)}
                            icon={rulebookBlockIcon(block.kind)}
                            href={railDrag ? undefined : editorHash(page.id, blockId)}
                            target="_self"
                            dragId={`rail:block:${blockId}`}
                            pageId={page.id}
                            blockId={blockId}
                            regionKey={region.key}
                            dragOriginRegionKey={railDrag?.kind === 'block' ? railDrag.originRegionKey : null}
                            dropEnabled={dropEnabled}
                            disableSortingTransform={railSortingTransformsDisabled(dragState)}
                            key={blockId}
                          />
                        ) : null;
                      })}
                    </NestedTabs.Group>
                  );
                })}
                <NestedTabs.Tools>
                  <ConfirmDeleteAction
                    key={page.id}
                    label="Delete Page"
                    size="sm"
                    pending={false}
                    onConfirm={deletePage}
                  />
                  <AddMenu
                    label="Add Block"
                    values={availableBlockKinds}
                    icon={rulebookBlockIcon}
                    onPick={(kind) => {
                      const region = firstAvailableRegion(kind);
                      if (region?.kind === 'block') {
                        addBlock(region.key, kind);
                      }
                    }}
                  />
                </NestedTabs.Tools>
              </NestedTabs.Level>
              <NestedTabs.ContentPanel aria-label={`${page.title} editor`}>
                {activeClippedBlock ? (
                  <Stack gap="lg">
                    <Alert color="yellow" title={`${blockKindLabels[activeClippedBlock.kind]} is clipped`}>
                      <Stack gap="xs">
                        <Text size="sm">
                          Part of this Block will not be visible in the published Rulebook. Shorten the Block to show
                          all of it.
                        </Text>
                      </Stack>
                    </Alert>
                    {panel}
                  </Stack>
                ) : (
                  panel
                )}
              </NestedTabs.ContentPanel>
            </NestedTabs>
            {railDrag && (draggedRailBlock || draggedRailPage) ? (
              <DragOverlay
                modifiers={[restrictDragToVerticalAxis]}
                dropAnimation={null}
                style={{ pointerEvents: 'none' }}
              >
                <RailDragPreview
                  icon={
                    draggedRailPage
                      ? rulebookLayoutIcon(
                          draggedRailPage.layoutId,
                          pageIconArrangement(draggedRailPage, result.draft.pageOrder.indexOf(draggedRailPage.id) + 1)
                        )
                      : rulebookBlockIcon(draggedRailBlock!.kind)
                  }
                  width={railDrag.width}
                  height={railDrag.height}
                />
              </DragOverlay>
            ) : null}
          </DndContext>
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <div className={styles.previewPage}>
            <div ref={previewRef} className={styles.previewVisible}>
              {previewPage ? (
                <RulebookPageRenderer
                  page={previewPage}
                  settings={settings}
                  pageNumber={result.draft.pageOrder.indexOf(page.id) + 1}
                />
              ) : null}
            </div>
            <div className={styles.clippingMeasurements} aria-hidden>
              {result.draft.pageOrder.map((measurementPageId, index) => {
                const measurementPage = result.draft.pagesById[measurementPageId];
                return measurementPage ? (
                  <ClippingMeasurementPage
                    page={measurementPage}
                    settings={settings}
                    pageNumber={index + 1}
                    assetsById={assetsById}
                    factionsById={factionsById}
                    enabled={clippingMeasurementEnabled}
                    onMeasure={receiveMeasurement}
                    key={measurementPageId}
                  />
                ) : null;
              })}
            </div>
          </div>
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

type Difference = ReadyResult['incompatibilities'][number];
type EntityRef = Extract<Difference, { kind: 'field' }>['target'];
type Placement = Extract<Difference, { kind: 'placement' }>['local'];
type Resolution = ReadyResult['resolutionLedger'][number]['outcome'];

function entityName(contents: RulebookContentsDraftV1, target: EntityRef): string {
  const page = contents.pagesById[target.pageId];
  if (target.kind === 'page') {
    return page?.title || 'Deleted Page';
  }
  const block = page?.blocksById[target.blockId];
  if (target.kind === 'block') {
    return block ? blockLabel(block) : 'Deleted Block';
  }
  return isRulebookCollectionBlock(block) ? block.itemsById[target.itemId]?.text || 'Deleted item' : 'Deleted item';
}

function containerName(contents: RulebookContentsDraftV1, container: Placement['container']): string {
  if (container.kind === 'page-order') {
    return 'Pages';
  }
  const page = contents.pagesById[container.pageId];
  if (container.kind === 'item-order') {
    return `${page?.title ?? 'Page'} / ${entityName(contents, { kind: 'block', pageId: container.pageId, blockId: container.blockId })}`;
  }
  const region = page && getRulebookLayout(page.layoutId).regions.find((region) => region.key === container.regionKey);
  return `${page?.title ?? 'Page'} / ${region?.label ?? container.regionKey}`;
}

function containerEntity(container: Placement['container'], id: string): EntityRef {
  if (container.kind === 'page-order') {
    return { kind: 'page', pageId: id };
  }
  if (container.kind === 'block-region') {
    return { kind: 'block', pageId: container.pageId, blockId: id };
  }
  return { kind: 'item', pageId: container.pageId, blockId: container.blockId, itemId: id };
}

function placementName(contents: RulebookContentsDraftV1, placement?: Placement): string {
  if (!placement) {
    return 'No saved position';
  }
  const { container, afterId, beforeId } = placement;
  const boundary = afterId
    ? `after ${entityName(contents, containerEntity(container, afterId))}`
    : beforeId
      ? `before ${entityName(contents, containerEntity(container, beforeId))}`
      : 'in the empty list';
  return `${containerName(contents, container)}, ${boundary}`;
}

function reviewValue(value: unknown): ReactNode {
  if (value === undefined || value === null || value === '') {
    return <Text c="dimmed">Not set</Text>;
  }
  if (typeof value !== 'object') {
    return <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(value)}</Text>;
  }
  return (
    <Stack gap="xs">
      {Object.entries(value).map(([key, field]) => (
        <div key={key}>
          <Text size="xs" c="dimmed">
            {key.replaceAll('-', ' ')}
          </Text>
          {reviewValue(field)}
        </div>
      ))}
    </Stack>
  );
}

function entityReview(contents: RulebookContentsDraftV1, target: EntityRef): ReactNode {
  const page = contents.pagesById[target.pageId];
  if (!page) {
    return <Text c="dimmed">Deleted</Text>;
  }
  if (target.kind === 'page') {
    return (
      <Stack gap="xs">
        <Text fw={700}>{page.title}</Text>
        <Text size="sm">Anchor: {page.anchor}</Text>
        {reviewValue(page.controlValues)}
        {getRulebookLayout(page.layoutId).regions.flatMap((region) =>
          region.kind === 'block'
            ? (blockOrders(page)[region.key] ?? []).map((blockId) => (
                <div key={blockId}>{entityReview(contents, { kind: 'block', pageId: page.id, blockId })}</div>
              ))
            : []
        )}
      </Stack>
    );
  }
  const block = page.blocksById[target.blockId];
  if (!block) {
    return <Text c="dimmed">Deleted</Text>;
  }
  if (target.kind === 'item') {
    if (isRulebookCollectionBlock(block)) {
      return reviewValue(
        block.kind === 'illustrated-inventory' || block.kind === 'card-group' || block.kind === 'asset-explainer'
          ? block.itemsById[target.itemId]
          : block.itemsById[target.itemId]?.text
      );
    }
    return reviewValue(findRulebookItem(block, target.itemId)?.item);
  }
  return (
    <Stack gap={4}>
      {block.kind === 'card-group'
        ? reviewValue({
            heading: block.title,
            guidance: block.text,
            treatment: block.variant,
            featuredMember: block.featuredItemId,
          })
        : null}
      {block.kind === 'asset-explainer'
        ? reviewValue({
            source: block.source,
            caption: block.caption,
            numbering: block.numbering,
            colorMode: block.colorMode,
          })
        : null}
      {block.kind === 'card-entry' ? reviewValue({ source: block.source, quantity: block.quantity }) : null}
      {block.anchor ? <Text size="sm">Anchor: {block.anchor}</Text> : null}
      {isRulebookCollectionBlock(block)
        ? block.itemOrder.map((id) => (
            <div key={id}>
              {reviewValue(
                block.kind === 'illustrated-inventory' ||
                  block.kind === 'card-group' ||
                  block.kind === 'asset-explainer'
                  ? block.itemsById[id]
                  : block.itemsById[id]?.text
              )}
            </div>
          ))
        : block.kind === 'reference-table' || block.kind === 'credits'
          ? rulebookItemCollections(block).flatMap((collection) =>
              collection.order.map((id) => <div key={id}>{reviewValue(collection.byId[id])}</div>)
            )
          : reviewValue(
              'text' in block
                ? block.text
                : block.kind === 'question-answer'
                  ? { topic: block.topic, question: block.question, answer: block.answer }
                  : block.kind === 'referenced-illustration'
                    ? { source: block.source, caption: block.caption }
                    : block.title
            )}
      {block.kind === 'reference-table' && block.note ? reviewValue({ note: block.note }) : null}
    </Stack>
  );
}

function fieldResolution(field: Extract<Difference, { kind: 'field' }>['field'], value: unknown): Resolution {
  if (field === 'target') {
    return { kind: 'field-value', value: rulebookAssetExplainerTargetSchema.parse(value) };
  }
  if (field === 'source') {
    return { kind: 'field-value', value: rulebookSourceReferenceSchema.optional().parse(value) };
  }
  if (field === 'quantity') {
    return { kind: 'field-value', value: typeof value === 'number' ? value : undefined };
  }
  if (field === 'control-values') {
    return { kind: 'control-values', value: Object.fromEntries(Object.entries(value as Record<string, unknown>)) };
  }
  if (field === 'anchor') {
    return { kind: 'anchor', value: typeof value === 'string' ? value : undefined };
  }
  return { kind: 'field-value', value: typeof value === 'string' || typeof value === 'boolean' ? value : undefined };
}

function reviewPlacementContainers(
  contents: RulebookContentsDraftV1,
  target: EntityRef
): Array<{ container: Placement['container']; ids: readonly string[] }> {
  if (target.kind === 'page') {
    return [{ container: { kind: 'page-order' }, ids: contents.pageOrder }];
  }
  const page = contents.pagesById[target.pageId];
  const block = page?.blocksById[target.blockId];
  if (!page || !block) {
    return [];
  }
  if (target.kind === 'item') {
    const located = findRulebookItem(block, target.itemId);
    if (!located) {
      return [];
    }
    const { collection, ownerItemId, order } = located.collection;
    return [
      {
        container: {
          kind: 'item-order',
          pageId: page.id,
          blockId: block.id,
          ...(collection === undefined ? {} : { collection }),
          ...(ownerItemId === undefined ? {} : { ownerItemId }),
        },
        ids: order,
      },
    ];
  }
  return getRulebookLayout(page.layoutId).regions.flatMap((region) => {
    if (region.kind !== 'block' || !(region.acceptedBlockKinds as readonly RulebookBlockKind[]).includes(block.kind)) {
      return [];
    }
    const ids = blockOrders(page)[region.key] ?? [];
    if (ids.filter((id) => id !== target.blockId).length >= (region.cardinality.maximum ?? Infinity)) {
      return [];
    }
    return [{ container: { kind: 'block-region', pageId: page.id, regionKey: region.key }, ids }];
  });
}

/** Every option names a surviving gap; a missing neighbor is never silently replaced at approval time. */
function reviewPlacementOptions(result: ReadyResult, difference: Extract<Difference, { kind: 'placement' }>) {
  const contents = result.comparisonDraft;
  const target = difference.target;
  const containers = reviewPlacementContainers(contents, target);
  const targetId = target.kind === 'page' ? target.pageId : target.kind === 'block' ? target.blockId : target.itemId;
  return containers.flatMap(({ container, ids }) => {
    const others = ids.filter((id) => id !== targetId);
    return Array.from({ length: others.length + 1 }, (_, index) => {
      const destination = { container, afterId: others[index - 1] ?? null, beforeId: others[index] ?? null };
      return { destination, label: placementName(contents, destination) };
    });
  });
}

function RulebookDifferenceReview({
  result,
  dispatch,
  onClose,
}: {
  result: ReadyResult;
  dispatch: RulebookEditorStateManager['dispatch'];
  onClose: () => void;
}) {
  const approve = (difference: Difference, outcome: Resolution) =>
    dispatch({
      kind: 'resolve',
      approval: {
        incompatibilityId: difference.id,
        dependencyFingerprint: difference.dependencyFingerprint,
        outcome,
      },
    });
  return (
    <Section
      title="Review differences"
      description="Choose which version to keep. You can return to editing at any time; Save waits until every difference is reviewed."
      action={
        <Button variant="default" onClick={onClose}>
          Back to editing
        </Button>
      }
    >
      <Stack gap="lg">
        {result.incompatibilities.length === 0 ? (
          <Alert color="green" role="status">
            All differences are reviewed. Return to editing to check and save your draft.
          </Alert>
        ) : null}
        {result.incompatibilities.map((difference) => {
          let name: string;
          let local: ReactNode;
          let latest: ReactNode;
          let localOutcome: Resolution | undefined;
          let latestOutcome: Resolution | undefined;
          if (difference.kind === 'field') {
            name = `${entityName(result.draft, difference.target)} / ${difference.field.replaceAll('-', ' ')}`;
            local = reviewValue(difference.localValue);
            latest = reviewValue(difference.latestValue);
            localOutcome = fieldResolution(difference.field, difference.localValue);
            latestOutcome = fieldResolution(difference.field, difference.latestValue);
          } else if (difference.kind === 'deletion') {
            name = entityName(
              difference.direction === 'saved-deletion' ? result.draft : result.latest.contents,
              difference.root
            );
            local = entityReview(result.draft, difference.root);
            latest = entityReview(result.latest.contents, difference.root);
            localOutcome = {
              kind: difference.direction === 'saved-deletion' ? 'restore-local-subtree' : 'keep-local-deletion',
            };
            latestOutcome = {
              kind: difference.direction === 'saved-deletion' ? 'accept-saved-deletion' : 'accept-latest-subtree',
            };
          } else if (difference.kind === 'collection-order') {
            name = `${containerName(result.draft, difference.container)} order`;
            const order = (contents: RulebookContentsDraftV1, ids: readonly string[]) => (
              <ol>
                {ids.map((id) => (
                  <li key={id}>{entityName(contents, containerEntity(difference.container, id))}</li>
                ))}
              </ol>
            );
            local = order(result.draft, difference.localOrder);
            latest = order(result.latest.contents, difference.latestOrder);
            localOutcome = {
              kind: 'collection-order',
              container: difference.container,
              orderedIds: difference.localOrder,
            };
            latestOutcome = {
              kind: 'collection-order',
              container: difference.container,
              orderedIds: difference.latestOrder,
            };
          } else if (difference.kind === 'anchor') {
            name = `${entityName(result.draft, difference.target)} / anchor`;
            local = <Text>{difference.value}</Text>;
            latest = (
              <Text>
                This anchor also belongs to {entityName(result.latest.contents, difference.collidesWith)}. Use{' '}
                {difference.suggestedValue} for this item.
              </Text>
            );
            latestOutcome = { kind: 'anchor', value: difference.suggestedValue };
          } else {
            name = `${entityName(result.draft, difference.target)} / position`;
            local = <Text>{placementName(result.draft, difference.local)}</Text>;
            latest = <Text>{placementName(result.latest.contents, difference.latest)}</Text>;
          }
          const approved = result.resolutionLedger.find(
            (approval) =>
              approval.incompatibilityId === difference.id &&
              approval.dependencyFingerprint === difference.dependencyFingerprint
          );
          return (
            <Section
              key={difference.id}
              title={name}
              action={approved ? <Badge color="green">Reviewed</Badge> : undefined}
            >
              <AsymmetricSplitLayout>
                <AsymmetricSplitLayout.Wide>
                  <Surface padding="md">
                    <Section title="Your draft">
                      {local}
                      {localOutcome ? (
                        <Button variant="default" onClick={() => approve(difference, localOutcome!)}>
                          Keep your version
                        </Button>
                      ) : null}
                    </Section>
                  </Surface>
                </AsymmetricSplitLayout.Wide>
                <AsymmetricSplitLayout.Narrow>
                  <Surface padding="md">
                    <Section title="Latest saved version">
                      {latest}
                      {latestOutcome ? (
                        <Button variant="default" onClick={() => approve(difference, latestOutcome!)}>
                          {difference.kind === 'anchor' ? 'Use available anchor' : 'Keep saved version'}
                        </Button>
                      ) : null}
                    </Section>
                  </Surface>
                </AsymmetricSplitLayout.Narrow>
              </AsymmetricSplitLayout>
              {difference.kind === 'placement'
                ? (() => {
                    const options = reviewPlacementOptions(result, difference);
                    return (
                      <Select
                        label="Choose the position"
                        placeholder="Select a destination"
                        value={null}
                        data={options.map((option, index) => ({ value: String(index), label: option.label }))}
                        onChange={(value) => {
                          const option = value === null ? undefined : options[Number(value)];
                          if (option) {
                            approve(difference, { kind: 'placement', destination: option.destination });
                          }
                        }}
                      />
                    );
                  })()
                : null}
            </Section>
          );
        })}
      </Stack>
    </Section>
  );
}

function RulebookRename({
  rulebook,
  rulesetSlug,
  onClose,
}: {
  rulebook: RulebookMetadata;
  rulesetSlug: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(rulebook.name);
  const rename = useRenameRulebook();
  const validName = rulebookNameSchema.safeParse(name);
  return (
    <Stack
      component="form"
      aria-label="Rename Rulebook"
      gap="sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (validName.success && !rename.isPending) {
          rename.mutate(
            { rulebookId: rulebook._id, name: validName.data },
            {
              onSuccess: (renamed) => {
                onClose();
                void navigate({
                  to: '/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit',
                  params: { rulesetSlug, rulebookSlug: renamed.slug },
                  hash: true,
                  replace: true,
                });
              },
            }
          );
        }
      }}
    >
      <TextInput
        label="Rulebook name"
        value={name}
        required
        disabled={rename.isPending}
        onChange={(event) => setName(event.currentTarget.value)}
        description={<SlugRenameNotice noun="Rulebook" url={`/rulesets/${rulesetSlug}/rulebooks/${rulebook.slug}`} />}
      />
      {rename.error ? (
        <Alert color="red" title="Rulebook could not be renamed">
          {rename.error.message}
        </Alert>
      ) : null}
      <Group gap="xs">
        <Button
          type="submit"
          color="confirm"
          loading={rename.isPending}
          disabled={!validName.success || name.trim() === rulebook.name}
        >
          Rename Rulebook
        </Button>
        <Button variant="default" disabled={rename.isPending} onClick={onClose}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

type EditablePageData = Extract<RulebookEditorPageData, { kind: 'editable' }>;
type EditorView = {
  result: RulebookEditorResult;
  fit: DocumentEditorFit;
  reviewing: boolean;
  renaming: boolean;
  publishing: boolean;
  notice: 'saved' | 'stale' | 'published' | 'unchanged' | null;
};
type EditorViewAction =
  | { kind: 'result'; result: RulebookEditorResult; notice?: EditorView['notice'] }
  | { kind: 'fit' }
  | { kind: 'review'; open: boolean }
  | { kind: 'rename'; open: boolean }
  | { kind: 'publish'; open: boolean };

/**
 * The rename and Publish panels are only valid on a clean, settled draft.
 * Their open flags are cleared the moment that stops holding, so a later Save cannot spring either back open.
 */
function isCleanSettledDraft(result: RulebookEditorResult): boolean {
  if (result.status !== 'ready') {
    return false;
  }
  const hasLocalChanges = Object.values(result.rebasedPatch)
    .filter(Array.isArray)
    .some((value) => value.length > 0);
  return !hasLocalChanges && result.incompatibilities.length === 0 && !result.isSaving;
}

function editorViewReducer(view: EditorView, action: EditorViewAction): EditorView {
  switch (action.kind) {
    case 'result':
      return {
        ...view,
        result: action.result,
        notice: action.notice ?? null,
        renaming: view.renaming && isCleanSettledDraft(action.result),
        publishing: view.publishing && isCleanSettledDraft(action.result),
      };
    case 'fit':
      return { ...view, fit: view.fit === 'height' ? 'width' : 'height' };
    case 'review':
      return { ...view, reviewing: action.open };
    case 'rename':
      return { ...view, renaming: action.open };
    case 'publish':
      return { ...view, publishing: action.open };
  }
}

type ArtifactStatus = EditablePageData['currentEdition']['html']['status'];

function artifactStatusLabel(kind: RulebookEditionArtifactKind, status: ArtifactStatus) {
  return `${kind.toUpperCase()} ${status}`;
}

function artifactStatusColor(status: ArtifactStatus) {
  switch (status) {
    case 'ready':
      return 'green';
    case 'failed':
      return 'red';
    case 'preparing':
      return 'gray';
  }
}

type DraftReferences = ReturnType<typeof collectRulebookReferenceIds>;

function RulebookEditorSession({
  data,
  onReferencesChange,
}: {
  data: EditablePageData;
  onReferencesChange: (references: DraftReferences) => void;
}) {
  const { rulesetSlug } = Route.useParams();
  const [manager] = useState(() => {
    const saved = { revision: String(data.draft.revision), contents: data.draft.contents };
    return createRulebookEditorStateManager({
      baseline: saved,
      latest: saved,
      resolutionLedger: [],
      patch: {
        schemaVersion: 1,
        baselineRevision: saved.revision,
        creates: [],
        deletes: [],
        sets: [],
        placements: [],
        restorations: [],
      },
    });
  });
  const [view, sendView] = useReducer(editorViewReducer, {
    result: manager.result,
    fit: 'height',
    reviewing: false,
    renaming: false,
    publishing: false,
    notice: null,
  });
  const { result, fit } = view;
  const references = useMemo(
    () => (result.status === 'ready' ? collectRulebookReferenceIds(result.draft) : { assetIds: [], factionIds: [] }),
    [result]
  );
  useEffect(() => onReferencesChange(references), [references, onReferencesChange]);
  const saveMutation = useSaveRulebook();
  const publishMutation = usePublishRulebook();
  const publishLabelId = useId();
  const [clippingReport, setClippingReport] = useState<RulebookClippingReport>([]);
  const receiveClippingReport = useCallback((next: RulebookClippingReport) => {
    setClippingReport((current) => (sameClippingReport(current, next) ? current : next));
  }, []);
  const clippingWarnings =
    result.status === 'ready'
      ? clippingReport.flatMap(({ pageId, blocks, footerFields }) => {
          const page = result.draft.pagesById[pageId];
          if (!page) {
            return [];
          }
          const pageNumber = result.draft.pageOrder.indexOf(page.id) + 1;
          const blockWarnings = blocks.flatMap(({ blockId, regionKey }) => {
            const block = page.blocksById[blockId];
            const region = getRulebookLayout(page.layoutId).regions.find((candidate) => candidate.key === regionKey);
            return block && region?.kind === 'block'
              ? [
                  {
                    source: `Page ${pageNumber} / ${blockWarningLabel(page, block)}`,
                    complaint: 'is clipped',
                    help: 'Part of this Block will not be visible in the published Rulebook.',
                    pageId: page.id,
                    leaf: block.id,
                  },
                ]
              : [];
          });
          const footerWarnings =
            page.layoutId === 'cover' && getRulebookCoverFooter(page.controlValues).enabled
              ? footerFields.map((field) => ({
                  source: `Page ${pageNumber} / Cover footer ${field}`,
                  complaint: 'is clipped',
                  help: `Part of this footer ${field} will not be visible in the published Rulebook.`,
                  pageId,
                  leaf: 'footer',
                }))
              : [];
          return [...blockWarnings, ...footerWarnings];
        })
      : [];
  const header = useEditPageHeader({
    warnings: clippingWarnings,
    onFocusWarning: (warning) => {
      window.location.hash = editorHash(warning.pageId, warning.leaf);
    },
  });
  const dispatch: RulebookEditorStateManager['dispatch'] = (action) => {
    const next = manager.dispatch(action);
    sendView({ kind: 'result', result: next });
    return next;
  };

  useEffect(() => {
    const current = manager.result;
    /* Install the mutation acknowledgement before any subscription echo or later revision.
     * Otherwise a rebase during Save would change the baseline used to retain in-flight edits.
     */
    if (current.status === 'ready' && !current.isSaving && data.draft.revision > Number(current.latest.revision)) {
      sendView({
        kind: 'result',
        result: manager.dispatch({
          kind: 'receive-latest',
          latest: { revision: String(data.draft.revision), contents: data.draft.contents },
        }),
      });
    }
  }, [manager, data.draft, result.isSaving]);

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
  const save = async () => {
    if (!manager.result.canSave) {
      return;
    }
    const saving = manager.dispatch({ kind: 'begin-save' });
    sendView({ kind: 'result', result: saving });
    if (saving.status !== 'ready' || !saving.saveRequest) {
      return;
    }
    try {
      const response = await saveMutation.mutateAsync({
        rulebookId: data.rulebook._id,
        expectedRevision: Number(saving.saveRequest.expectedRevision),
        contents: saving.saveRequest.contents,
      });
      const saved = { revision: String(response.draft.revision), contents: response.draft.contents };
      sendView({
        kind: 'result',
        notice: response.kind,
        result: manager.dispatch(
          response.kind === 'saved' ? { kind: 'save-succeeded', saved } : { kind: 'save-stale', latest: saved }
        ),
      });
    } catch (error) {
      dispatch({
        kind: 'save-failed',
        message:
          error instanceof Error
            ? `Save failed. ${mutationErrorMessage(error)}`
            : 'Save failed. Your changes are still here. Try again.',
      });
    }
  };
  const needsReview = result.incompatibilities.length > 0;
  const draftIsCurrent = Number(result.latest.revision) === data.draft.revision;
  /* What makes an Edition publishable at all, which the open panel keeps holding while its own mutation is
     in flight. `canPublish` adds the conditions that only gate the toolbar trigger. */
  const publishable =
    !hasLocalChanges && !needsReview && !result.isSaving && data.hasUnpublishedChanges && draftIsCurrent;
  const canPublish =
    publishable && !publishMutation.isPending && view.notice !== 'published' && view.notice !== 'unchanged';
  const nextEditionNumber = data.currentEdition.edition_number + 1;
  const publish = async () => {
    if (!canPublish) {
      return;
    }
    try {
      const response = await publishMutation.mutateAsync({
        rulebookId: data.rulebook._id,
        expectedRevision: data.draft.revision,
      });
      if (response.kind === 'stale') {
        const latest = { revision: String(response.draft.revision), contents: response.draft.contents };
        sendView({
          kind: 'result',
          notice: 'stale',
          result: manager.dispatch({ kind: 'receive-latest', latest }),
        });
      } else {
        sendView({ kind: 'result', notice: response.kind, result: manager.result });
      }
      sendView({ kind: 'publish', open: false });
    } catch {
      /* The mutation exposes its error beside the confirmation action. */
    }
  };

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <Toolbar className={styles.editorToolbar}>
          <Toolbar.Left>
            <Group gap="sm" wrap="wrap">
              <IconAction
                label="Back to ruleset"
                intent="neutral"
                emphasis="quiet"
                icon={<ArrowLeft size={17} aria-hidden />}
                renderRoot={(props) => <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug }} />}
              />
              <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
                {data.rulebook.name}
              </Text>
              <Stack gap={4}>
                <Badge variant="light" color={needsReview || hasLocalChanges ? 'yellow' : 'gray'}>
                  {result.isSaving
                    ? 'Saving'
                    : needsReview
                      ? 'Review needed'
                      : hasLocalChanges
                        ? 'Local changes'
                        : 'Saved draft'}
                </Badge>
                <Text size="xs" c="dimmed">
                  Revision {result.latest.revision}
                </Text>
              </Stack>
              <Stack gap={4}>
                <Badge variant="light" color="gray">
                  Edition {data.currentEdition.edition_number}
                </Badge>
                <Group gap={4} wrap="nowrap">
                  {RULEBOOK_EDITION_ARTIFACT_KINDS.map((kind) => (
                    <Badge
                      key={kind}
                      size="xs"
                      variant="light"
                      color={artifactStatusColor(data.currentEdition[kind].status)}
                    >
                      {artifactStatusLabel(kind, data.currentEdition[kind].status)}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Group gap="xs" wrap="wrap">
              {data.canRename ? (
                <IconAction
                  label="Rename Rulebook"
                  intent="neutral"
                  emphasis="quiet"
                  tooltip={
                    hasLocalChanges || needsReview
                      ? 'Save your changes before renaming this Rulebook.'
                      : 'Rename Rulebook'
                  }
                  disabled={hasLocalChanges || needsReview || result.isSaving}
                  icon={<TextCursorInput size={16} aria-hidden />}
                  onClick={() => sendView({ kind: 'rename', open: !view.renaming })}
                />
              ) : null}
              <Button size="xs" variant="default" onClick={() => sendView({ kind: 'fit' })}>
                Fit {fit === 'height' ? 'width' : 'height'}
              </Button>
              <Button
                size="xs"
                color="confirm"
                loading={result.isSaving}
                disabled={!needsReview && !result.canSave}
                onClick={() => (needsReview ? sendView({ kind: 'review', open: true }) : void save())}
              >
                {needsReview ? 'Review differences' : view.notice === 'saved' && !hasLocalChanges ? 'Saved' : 'Save'}
              </Button>
              <Popover
                opened={view.publishing && publishable}
                onChange={(opened) => sendView({ kind: 'publish', open: opened })}
                position="bottom-end"
                width={320}
                shadow="md"
                withArrow
                arrowPosition="center"
                trapFocus
                returnFocus
                /* A failed publish adds its Alert to an already-measured pane, so the placement chosen on
                   open has to stay free to move. Same reason as `AssignPopover`, different growth. */
                preventPositionChangeWhenVisible={false}
              >
                <Popover.Target>
                  <Button
                    size="xs"
                    color="confirm"
                    disabled={!canPublish}
                    onClick={() => {
                      publishMutation.reset();
                      sendView({ kind: 'publish', open: !view.publishing });
                    }}
                  >
                    Publish
                  </Button>
                </Popover.Target>
                <Popover.Dropdown aria-labelledby={publishLabelId}>
                  <Stack gap="sm">
                    {/* Not a heading: a popover is not part of the page outline, so it names the dropdown
                        through `aria-labelledby` the way the pickers' pane does. */}
                    <Text id={publishLabelId} fw={700} fz="h4">
                      Publish Edition {nextEditionNumber}?
                    </Text>
                    <Text size="sm">
                      This makes the saved draft the Rulebook&apos;s current public Edition. Its Contents are permanent;
                      HTML and PDF become available separately when each artifact is ready.
                    </Text>
                    {publishMutation.error ? (
                      <Alert color="red" title="Edition could not be published">
                        {publishMutation.error.message}
                      </Alert>
                    ) : null}
                    <Group gap="xs">
                      <Button color="confirm" loading={publishMutation.isPending} onClick={() => void publish()}>
                        Publish Edition {nextEditionNumber}
                      </Button>
                      <Button
                        variant="default"
                        disabled={publishMutation.isPending}
                        onClick={() => sendView({ kind: 'publish', open: false })}
                      >
                        Cancel
                      </Button>
                    </Group>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <Stack gap="md">
          {view.renaming && data.canRename && !hasLocalChanges && !needsReview && !result.isSaving ? (
            <Surface padding="md">
              <RulebookRename
                rulebook={data.rulebook}
                rulesetSlug={rulesetSlug}
                onClose={() => sendView({ kind: 'rename', open: false })}
              />
            </Surface>
          ) : null}
          {result.operationError ? <Alert color="red">{result.operationError}</Alert> : null}
          {view.notice === 'stale' ? (
            <Alert color="yellow" role="status">
              Another editor saved first. Your changes are still here.{' '}
              {needsReview
                ? 'Review the differences before saving.'
                : 'The saved changes have been combined with yours. Save again when ready.'}
            </Alert>
          ) : null}
          {view.notice === 'published' ? (
            <Alert color="green" role="status">
              The new Edition is now current. HTML and PDF are being prepared independently.
            </Alert>
          ) : null}
          {view.notice === 'unchanged' ? (
            <Alert color="blue" role="status">
              The saved draft already matches the current Edition.
            </Alert>
          ) : null}
          {view.reviewing ? (
            <RulebookDifferenceReview
              result={result}
              dispatch={dispatch}
              onClose={() => sendView({ kind: 'review', open: false })}
            />
          ) : null}
          <section className={styles.editorRoot} aria-label="Rulebook editing workspace" hidden={view.reviewing}>
            <RulebookWorkspace
              result={result}
              settings={data.rulebook.settings}
              dispatch={dispatch}
              fit={fit}
              assetsById={data.assetsById}
              factionsById={data.factionsById}
              onClippingChange={receiveClippingReport}
              onSettle={header.settle}
            />
          </section>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function RulebookEditorPage() {
  const params = Route.useParams();
  const initialData = Route.useLoaderData();
  const [references, sendReferences] = useReducer(
    (current: DraftReferences, next: DraftReferences) => (deepEqual(current, next) ? current : next),
    { assetIds: [], factionIds: [] }
  );
  const locator = `${params.rulesetSlug}/${params.rulebookSlug}`;
  const [retainedQuery, receiveQuery] = useReducer(receiveRulebookEditorQuery, { locator, data: initialData });
  const {
    data: queryData,
    isPending,
    isLoading,
  } = useRulebookEditor({
    ...params,
    initialData,
    referenceAssetIds: references.assetIds,
    referenceFactionIds: references.factionIds,
  });
  const { data } = receiveRulebookEditorQuery(retainedQuery, { data: queryData, isPending, isLoading, locator });
  useEffect(() => {
    receiveQuery({ data: queryData, isPending, isLoading, locator });
  }, [locator, queryData, isPending, isLoading]);
  if (data?.kind === 'editable') {
    return <RulebookEditorSession key={data.rulebook._id} data={data} onReferencesChange={sendReferences} />;
  }
  return (
    <PageMessage
      title={data ? `Edit ${data.rulebook.name}` : 'Edit Rulebook'}
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: params.rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
    >
      {data === undefined ? (
        <LoadPending title="Loading Rulebook">Loading the saved draft and your editing access.</LoadPending>
      ) : data === null ? (
        <NotAvailable title="Rulebook not found">This Rulebook does not exist or was deleted.</NotAvailable>
      ) : data.kind === 'sign-in-required' ? (
        <LoginGate action="edit this Rulebook" />
      ) : (
        <NotAvailable title="You cannot edit this Rulebook">
          Only the Ruleset owner or an active member of its Group can edit this Rulebook.
        </NotAvailable>
      )}
    </PageMessage>
  );
}

function RulebookEditorError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Edit Rulebook" back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}>
      <LoadError title="This Rulebook could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}
