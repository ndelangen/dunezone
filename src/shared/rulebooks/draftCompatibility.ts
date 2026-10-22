import { isRulebookLayoutSupported } from './contents';
import type { RulebookContentsDraftV1 } from './contents';
import type { RulebookSettings } from './settings';

/** Surviving Page identities retain their layout and creation-only arrangement. */
function fixedPageLayoutsError(
  previous: RulebookContentsDraftV1,
  next: RulebookContentsDraftV1,
  settings: RulebookSettings,
  previousSettings?: RulebookSettings
) {
  for (const page of Object.values(next.pagesById)) {
    const before = previous.pagesById[page.id];
    if (
      (!before || previousSettings?.size !== settings.size) &&
      !isRulebookLayoutSupported(page.layoutId, settings.size)
    ) {
      return 'Choose a Page layout supported by this Rulebook size.';
    }
    if (!before) {
      continue;
    }
    if (before.layoutId !== page.layoutId) {
      return 'A Page layout is fixed when the Page is created.';
    }
    if (
      page.layoutId === 'wide-narrow' &&
      before.layoutId === 'wide-narrow' &&
      before.controlValues.widePosition !== page.controlValues.widePosition
    ) {
      return 'The wide column position is fixed when the Page is created.';
    }
    if (
      page.layoutId === 'band-columns' &&
      before.layoutId === 'band-columns' &&
      before.controlValues.bandPosition !== page.controlValues.bandPosition
    ) {
      return 'The band position is fixed when the Page is created.';
    }
  }
}

function pageBlockIdentities(contents: RulebookContentsDraftV1) {
  return Object.values(contents.pagesById).flatMap((page) =>
    Object.keys(page.blocksById).map((blockId) => ({ pageId: page.id, blockId }))
  );
}

function removedBlockOwners(previous: RulebookContentsDraftV1, next: RulebookContentsDraftV1) {
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
function fixedBlockOwnershipError(previous: RulebookContentsDraftV1, next: RulebookContentsDraftV1) {
  const removedOwners = removedBlockOwners(previous, next);
  const moved = pageBlockIdentities(next)
    .filter(({ pageId, blockId }) => !previous.pagesById[pageId]?.blocksById[blockId])
    .some(({ pageId, blockId }) => [...(removedOwners.get(blockId) ?? [])].some((owner) => owner !== pageId));
  if (moved) {
    return 'A Block moved to another Page needs a new ID.';
  }
}

export function rulebookDraftCompatibilityError(
  previous: RulebookContentsDraftV1,
  next: RulebookContentsDraftV1,
  settings: RulebookSettings,
  previousSettings?: RulebookSettings
) {
  return fixedPageLayoutsError(previous, next, settings, previousSettings) ?? fixedBlockOwnershipError(previous, next);
}

export function rulebookCoverImagesError(contents: RulebookContentsDraftV1, deliveryOrigins: readonly string[]) {
  for (const page of Object.values(contents.pagesById)) {
    if (page.layoutId !== 'cover') {
      continue;
    }
    const { backgroundImageUrl, backgroundImage, backgroundSource } = page.controlValues.cover;
    const usesUrl = backgroundSource?.kind !== 'preset';
    if (
      (usesUrl && backgroundImageUrl && backgroundImageUrl !== backgroundImage?.sourceUrl) ||
      (backgroundImage &&
        ((usesUrl && backgroundImageUrl === '') || !deliveryOrigins.includes(new URL(backgroundImage.url).origin)))
    ) {
      return 'Store the cover image before saving the Rulebook.';
    }
  }
}
