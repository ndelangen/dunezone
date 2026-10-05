import { parseFormattedText } from '../formattedText';
import { userImageSourceUrlSchema } from '../user-images/contract';
import type { RulebookBattleSideValue } from './battleStep';
import { getRulebookCoverFooter, getRulebookLayout, isRulebookCollectionBlock } from './contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from './contents';
import { getRulebookCoverPreset } from './coverPresets';
import type { RulebookBoardSceneValue, RulebookPieceMovementValue } from './illustratedScenes';
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
          assetType: asset.type,
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

function projectTroopArtwork(faction: RulebookRenderFactionV1, troopId: string | undefined, face: 'front' | 'back') {
  const artwork =
    faction.status === 'ready' && troopId ? faction.troops?.find((troop) => troop.troopId === troopId) : undefined;
  return artwork && (face === 'front' || artwork.back) ? { artwork } : {};
}

function projectBattleSide(
  { factionId, leader, cards, knownCard, troops, ...value }: RulebookBattleSideValue,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById
) {
  const faction = renderFaction(factionId, factionsById);
  return {
    ...value,
    faction,
    leader: projectRulebookSource(leader, assetsById, factionsById),
    cards: cards.map((card) => projectRulebookCardSource(card, assetsById)),
    ...(knownCard ? { knownCard: projectRulebookCardSource(knownCard, assetsById) } : {}),
    troops: troops.map((troop) => ({ ...troop, ...projectTroopArtwork(faction, troop.troopId, troop.face) })),
  };
}

function projectBoardScene(
  value: RulebookBoardSceneValue,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById
) {
  return {
    boardId: value.boardId,
    caption: value.caption,
    ...(value.viewport ? { viewport: value.viewport } : {}),
    ...(value.storm ? { storm: value.storm } : {}),
    board: projectRulebookSource({ kind: 'board', boardId: value.boardId }, assetsById, factionsById),
    players: value.players.map(({ factionId, ...player }) => ({
      ...player,
      faction: renderFaction(factionId, factionsById),
    })),
    troops: value.troops.map(({ factionId, ...troop }) => {
      const faction = renderFaction(factionId, factionsById);
      return { ...troop, faction, ...projectTroopArtwork(faction, troop.troopId, troop.face) };
    }),
    highlights: value.highlights,
    annotations: value.annotations,
  };
}

function projectMovementGroup(
  group: RulebookPieceMovementValue['left'],
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById
) {
  return {
    label: group.label,
    pieces: group.pieces.map((piece) => {
      if (piece.kind === 'source') {
        return { ...piece, source: projectRulebookSource(piece.source, assetsById, factionsById) };
      }
      const { factionId, ...troop } = piece;
      const faction = renderFaction(factionId, factionsById);
      return { ...troop, faction, ...projectTroopArtwork(faction, troop.troopId, troop.face) };
    }),
  };
}

/** Names an authored destination without copying its label or position into the referring text. */
export function rulebookReferenceTargets(
  contents: RulebookContentsDraftV1,
  assetsById: RulebookResolvedAssetsById = {},
  factionsById: RulebookResolvedFactionsById = {}
) {
  return contents.pageOrder.flatMap((pageId, index) => {
    const page = contents.pagesById[pageId];
    if (!page) {
      return [];
    }
    const pageTarget = { pageId, label: page.title, anchor: page.anchor, pageNumber: index + 1 };
    return [
      pageTarget,
      ...Object.values(page.blocksById).flatMap((block) => {
        if (!block.anchor) {
          return [];
        }
        const source =
          block.kind === 'card-entry' ? projectRulebookSource(block.source, assetsById, factionsById) : undefined;
        const label =
          ('name' in block && block.name) ||
          ('title' in block && block.title) ||
          (source?.status === 'ready' && source.name) ||
          block.anchor;
        return [{ ...pageTarget, blockId: block.id, label, anchor: block.anchor }];
      }),
    ];
  });
}

/** Resolves the labels and page numbers that a text block displays for its authored destinations. */
export function projectRulebookTextReferences(
  references: NonNullable<Extract<RulebookBlockDraft, { kind: 'text' }>['references']>,
  targets: ReturnType<typeof rulebookReferenceTargets>
) {
  return references.map((reference) => {
    const target = targets.find(
      (target) =>
        target.pageId === reference.pageId && ('blockId' in target ? target.blockId : undefined) === reference.blockId
    );
    return target
      ? { label: target.label, anchor: target.anchor, pageNumber: target.pageNumber }
      : { label: 'Reference unavailable' };
  });
}

/** Projects one draft Block to the same render contract used by Pages and publications. */
export function projectRulebookDraftRenderBlock(
  block: RulebookBlockDraft,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById = {},
  contents?: RulebookContentsDraftV1
): RulebookRenderBlockV1 {
  const identity = { id: block.id, ...(block.anchor ? { anchor: block.anchor } : {}) };
  if (block.kind === 'battle-step') {
    return {
      ...block,
      ...identity,
      left: projectBattleSide(block.left, assetsById, factionsById),
      right: projectBattleSide(block.right, assetsById, factionsById),
    };
  }
  if (block.kind === 'board-scene') {
    return { ...identity, kind: block.kind, ...projectBoardScene(block, assetsById, factionsById) };
  }
  if (block.kind === 'piece-movement') {
    const { board, notes, ...value } = block;
    return {
      ...value,
      ...identity,
      left: projectMovementGroup(block.left, assetsById, factionsById),
      right: projectMovementGroup(block.right, assetsById, factionsById),
      ...(board ? { board: projectBoardScene(board, assetsById, factionsById) } : {}),
      ...(notes
        ? {
            notes: notes.map((note) => ({
              ...note,
              source: projectRulebookSource(note.source, assetsById, factionsById),
            })),
          }
        : {}),
    };
  }
  if (block.kind === 'battle-comparison') {
    const projectExample = (example: (typeof block.examples)[number]) => ({
      ...example,
      left: projectBattleSide(example.left, assetsById, factionsById),
      right: projectBattleSide(example.right, assetsById, factionsById),
    });
    return {
      ...identity,
      kind: block.kind,
      examples: [projectExample(block.examples[0]), projectExample(block.examples[1])],
    };
  }
  if (block.kind === 'text') {
    return {
      ...identity,
      kind: block.kind,
      ...(block.name === undefined ? {} : { name: block.name }),
      ...(block.references
        ? {
            references: projectRulebookTextReferences(
              block.references,
              contents ? rulebookReferenceTargets(contents, assetsById, factionsById) : []
            ),
          }
        : {}),
      text: block.text,
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
      size: block.size,
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
      source: projectRulebookSource(block.source, assetsById, factionsById),
      name: block.name,
      size: block.size,
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
  if (block.kind === 'reference-table') {
    const columns = block.columnOrder.flatMap((id) => block.columnsById[id] ?? []);
    return {
      ...identity,
      kind: block.kind,
      columns: columns.map(({ id, label }) => ({ id, label })),
      rows: block.rowOrder.flatMap((rowId) => {
        const row = block.rowsById[rowId];
        return row
          ? [{ id: row.id, cells: columns.map(({ id }) => ({ columnId: id, text: row.cellsByColumnId[id] ?? '' })) }]
          : [];
      }),
      note: block.note,
    };
  }
  if (block.kind === 'credits') {
    return {
      ...identity,
      kind: block.kind,
      groups: block.groupOrder.flatMap((groupId) => {
        const group = block.groupsById[groupId];
        return group
          ? [
              {
                id: group.id,
                heading: group.heading,
                contributors: group.contributorOrder.flatMap((contributorId) => {
                  const contributor = group.contributorsById[contributorId];
                  return contributor
                    ? [
                        {
                          id: contributor.id,
                          name: contributor.name,
                          ...(contributor.role === undefined ? {} : { role: contributor.role }),
                        },
                      ]
                    : [];
                }),
              },
            ]
          : [];
      }),
    };
  }
  return {
    ...identity,
    kind: block.kind,
    faction: renderFaction(block.factionId, factionsById),
    text: block.text,
    flipped: block.flipped,
  };
}

function projectCoverImageUrl(cover: Extract<RulebookPageDraft, { layoutId: 'cover' }>['controlValues']['cover']) {
  if (cover.backgroundSource?.kind === 'preset') {
    return getRulebookCoverPreset(cover.backgroundSource.presetId).imageUrl;
  }
  if (cover.backgroundImageUrl === undefined) {
    return undefined;
  }
  const parsed = userImageSourceUrlSchema.safeParse(cover.backgroundImageUrl);
  if (!parsed.success) {
    return '';
  }
  return cover.backgroundImage?.sourceUrl === parsed.data ? cover.backgroundImage.url : parsed.data;
}

/**
 * Projects one draft Page.
 * The editor measures clipping one Page at a time, so an unchanged Page keeps its projection while its neighbours change.
 */
export function projectRulebookDraftRenderPage(
  page: RulebookPageDraft,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById = {},
  contents?: RulebookContentsDraftV1
): RulebookRenderPageV1 {
  const layout = getRulebookLayout(page.layoutId);
  const footer = page.layoutId === 'cover' ? getRulebookCoverFooter(page.controlValues) : undefined;
  const blockOrderByRegion = page.blockOrderByRegion as Record<string, string[]>;
  return {
    id: page.id,
    anchor: page.anchor,
    title: page.title,
    layoutId: page.layoutId,
    showHeading: page.showHeading,
    headingIcon: page.headingIcon,
    controlValues:
      page.layoutId === 'cover'
        ? {
            cover: {
              artwork: renderAsset(page.controlValues.cover.artworkAssetId, assetsById),
              subtitle: page.controlValues.cover.subtitle,
              supportingText: page.controlValues.cover.supportingText,
              ...(footer?.enabled
                ? {
                    footer: {
                      enabled: true,
                      title: footer.title,
                      label: footer.label,
                      leftFaction: renderFaction(footer.leftFactionId, factionsById),
                      rightFaction: renderFaction(footer.rightFactionId, factionsById),
                    },
                  }
                : {}),
              ...(page.controlValues.cover.backgroundSource?.kind !== 'preset' &&
              page.controlValues.cover.backgroundImage !== undefined
                ? {
                    backgroundImage: {
                      url: page.controlValues.cover.backgroundImage.url,
                      width: page.controlValues.cover.backgroundImage.width,
                      height: page.controlValues.cover.backgroundImage.height,
                    },
                  }
                : {}),
              ...(page.controlValues.cover.backgroundSource?.kind === 'preset' ||
              page.controlValues.cover.backgroundImageUrl !== undefined
                ? { backgroundImageUrl: projectCoverImageUrl(page.controlValues.cover) }
                : {}),
              ...(page.controlValues.cover.showDuneLogo !== undefined
                ? { showDuneLogo: page.controlValues.cover.showDuneLogo }
                : {}),
              ...(page.controlValues.cover.showSubtitle !== undefined
                ? { showSubtitle: page.controlValues.cover.showSubtitle }
                : {}),
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
                return block ? [projectRulebookDraftRenderBlock(block, assetsById, factionsById, contents)] : [];
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
  if (
    block.kind === 'section-heading' ||
    block.kind === 'referenced-illustration' ||
    block.kind === 'credits' ||
    block.kind === 'battle-step' ||
    block.kind === 'board-scene' ||
    block.kind === 'piece-movement' ||
    block.kind === 'battle-comparison'
  ) {
    return [];
  }
  if (block.kind === 'reference-table') {
    return [
      ...formattedTextDiagnostics(block.note, [...path, 'note']),
      ...block.rowOrder.flatMap((rowId) =>
        block.columnOrder.flatMap((columnId) => {
          const cell = block.rowsById[rowId]?.cellsByColumnId[columnId];
          return cell === undefined
            ? []
            : formattedTextDiagnostics(cell, [...path, 'rowsById', rowId, 'cellsByColumnId', columnId]);
        })
      ),
    ];
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
  return Object.entries(page.blocksById).flatMap(([blockId, block]) => blockTextDiagnostics(pageId, blockId, block));
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
          return page ? [[pageId, projectRulebookDraftRenderPage(page, assetsById, factionsById, contents)]] : [];
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
  const { document } = projectRulebookDraftRenderDocument(contents, assetsById, settings, factionsById);
  for (const page of Object.values(document.pagesById)) {
    const source = contents.pagesById[page.id];
    if (
      page.layoutId === 'cover' &&
      page.controlValues.cover.backgroundImageUrl !== undefined &&
      source?.layoutId === 'cover' &&
      source.controlValues.cover.backgroundSource?.kind !== 'preset'
    ) {
      page.controlValues.cover.backgroundImageUrl = page.controlValues.cover.backgroundImage?.url ?? '';
    }
  }
  return rulebookRenderDocumentV1Schema.parse(document);
}
