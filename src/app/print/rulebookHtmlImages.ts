import { resolveAsset } from '../../game/assets/resolveAsset';
import { rulebookAnnotatedIllustrationPath } from '../../shared/rulebooks/annotatedIllustration';
import type {
  RulebookRenderBlockV1,
  RulebookRenderDocumentV1,
  RulebookRenderFactionV1,
} from '../../shared/rulebooks/renderDocument';

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
    if (source.tokenImageUrl) {
      source.tokenImageUrl = new URL(source.tokenImageUrl, canonicalHref).href;
    }
    if (source.ruler) {
      image(source.ruler);
    }
    for (const leader of source.leaders ?? []) {
      image(leader);
    }
  }
  function battleSide(side: Extract<RulebookRenderBlockV1, { kind: 'battle-step' }>['left']) {
    faction(side.faction);
    image(side.leader);
    for (const card of side.cards) {
      image(card);
    }
    if (side.knownCard) {
      image(side.knownCard);
    }
  }
  function boardScene(board: Omit<Extract<RulebookRenderBlockV1, { kind: 'board-scene' }>, 'kind' | 'id'>) {
    image(board.board);
    for (const item of [...board.players, ...board.troops]) {
      faction(item.faction);
    }
  }
  function resolveBlockImages(block: RulebookRenderBlockV1, pageId: string) {
    if (block.kind === 'asset-explainer' && edition) {
      block.illustrationUrl = new URL(
        rulebookAnnotatedIllustrationPath({ ...edition, pageId, blockId: block.id }),
        canonicalHref
      ).href;
    }
    if (block.kind === 'list') {
      for (const item of block.items) {
        if (item.icon) {
          item.icon = new URL(item.icon, canonicalHref).href;
        }
      }
    }
    if (block.kind === 'referenced-illustration' || block.kind === 'card-entry') {
      image(block.source);
    }
    if (block.kind === 'illustrated-inventory' || block.kind === 'card-group') {
      for (const item of block.items) {
        image(item.source);
      }
    }
    if (block.kind === 'battle-step') {
      battleSide(block.left);
      battleSide(block.right);
    }
    if (block.kind === 'battle-comparison') {
      for (const example of block.examples) {
        battleSide(example.left);
        battleSide(example.right);
      }
    }
    if (block.kind === 'board-scene') {
      boardScene(block);
    }
    if (block.kind === 'piece-movement') {
      for (const group of [block.left, block.right]) {
        for (const piece of group.pieces) {
          if (piece.kind === 'source') {
            image(piece.source);
          } else {
            faction(piece.faction);
          }
        }
      }
      for (const note of block.notes ?? []) {
        image(note.source);
      }
      if (block.board) {
        boardScene(block.board);
      }
    }
    if (block.kind === 'faction-introduction' || block.kind === 'section-heading') {
      faction(block.faction);
    }
  }
  for (const page of Object.values(copy.pagesById)) {
    if (page.headingIcon) {
      page.headingIcon = new URL(page.headingIcon, canonicalHref).href;
    }
    if (page.layoutId === 'cover') {
      const cover = page.controlValues.cover;
      image(cover.artwork);
      if (cover.backgroundImage) {
        cover.backgroundImage.url = new URL(cover.backgroundImage.url, canonicalHref).href;
      }
      if (cover.backgroundImageUrl) {
        cover.backgroundImageUrl = new URL(cover.backgroundImageUrl, canonicalHref).href;
      }
      if (cover.footer?.enabled) {
        faction(cover.footer.leftFaction);
        faction(cover.footer.rightFaction);
      }
    }
    for (const region of page.regions) {
      for (const block of region.blocks) {
        resolveBlockImages(block, page.id);
      }
    }
  }
  return copy;
}
