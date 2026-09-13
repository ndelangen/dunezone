import { resolveAsset } from '../../game/assets/resolveAsset';
import { rulebookAnnotatedIllustrationPath } from '../../shared/rulebooks/annotatedIllustration';
import type { RulebookRenderDocumentV1, RulebookRenderFactionV1 } from '../../shared/rulebooks/renderDocument';

/** Downloaded HTML needs absolute image addresses while its section links remain local to the file. */
export function rulebookHtmlImages(
  document: RulebookRenderDocumentV1,
  canonicalHref: string,
  edition?: { rulebookId: string; editionNumber: number }
): RulebookRenderDocumentV1 {
  const copy = structuredClone(document);
  function image(source: { status: string; imageUrl?: string }) {
    if (source.status === 'ready' && source.imageUrl) {
      source.imageUrl = new URL(resolveAsset(source.imageUrl, 'large'), canonicalHref).href;
    }
  }
  function faction(source: RulebookRenderFactionV1) {
    if (source.status !== 'ready') {
      return;
    }
    if (source.emblemUrl) {
      source.emblemUrl = new URL(source.emblemUrl, canonicalHref).href;
    }
    if (source.ruler) {
      image(source.ruler);
    }
    for (const leader of source.leaders ?? []) {
      image(leader);
    }
  }
  for (const page of Object.values(copy.pagesById)) {
    if (page.layoutId === 'cover') {
      const cover = page.controlValues.cover;
      image(cover.artwork);
      if (cover.backgroundImage) {
        cover.backgroundImage.url = new URL(cover.backgroundImage.url, canonicalHref).href;
      }
      if (cover.backgroundImageUrl) {
        cover.backgroundImageUrl = new URL(cover.backgroundImageUrl, canonicalHref).href;
      }
    }
    for (const region of page.regions) {
      for (const block of region.blocks) {
        if (block.kind === 'asset-explainer' && edition) {
          block.illustrationUrl = new URL(
            rulebookAnnotatedIllustrationPath({ ...edition, pageId: page.id, blockId: block.id }),
            canonicalHref
          ).href;
        }
        if (block.kind === 'asset-figure') {
          image(block.asset);
        }
        if (block.kind === 'referenced-illustration' || block.kind === 'card-entry') {
          image(block.source);
        }
        if (block.kind === 'illustrated-inventory' || block.kind === 'card-group') {
          for (const item of block.items) {
            image(item.source);
          }
        }
        if (block.kind === 'faction-introduction' || block.kind === 'section-heading') {
          faction(block.faction);
        }
      }
    }
  }
  return copy;
}
