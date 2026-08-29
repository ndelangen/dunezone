import type { RulebookBlockRegionKey, RulebookPageDraft } from '@shared/rulebooks/contents';

export interface VerticalRect {
  top: number;
  height: number;
}

export function verticalRectCenter(rect: VerticalRect | null) {
  return rect ? rect.top + rect.height / 2 : null;
}

export type BlockPlacement = Readonly<{
  regionKey: RulebookBlockRegionKey;
  index: number;
}>;

export type BlockDragSession = Readonly<{
  pageId: string;
  blockId: string;
  origin: BlockPlacement;
  candidate: BlockPlacement;
}>;

export type BlockDragSessionAction =
  | Readonly<{
      kind: 'start';
      pageId: string;
      blockId: string;
      placement: BlockPlacement;
    }>
  | Readonly<{
      kind: 'preview';
      blockId: string;
      placement: BlockPlacement;
    }>
  | Readonly<{ kind: 'finish' }>;

export function reduceBlockDragSession(
  session: BlockDragSession | null,
  action: BlockDragSessionAction
): BlockDragSession | null {
  if (action.kind === 'start') {
    return {
      pageId: action.pageId,
      blockId: action.blockId,
      origin: action.placement,
      candidate: action.placement,
    };
  }
  if (action.kind === 'finish') {
    return null;
  }
  if (session?.blockId !== action.blockId) {
    return session;
  }
  if (
    session.candidate.regionKey === action.placement.regionKey &&
    session.candidate.index === action.placement.index
  ) {
    return session;
  }
  return { ...session, candidate: action.placement };
}

function pageBlockOrders(page: RulebookPageDraft) {
  return page.blockOrderByRegion as Record<RulebookBlockRegionKey, string[]>;
}

function pageBlockPlacement(page: RulebookPageDraft, blockId: string): BlockPlacement | null {
  for (const [regionKey, ids] of Object.entries(pageBlockOrders(page))) {
    const index = ids.indexOf(blockId);
    if (index !== -1) {
      return { regionKey: regionKey as RulebookBlockRegionKey, index };
    }
  }
  return null;
}

/** Projects a drag candidate without changing the canonical Rulebook draft. */
export function projectBlockPlacement(
  page: RulebookPageDraft,
  blockId: string,
  placement: BlockPlacement
): RulebookPageDraft {
  const source = pageBlockPlacement(page, blockId);
  if (!source) {
    return page;
  }
  if (source.regionKey === placement.regionKey && source.index === placement.index) {
    return page;
  }

  const blockOrderByRegion = Object.fromEntries(
    Object.entries(pageBlockOrders(page)).map(([regionKey, ids]) => [regionKey, ids.filter((id) => id !== blockId)])
  ) as Record<RulebookBlockRegionKey, string[]>;
  const targetOrder = blockOrderByRegion[placement.regionKey];
  if (!targetOrder) {
    return page;
  }
  targetOrder.splice(Math.max(0, Math.min(placement.index, targetOrder.length)), 0, blockId);
  return { ...page, blockOrderByRegion } as RulebookPageDraft;
}

/** Returns the insertion index for a row target after the active row is removed from its current order. */
export function blockInsertionIndex({
  sourceIndex,
  targetIndex,
  sameRegion,
  activeCenterY,
  targetRect,
}: Readonly<{
  sourceIndex: number;
  targetIndex: number;
  sameRegion: boolean;
  activeCenterY: number | null;
  targetRect: VerticalRect;
}>) {
  if (activeCenterY === null) {
    return targetIndex;
  }
  const targetIndexWithoutActive = targetIndex - (sameRegion && sourceIndex < targetIndex ? 1 : 0);
  const targetCenter = targetRect.top + targetRect.height / 2;
  const centersCoincide = Math.abs(activeCenterY - targetCenter) < 1;
  const insertAfter = activeCenterY > targetCenter || (centersCoincide && sameRegion && sourceIndex < targetIndex);
  return targetIndexWithoutActive + (insertAfter ? 1 : 0);
}

const blockSlotOffset = { before: 0, after: 1 } as const;

/** Returns the insertion index represented by one side of a target row. */
export function blockSlotInsertionIndex(targetIndex: number, side: keyof typeof blockSlotOffset) {
  return targetIndex + blockSlotOffset[side];
}
