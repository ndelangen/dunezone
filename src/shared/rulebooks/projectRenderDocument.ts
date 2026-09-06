import { parseFormattedText } from '../formattedText';
import { getRulebookLayout } from './contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from './contents';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type {
  RulebookRenderAssetV1,
  RulebookRenderBlockV1,
  RulebookRenderDocumentV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from './renderDocument';

type RulebookResolvedAssetDisplay = Readonly<{
  assetId: string;
  name: string;
  type: string;
  imageUrl: string | null;
}>;

export type RulebookResolvedAssetsById = Readonly<Record<string, RulebookResolvedAssetDisplay>>;

export type RulebookRenderDiagnostic = Readonly<{
  path: readonly (string | number)[];
  message: string;
}>;

function renderAsset(assetId: string | undefined, assetsById: RulebookResolvedAssetsById): RulebookRenderAssetV1 {
  if (!assetId) {
    return { status: 'unselected' };
  }
  const asset = assetsById[assetId];
  if (!asset?.imageUrl) {
    return { status: 'unavailable', assetId };
  }
  return {
    status: 'ready',
    assetId,
    name: asset.name,
    type: asset.type,
    imageUrl: asset.imageUrl,
  };
}

/** Projects one draft Block to the same render contract used by Pages and publications. */
export function projectRulebookDraftRenderBlock(
  block: RulebookBlockDraft,
  assetsById: RulebookResolvedAssetsById
): RulebookRenderBlockV1 {
  const identity = { id: block.id, ...(block.anchor ? { anchor: block.anchor } : {}) };
  if (block.kind === 'text') {
    return { ...identity, kind: block.kind, text: block.text };
  }
  if (block.kind === 'repeated-text') {
    return {
      ...identity,
      kind: block.kind,
      items: block.itemOrder.flatMap((itemId) => block.itemsById[itemId] ?? []),
    };
  }
  if (block.kind === 'rule-group') {
    return { ...identity, kind: block.kind, title: block.title, text: block.text };
  }
  return {
    ...identity,
    kind: block.kind,
    asset: renderAsset(block.assetId, assetsById),
    text: block.text,
  };
}

/**
 * Projects one draft Page.
 * The editor measures clipping one Page at a time, so an unchanged Page keeps its projection while its neighbours change.
 */
export function projectRulebookDraftRenderPage(
  page: RulebookPageDraft,
  assetsById: RulebookResolvedAssetsById
): RulebookRenderPageV1 {
  const layout = getRulebookLayout(page.layoutId);
  const blockOrderByRegion = page.blockOrderByRegion as Record<string, string[]>;
  return {
    id: page.id,
    anchor: page.anchor,
    title: page.title,
    layoutId: page.layoutId,
    controlValues: page.controlValues,
    regions: layout.regions.flatMap((region) =>
      region.kind === 'block'
        ? [
            {
              key: region.key,
              blocks: (blockOrderByRegion[region.key] ?? []).flatMap((blockId) => {
                const block = page.blocksById[blockId];
                return block ? [projectRulebookDraftRenderBlock(block, assetsById)] : [];
              }),
            },
          ]
        : []
    ),
  } as RulebookRenderPageV1;
}

function formattedTextDiagnostics(value: string, path: readonly (string | number)[]): RulebookRenderDiagnostic[] {
  const parsed = parseFormattedText(value);
  return parsed.valid ? [] : parsed.diagnostics.map(({ message }) => ({ path, message }));
}

function blockTextDiagnostics(pageId: string, blockId: string, block: RulebookBlockDraft): RulebookRenderDiagnostic[] {
  if (block.kind !== 'repeated-text') {
    return formattedTextDiagnostics(block.text, ['pagesById', pageId, 'blocksById', blockId, 'text']);
  }
  return block.itemOrder.flatMap((itemId) => {
    const item = block.itemsById[itemId];
    return item
      ? formattedTextDiagnostics(item.text, ['pagesById', pageId, 'blocksById', blockId, 'itemsById', itemId, 'text'])
      : [];
  });
}

function pageTextDiagnostics(pageId: string, page: RulebookPageDraft): RulebookRenderDiagnostic[] {
  const controlDiagnostics =
    page.layoutId === 'rules-page'
      ? formattedTextDiagnostics(page.controlValues.guidance.introduction, [
          'pagesById',
          pageId,
          'controlValues',
          'guidance',
          'introduction',
        ])
      : [];
  return [
    ...controlDiagnostics,
    ...Object.entries(page.blocksById).flatMap(([blockId, block]) => blockTextDiagnostics(pageId, blockId, block)),
  ];
}

function textDiagnostics(contents: RulebookContentsDraftV1): RulebookRenderDiagnostic[] {
  return contents.pageOrder.flatMap((pageId) => {
    const page = contents.pagesById[pageId];
    return page ? pageTextDiagnostics(pageId, page) : [];
  });
}

/** Projects local editor state without making invalid text publishable. */
export function projectRulebookDraftRenderDocument(
  contents: RulebookContentsDraftV1,
  assetsById: RulebookResolvedAssetsById
): Readonly<{
  document: RulebookRenderPreviewDocumentV1;
  diagnostics: readonly RulebookRenderDiagnostic[];
}> {
  return {
    document: {
      schemaVersion: 1,
      pageOrder: [...contents.pageOrder],
      pagesById: Object.fromEntries(
        contents.pageOrder.flatMap((pageId) => {
          const page = contents.pagesById[pageId];
          return page ? [[pageId, projectRulebookDraftRenderPage(page, assetsById)]] : [];
        })
      ),
    },
    diagnostics: textDiagnostics(contents),
  };
}

/** Projects saved Contents and proves that the result satisfies the publishable renderer contract. */
export function projectRulebookRenderDocument(
  contents: RulebookContentsDraftV1,
  assetsById: RulebookResolvedAssetsById
): RulebookRenderDocumentV1 {
  return rulebookRenderDocumentV1Schema.parse(projectRulebookDraftRenderDocument(contents, assetsById).document);
}
