export type ClippedRulebookBlock = Readonly<{
  blockId: string;
  regionKey: string;
}>;

const clippingTolerance = 0.5;

function blockFallsBelowRegion(block: Element, region: Element) {
  return block.getBoundingClientRect().bottom > region.getBoundingClientRect().bottom + clippingTolerance;
}

/** Finds every rendered Block whose bottom falls outside its fixed Block region. */
export function clippedRulebookBlocks(root: ParentNode): ClippedRulebookBlock[] {
  const clipped: ClippedRulebookBlock[] = [];
  for (const region of root.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
    const regionKey = region.dataset.rulebookRegion;
    if (!regionKey) {
      continue;
    }
    for (const block of region.querySelectorAll<HTMLElement>('[data-rulebook-block-id]')) {
      const blockId = block.dataset.rulebookBlockId;
      if (blockId && blockFallsBelowRegion(block, region)) {
        clipped.push({ blockId, regionKey });
      }
    }
  }
  return clipped;
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

/** Reveals a linked Block without pretending that content hidden by the fixed Page can be scrolled into view. */
export function revealRulebookLocatorTarget(target: HTMLElement, viewportHeight = window.innerHeight) {
  const region = target.closest<HTMLElement>('[data-rulebook-region]');
  const page = target.closest<HTMLElement>('[data-rulebook-page-id]');
  if (region && page && blockFallsBelowRegion(target, region)) {
    page.scrollIntoView({ block: 'end' });
    return;
  }
  const bounds = target.getBoundingClientRect();
  if (bounds.bottom < 0 || bounds.top > viewportHeight) {
    target.scrollIntoView({ block: 'center' });
  }
}
