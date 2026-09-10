import { parseFormattedText } from '../formattedText';
import { getRulebookLayout, isRulebookCollectionBlock } from './contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from './contents';
import type { RulebookResolvedFactionsById } from './references';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type {
  RulebookRenderAssetV1,
  RulebookRenderBlockV1,
  RulebookRenderFactionV1,
  RulebookRenderDocumentV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from './renderDocument';
import type { RulebookSettings } from './settings';
import { resolveRulebookArtworkSource } from './sources';
import type {
  RulebookCardSourceReference,
  RulebookResolvedAssetsById,
  RulebookResolvedSource,
  RulebookSourceReference,
} from './sources';

export type { RulebookResolvedAssetsById } from './sources';
export type { RulebookResolvedFactionsById } from './references';

function renderFaction(
  factionId: string | undefined,
  factionsById: RulebookResolvedFactionsById
): RulebookRenderFactionV1 {
  if (!factionId) {
    return { status: 'unselected' };
  }
  const faction = factionsById[factionId];
  return faction ? { status: 'ready', ...faction } : { status: 'unavailable', factionId };
}

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

/** Resolves a selected source without copying its display fields into authored Contents. */
export function projectRulebookSource(
  reference: RulebookSourceReference | undefined,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById = {}
): RulebookResolvedSource {
  if (!reference) {
    return { status: 'unselected' };
  }
  const artwork = resolveRulebookArtworkSource(reference);
  if (artwork) {
    return artwork;
  }
  if (reference.kind === 'asset') {
    const asset = assetsById[reference.assetId];
    return asset?.imageUrl
      ? {
          status: 'ready',
          reference,
          name: asset.name,
          imageUrl: asset.imageUrl,
          width: asset.width,
          height: asset.height,
          geometry: asset.geometry,
          publicationRevision: asset.publicationRevision,
        }
      : { status: 'unavailable', reference };
  }
  if (reference.kind === 'faction') {
    const faction = factionsById[reference.factionId];
    return faction?.emblemUrl
      ? { status: 'ready', reference, name: faction.name, imageUrl: faction.emblemUrl }
      : { status: 'unavailable', reference };
  }
  if (reference.kind === 'faction-member') {
    const faction = factionsById[reference.factionId];
    const member = [faction?.ruler, ...(faction?.leaders ?? [])].find(
      (source) =>
        source &&
        source.status !== 'unselected' &&
        source.reference.kind === 'faction-member' &&
        source.reference.memberId === reference.memberId
    );
    return member ?? { status: 'unavailable', reference };
  }
  return { status: 'unavailable', reference };
}

/** Card guides retain their selected identity when its Asset is no longer a treachery Card. */
function projectRulebookCardSource(
  reference: RulebookCardSourceReference | undefined,
  assetsById: RulebookResolvedAssetsById
): RulebookResolvedSource {
  if (reference && assetsById[reference.assetId]?.type !== 'card-treachery') {
    return { status: 'unavailable', reference };
  }
  return projectRulebookSource(reference, assetsById);
}

/** Projects one draft Block to the same render contract used by Pages and publications. */
export function projectRulebookDraftRenderBlock(
  block: RulebookBlockDraft,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById = {}
): RulebookRenderBlockV1 {
  const identity = { id: block.id, ...(block.anchor ? { anchor: block.anchor } : {}) };
  if (block.kind === 'text') {
    return {
      ...identity,
      kind: block.kind,
      ...(block.name === undefined ? {} : { name: block.name }),
      text: block.text,
    };
  }
  if (block.kind === 'repeated-text') {
    return {
      ...identity,
      kind: block.kind,
      items: block.itemOrder.flatMap((itemId) => block.itemsById[itemId] ?? []),
    };
  }
  if (block.kind === 'section-heading') {
    return { ...identity, kind: block.kind, title: block.title, faction: renderFaction(block.factionId, factionsById) };
  }
  if (block.kind === 'list') {
    return {
      ...identity,
      kind: block.kind,
      style: block.style,
      items: block.itemOrder.flatMap((id) => block.itemsById[id] ?? []),
    };
  }
  if (block.kind === 'callout') {
    return {
      ...identity,
      kind: block.kind,
      variant: block.variant,
      title: block.title,
      text: block.text,
      attribution: block.attribution,
    };
  }
  if (block.kind === 'question-answer') {
    return { ...identity, kind: block.kind, topic: block.topic, question: block.question, answer: block.answer };
  }
  if (block.kind === 'referenced-illustration') {
    return {
      ...identity,
      kind: block.kind,
      source: projectRulebookSource(block.source, assetsById, factionsById),
      caption: block.caption,
    };
  }
  if (block.kind === 'asset-explainer') {
    return {
      ...identity,
      kind: block.kind,
      source: projectRulebookSource(block.source, assetsById, factionsById),
      caption: block.caption,
      numbering: block.numbering,
      colorMode: block.colorMode,
      items: block.itemOrder.flatMap((id) => block.itemsById[id] ?? []),
    };
  }
  if (block.kind === 'illustrated-inventory') {
    return {
      ...identity,
      kind: block.kind,
      title: block.title,
      introduction: block.introduction,
      items: block.itemOrder.flatMap((id) => {
        const item = block.itemsById[id];
        return item ? [{ ...item, source: projectRulebookSource(item.source, assetsById, factionsById) }] : [];
      }),
    };
  }
  if (block.kind === 'card-entry') {
    return {
      ...identity,
      kind: block.kind,
      source: projectRulebookCardSource(block.source, assetsById),
      text: block.text,
      quantity: block.quantity,
    };
  }
  if (block.kind === 'card-group') {
    return {
      ...identity,
      kind: block.kind,
      title: block.title,
      text: block.text,
      variant: block.variant,
      featuredItemId: block.featuredItemId,
      items: block.itemOrder.flatMap((id) => {
        const item = block.itemsById[id];
        return item ? [{ ...item, source: projectRulebookCardSource(item.source, assetsById) }] : [];
      }),
    };
  }
  if (block.kind === 'faction-introduction') {
    return { ...identity, kind: block.kind, faction: renderFaction(block.factionId, factionsById), text: block.text };
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
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById = {}
): RulebookRenderPageV1 {
  const layout = getRulebookLayout(page.layoutId);
  const blockOrderByRegion = page.blockOrderByRegion as Record<string, string[]>;
  return {
    id: page.id,
    anchor: page.anchor,
    title: page.title,
    layoutId: page.layoutId,
    ...('showHeading' in page ? { showHeading: page.showHeading } : {}),
    controlValues:
      page.layoutId === 'cover'
        ? {
            cover: {
              artwork: renderAsset(page.controlValues.cover.artworkAssetId, assetsById),
              subtitle: page.controlValues.cover.subtitle,
              supportingText: page.controlValues.cover.supportingText,
            },
          }
        : page.controlValues,
    regions: layout.regions.flatMap((region) =>
      region.kind === 'block'
        ? [
            {
              key: region.key,
              blocks: (blockOrderByRegion[region.key] ?? []).flatMap((blockId) => {
                const block = page.blocksById[blockId];
                return block ? [projectRulebookDraftRenderBlock(block, assetsById, factionsById)] : [];
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
  const path = ['pagesById', pageId, 'blocksById', blockId];
  if (block.kind === 'section-heading' || block.kind === 'referenced-illustration') {
    return [];
  }
  if (block.kind === 'question-answer') {
    return [
      ...formattedTextDiagnostics(block.question, [...path, 'question']),
      ...formattedTextDiagnostics(block.answer, [...path, 'answer']),
    ];
  }
  if (!isRulebookCollectionBlock(block)) {
    return formattedTextDiagnostics(block.text, [...path, 'text']);
  }
  return [
    ...(block.kind === 'illustrated-inventory'
      ? formattedTextDiagnostics(block.introduction, [...path, 'introduction'])
      : []),
    ...(block.kind === 'card-group' ? formattedTextDiagnostics(block.text, [...path, 'text']) : []),
    ...block.itemOrder.flatMap((itemId) => {
      const item = block.itemsById[itemId];
      return item ? formattedTextDiagnostics(item.text, [...path, 'itemsById', itemId, 'text']) : [];
    }),
  ];
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
  assetsById: RulebookResolvedAssetsById,
  settings: RulebookSettings,
  factionsById: RulebookResolvedFactionsById = {}
): Readonly<{
  document: RulebookRenderPreviewDocumentV1;
  diagnostics: readonly RulebookRenderDiagnostic[];
}> {
  return {
    document: {
      schemaVersion: 1,
      settings,
      pageOrder: [...contents.pageOrder],
      pagesById: Object.fromEntries(
        contents.pageOrder.flatMap((pageId) => {
          const page = contents.pagesById[pageId];
          return page ? [[pageId, projectRulebookDraftRenderPage(page, assetsById, factionsById)]] : [];
        })
      ),
    },
    diagnostics: textDiagnostics(contents),
  };
}

/** Projects saved Contents and proves that the result satisfies the publishable renderer contract. */
export function projectRulebookRenderDocument(
  contents: RulebookContentsDraftV1,
  assetsById: RulebookResolvedAssetsById,
  settings: RulebookSettings,
  factionsById: RulebookResolvedFactionsById = {}
): RulebookRenderDocumentV1 {
  return rulebookRenderDocumentV1Schema.parse(
    projectRulebookDraftRenderDocument(contents, assetsById, settings, factionsById).document
  );
}
