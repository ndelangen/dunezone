import { ConvexError } from 'convex/values';

import { isRulebookLayoutSupported } from '../../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../../src/shared/rulebooks/contents';
import type { RulebookSettings } from '../../src/shared/rulebooks/settings';
import { isRulebookCoverImageDeliveryUrl } from './rulebookCoverImage';

/** Surviving Page identities retain their layout and creation-only arrangement. */
export function assertFixedPageLayouts(
  previous: RulebookContentsV1,
  next: RulebookContentsV1,
  settings: RulebookSettings,
  previousSettings?: RulebookSettings
) {
  for (const page of Object.values(next.pagesById)) {
    const before = previous.pagesById[page.id];
    if (
      (!before || previousSettings?.size !== settings.size) &&
      !isRulebookLayoutSupported(page.layoutId, settings.size)
    ) {
      throw new ConvexError('Choose a Page layout supported by this Rulebook size.');
    }
    if (!before) {
      continue;
    }
    if (before.layoutId !== page.layoutId) {
      throw new ConvexError('A Page layout is fixed when the Page is created.');
    }
    if (
      page.layoutId === 'wide-narrow' &&
      before.layoutId === 'wide-narrow' &&
      before.controlValues.widePosition !== page.controlValues.widePosition
    ) {
      throw new ConvexError('The wide column position is fixed when the Page is created.');
    }
    if (
      page.layoutId === 'band-columns' &&
      before.layoutId === 'band-columns' &&
      before.controlValues.bandPosition !== page.controlValues.bandPosition
    ) {
      throw new ConvexError('The band position is fixed when the Page is created.');
    }
  }
}

function pageBlockIdentities(contents: RulebookContentsV1) {
  return Object.values(contents.pagesById).flatMap((page) =>
    Object.keys(page.blocksById).map((blockId) => ({ pageId: page.id, blockId }))
  );
}

function removedBlockOwners(previous: RulebookContentsV1, next: RulebookContentsV1) {
  const removedOwners = new Map<string, Set<string>>();
  for (const { pageId, blockId } of pageBlockIdentities(previous)) {
    if (next.pagesById[pageId]?.blocksById[blockId]) {
      continue;
    }
    const owners = removedOwners.get(blockId) ?? new Set<string>();
    owners.add(pageId);
    removedOwners.set(blockId, owners);
  }
  return removedOwners;
}

/** Block IDs belong to their Page, even when the old Page is replaced. */
export function assertFixedBlockOwnership(previous: RulebookContentsV1, next: RulebookContentsV1) {
  const removedOwners = removedBlockOwners(previous, next);
  const moved = pageBlockIdentities(next)
    .filter(({ pageId, blockId }) => !previous.pagesById[pageId]?.blocksById[blockId])
    .some(({ pageId, blockId }) => [...(removedOwners.get(blockId) ?? [])].some((owner) => owner !== pageId));
  if (moved) {
    throw new ConvexError('A Block moved to another Page needs a new ID.');
  }
}

export function assertStoredRulebookCoverImages(contents: RulebookContentsV1) {
  for (const page of Object.values(contents.pagesById)) {
    if (page.layoutId !== 'cover') {
      continue;
    }
    const { backgroundImageUrl, backgroundImage, backgroundSource } = page.controlValues.cover;
    const usesUrl = backgroundSource?.kind !== 'preset';
    if (
      (usesUrl && backgroundImageUrl && backgroundImageUrl !== backgroundImage?.sourceUrl) ||
      (backgroundImage &&
        ((usesUrl && backgroundImageUrl === '') || !isRulebookCoverImageDeliveryUrl(backgroundImage.url)))
    ) {
      throw new ConvexError('Store the cover image before saving the Rulebook.');
    }
  }
}
