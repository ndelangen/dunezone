export type ClippedRulebookBlock = Readonly<{
  blockId: string;
  regionKey: string;
}>;

const clippingTolerance = 0.5;

function blockFallsBelowRegion(block: Element, region: Element) {
  return block.getBoundingClientRect().bottom > region.getBoundingClientRect().bottom + clippingTolerance;
}

function clippedBlockIdentity(block: HTMLElement): ClippedRulebookBlock | undefined {
  const blockId = block.dataset.rulebookBlockId;
  if (!blockId) {
    return undefined;
  }
  const region = block.closest<HTMLElement>('[data-rulebook-region]');
  if (!region) {
    return undefined;
  }
  const regionKey = region.dataset.rulebookRegion;
  if (!regionKey) {
    return undefined;
  }
  if (!blockFallsBelowRegion(block, region)) {
    return undefined;
  }
  return { blockId, regionKey };
}

/** Finds every rendered Block whose bottom falls outside its fixed Block region. */
export function clippedRulebookBlocks(root: ParentNode): ClippedRulebookBlock[] {
  return [...root.querySelectorAll<HTMLElement>('[data-rulebook-block-id]')].flatMap((block) => {
    const identity = clippedBlockIdentity(block);
    return identity ? [identity] : [];
  });
}

export function markClippedRulebookBlocks(root: ParentNode, clipped: readonly ClippedRulebookBlock[]) {
  const clippedRegionKeys = new Set(clipped.map(({ regionKey }) => regionKey));
  const clippedBlockKeys = new Set(clipped.map(({ blockId, regionKey }) => `${regionKey}:${blockId}`));
  root.querySelectorAll<HTMLElement>('[data-rulebook-region]').forEach((region) => {
    region.toggleAttribute('data-rulebook-clipped-region', clippedRegionKeys.has(region.dataset.rulebookRegion ?? ''));
  });
  root.querySelectorAll<HTMLElement>('[data-rulebook-block-id]').forEach((block) => {
    const regionKey = block.closest<HTMLElement>('[data-rulebook-region]')?.dataset.rulebookRegion ?? '';
    const blockKey = `${regionKey}:${block.dataset.rulebookBlockId ?? ''}`;
    block.toggleAttribute('data-rulebook-clipped', clippedBlockKeys.has(blockKey));
  });
}

export function stripRulebookMeasurementIds(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[id]').forEach((element) => element.removeAttribute('id'));
}

export function findRulebookLocatorTarget(
  root: ParentNode,
  target: Readonly<{ anchorId: string; pageId: string; blockId?: string }>
) {
  const page = [...root.querySelectorAll<HTMLElement>('[data-rulebook-page-id]')].find(
    (candidate) => candidate.dataset.rulebookPageId === target.pageId
  );
  if (target.blockId && page) {
    const block = [...page.querySelectorAll<HTMLElement>('[data-rulebook-block-id]')].find(
      (candidate) => candidate.dataset.rulebookBlockId === target.blockId
    );
    if (block) {
      return block;
    }
  }
  return [...root.querySelectorAll<HTMLElement>('[id]')].find((candidate) => candidate.id === target.anchorId) ?? null;
}

function clippedPageFor(target: HTMLElement) {
  const region = target.closest<HTMLElement>('[data-rulebook-region]');
  if (!region) {
    return null;
  }
  if (!blockFallsBelowRegion(target, region)) {
    return null;
  }
  return target.closest<HTMLElement>('[data-rulebook-page-id]');
}

function outsideViewport(bounds: DOMRect, viewportHeight: number) {
  if (bounds.bottom < 0) {
    return true;
  }
  return bounds.top > viewportHeight;
}

/** Reveals a linked Block without pretending that content hidden by the fixed Page can be scrolled into view. */
export function revealRulebookLocatorTarget(target: HTMLElement, viewportHeight = window.innerHeight) {
  const clippedPage = clippedPageFor(target);
  if (clippedPage) {
    clippedPage.scrollIntoView({ block: 'end' });
    return;
  }
  const bounds = target.getBoundingClientRect();
  if (outsideViewport(bounds, viewportHeight)) {
    target.scrollIntoView({ block: 'center' });
  }
}
