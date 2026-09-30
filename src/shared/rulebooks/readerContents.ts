import type { RulebookEditionContentsV1 } from './contents';

/**
 * Reader Contents retain the stored image reference without exposing the author's source URL.
 * The public reader and the anonymised dev snapshot both show an Edition through this one projection, so neither can expose more than the other.
 */
export function readerContents(contents: RulebookEditionContentsV1) {
  const copy = structuredClone(contents);
  for (const page of Object.values(copy.pagesById)) {
    if (page.layoutId !== 'cover') {
      continue;
    }
    const cover = page.controlValues.cover;
    if (cover.backgroundSource?.kind === 'preset') {
      delete cover.backgroundImage;
      delete cover.backgroundImageUrl;
      continue;
    }
    if (cover.backgroundImage) {
      cover.backgroundImage.sourceUrl = cover.backgroundImage.url;
    }
    if (cover.backgroundImageUrl !== undefined) {
      cover.backgroundImageUrl = cover.backgroundImage?.url ?? '';
    }
  }
  return copy;
}
