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
  root.querySelectorAll<HTMLElement>('[data-rulebook-clipped]').forEach((element) => {
    element.removeAttribute('data-rulebook-clipped');
  });
  root.querySelectorAll<HTMLElement>('[data-rulebook-clipped-region]').forEach((element) => {
    element.removeAttribute('data-rulebook-clipped-region');
  });
  for (const warning of clipped) {
    const region = [...root.querySelectorAll<HTMLElement>('[data-rulebook-region]')].find(
      (candidate) => candidate.dataset.rulebookRegion === warning.regionKey
    );
    const block = [...(region?.querySelectorAll<HTMLElement>('[data-rulebook-block-id]') ?? [])].find(
      (candidate) => candidate.dataset.rulebookBlockId === warning.blockId
    );
    region?.setAttribute('data-rulebook-clipped-region', 'true');
    block?.setAttribute('data-rulebook-clipped', 'true');
  }
}

export function findRulebookLocatorTarget(root: ParentNode, target: Readonly<{ anchorId: string; blockId?: string }>) {
  if (target.blockId) {
    const block = [...root.querySelectorAll<HTMLElement>('[data-rulebook-block-id]')].find(
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
