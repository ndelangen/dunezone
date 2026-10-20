import { z } from 'zod';

import { isPublicationAssetType, resolvePublicationCapture } from '../asset-publishing/publicationTargets';
import { compareCodeUnits } from '../compareText';
import { CanonicalFactionStoredObject, TroopArtwork } from '../factions/schema';
import type { RulebookBattleSideValue } from './battleStep';
import { resolveRulebookBoardDefinition } from './boardDefinitions';
import { getRulebookCoverFooter } from './contents';
import type { RulebookContentsDraftV1 } from './contents';
import type { RulebookBoardSceneValue } from './illustratedScenes';
import { rulebookResolvedSourceSchema, resolveRulebookArtworkSource } from './sources';
import type { RulebookResolvedAssetsById, RulebookSourceReference } from './sources';

export const rulebookResolvedFactionSchema = z.strictObject({
  factionId: z.string(),
  name: z.string(),
  color: z.string(),
  emblemUrl: z.string().optional(),
  tokenImageUrl: z.string().optional(),
  token: CanonicalFactionStoredObject.pick({ logo: true, background: true }).optional(),
  troops: z.array(TroopArtwork).optional(),
  troopSources: z.array(rulebookResolvedSourceSchema).optional(),
  ruler: rulebookResolvedSourceSchema.optional(),
  leaders: z.array(rulebookResolvedSourceSchema).optional(),
});
export const rulebookResolvedFactionsByIdSchema = z.record(z.string(), rulebookResolvedFactionSchema);
export type RulebookResolvedFactionsById = Readonly<
  Record<string, Readonly<z.infer<typeof rulebookResolvedFactionSchema>>>
>;

type TroopSelection = { factionId?: string; troopId?: string; face: 'front' | 'back' };
type RulebookReferenceUse =
  | {
      kind: 'source';
      path: string;
      source: RulebookSourceReference;
      assetTypes?: readonly string[];
      markupBoard?: boolean;
    }
  | { kind: 'troop'; path: string; factionPath: string; selection: TroopSelection };

/** Typed reference slots, shared by resolution and strict raw authoring checks. */
function rulebookReferenceUses(contents: RulebookContentsDraftV1): RulebookReferenceUse[] {
  const uses: RulebookReferenceUse[] = [];
  const source = (value: RulebookSourceReference | undefined, path: string, assetTypes?: readonly string[]) => {
    if (value) {
      uses.push({ kind: 'source', source: value, path, ...(assetTypes ? { assetTypes } : {}) });
    }
  };
  const faction = (factionId: string | undefined, path: string) => {
    if (factionId) {
      source({ kind: 'faction', factionId }, path);
    }
  };
  const troop = (selection: TroopSelection, path: string, factionPath = `${path}.factionId`) => {
    uses.push({ kind: 'troop', selection, path, factionPath });
  };
  const battleSide = (side: RulebookBattleSideValue, path: string) => {
    faction(side.factionId, `${path}.factionId`);
    source(side.leader, `${path}.leader`);
    source(side.knownCard, `${path}.knownCard`, ['card-treachery']);
    side.cards.forEach((card, index) => source(card, `${path}.cards.${index}`, ['card-treachery']));
    side.troops.forEach((selection, index) =>
      troop({ ...selection, factionId: side.factionId }, `${path}.troops.${index}`, `${path}.factionId`)
    );
  };
  const board = (value: RulebookBoardSceneValue, path: string) => {
    uses.push({
      kind: 'source',
      path: `${path}.boardId`,
      source: { kind: 'board', boardId: value.boardId },
      markupBoard: Boolean(value.tints?.length),
    });
    value.tokens?.forEach((token, index) =>
      source({ kind: 'asset', assetId: token.asset_id }, `${path}.tokens.${index}.asset_id`, [
        'token-disc',
        'token-tech',
        'token-plate',
        'token-pointer',
        'token-enhance',
      ])
    );
    value.players.forEach((player, index) => faction(player.factionId, `${path}.players.${index}.factionId`));
    value.troops.forEach((selection, index) => troop(selection, `${path}.troops.${index}`));
  };
  for (const [pageId, page] of Object.entries(contents.pagesById)) {
    const path = `$.contents.pagesById.${pageId}`;
    const footer = page.layoutId === 'cover' ? getRulebookCoverFooter(page.controlValues) : undefined;
    if (footer?.enabled) {
      faction(footer.leftFactionId, `${path}.controlValues.footer.leftFactionId`);
      faction(footer.rightFactionId, `${path}.controlValues.footer.rightFactionId`);
    }
    if (page.layoutId === 'cover' && page.controlValues.cover.artworkAssetId) {
      source(
        { kind: 'asset', assetId: page.controlValues.cover.artworkAssetId },
        `${path}.controlValues.cover.artworkAssetId`
      );
    }
    for (const [blockId, block] of Object.entries(page.blocksById)) {
      const at = `${path}.blocksById.${blockId}`;
      if ((block.kind === 'section-heading' || block.kind === 'faction-introduction') && block.factionId) {
        faction(block.factionId, `${at}.factionId`);
      }
      if (block.kind === 'referenced-illustration' || block.kind === 'card-entry' || block.kind === 'asset-explainer') {
        source(block.source, `${at}.source`);
      }
      if (block.kind === 'battle-step' || block.kind === 'battle-plans') {
        battleSide(block.left, `${at}.left`);
        battleSide(block.right, `${at}.right`);
      }
      if (block.kind === 'battle-comparison') {
        block.examples.forEach((example, index) => {
          battleSide(example.left, `${at}.examples.${index}.left`);
          battleSide(example.right, `${at}.examples.${index}.right`);
        });
      }
      if (block.kind === 'board-scene') {
        board(block, at);
      }
      if (block.kind === 'piece-movement' || block.kind === 'piece-transfer') {
        for (const side of ['left', 'right'] as const) {
          block[side].pieces.forEach((piece, index) => {
            const position = `${at}.${side}.pieces.${index}`;
            if (piece.kind === 'source') {
              source(piece.source, `${position}.source`);
            } else {
              troop(piece, position);
            }
          });
        }
      }
      if (block.kind === 'piece-movement') {
        block.notes?.forEach((note, index) => source(note.source, `${at}.notes.${index}.source`));
        if (block.board) {
          board(block.board, `${at}.board`);
        }
      }
      if (block.kind === 'illustrated-inventory' || block.kind === 'card-group') {
        for (const [itemId, item] of Object.entries(block.itemsById)) {
          source(
            item.source,
            `${at}.itemsById.${itemId}.source`,
            block.kind === 'card-group' ? ['card-treachery'] : undefined
          );
        }
      }
    }
  }
  return uses;
}

/** Collects selected live sources once, including unsaved picks, in a stable order for query inputs. */
export function collectRulebookReferenceIds(
  contents: RulebookContentsDraftV1,
  requested: { assetIds?: readonly string[]; factionIds?: readonly string[] } = {}
) {
  const assetIds = new Set(requested.assetIds);
  const factionIds = new Set(requested.factionIds);
  const troopSources = new Map<string, Extract<RulebookSourceReference, { kind: 'faction-troop' }>>();
  const markupBoardIds = new Set<string>();
  for (const use of rulebookReferenceUses(contents)) {
    if (use.kind === 'troop') {
      if (use.selection.factionId) {
        factionIds.add(use.selection.factionId);
      }
      continue;
    }
    const source = use.source;
    if (source.kind === 'asset') {
      assetIds.add(source.assetId);
    }
    if (source.kind === 'board') {
      if (!resolveRulebookBoardDefinition(source.boardId)) {
        assetIds.add(source.boardId);
      }
      if (use.markupBoard) {
        markupBoardIds.add(source.boardId);
      }
    }
    if (source.kind === 'faction-troop') {
      troopSources.set(`${source.factionId}.${source.troopId}.${source.face}`, source);
    }
    if (source.kind === 'faction' || source.kind === 'faction-member' || source.kind === 'faction-troop') {
      factionIds.add(source.factionId);
    }
  }
  return {
    assetIds: [...assetIds].sort(compareCodeUnits),
    factionIds: [...factionIds].sort(compareCodeUnits),
    ...(troopSources.size ? { troopSources: [...troopSources.values()] } : {}),
    ...(markupBoardIds.size ? { markupBoardIds: [...markupBoardIds].sort(compareCodeUnits) } : {}),
  };
}

/** Checks selected identities and faces against the editor's existing reference read. */
export function assertRulebookReferences(
  contents: RulebookContentsDraftV1,
  assetsById: RulebookResolvedAssetsById,
  factionsById: RulebookResolvedFactionsById
) {
  const faction = (id: string, path: string) => {
    const value = Object.hasOwn(factionsById, id) ? factionsById[id] : undefined;
    if (!value) {
      throw new Error(`${path}: Choose an available faction.`);
    }
    return value;
  };
  const troop = (selection: TroopSelection, path: string, factionPath: string) => {
    if (!selection.factionId) {
      if (selection.troopId) {
        throw new Error(`${factionPath}: Choose the faction this troop belongs to.`);
      }
      return;
    }
    const data = faction(selection.factionId, factionPath);
    if (!selection.troopId) {
      return;
    }
    const selected = data.troops?.find(({ troopId }) => troopId === selection.troopId);
    if (!selected) {
      throw new Error(`${path}.troopId: This faction troop is unavailable.`);
    }
    if (selection.face === 'back' && !selected.back) {
      throw new Error(`${path}.face: This troop has no back face.`);
    }
  };
  const asset = (id: string, path: string, types?: readonly string[]) => {
    const value = Object.hasOwn(assetsById, id) ? assetsById[id] : undefined;
    const image =
      value && isPublicationAssetType(value.type) && resolvePublicationCapture(value.type).output === 'image';
    if (!value || (types ? !types.includes(value.type) : !image)) {
      throw new Error(`${path}: Choose an available ${types?.join(' or ') ?? 'image asset'}.`);
    }
  };
  for (const use of rulebookReferenceUses(contents)) {
    if (use.kind === 'troop') {
      troop(use.selection, use.path, use.factionPath);
      continue;
    }
    const { source, path } = use;
    switch (source.kind) {
      case 'asset':
        asset(source.assetId, path, use.assetTypes);
        break;
      case 'board':
        if (!resolveRulebookBoardDefinition(source.boardId)) {
          asset(source.boardId, path, ['board']);
        }
        break;
      case 'stock':
        if (resolveRulebookArtworkSource(source)?.status !== 'ready') {
          throw new Error(`${path}.artworkId: Maintained artwork is unavailable.`);
        }
        break;
      case 'faction-troop':
        troop(source, path, `${path}.factionId`);
        break;
      case 'faction-member': {
        const data = faction(source.factionId, `${path}.factionId`);
        if (
          ![data.ruler, ...(data.leaders ?? [])].some(
            (member) =>
              member &&
              member.status !== 'unselected' &&
              member.reference.kind === 'faction-member' &&
              member.reference.memberId === source.memberId
          )
        ) {
          throw new Error(`${path}.memberId: This faction member is unavailable.`);
        }
        break;
      }
      case 'faction':
        faction(source.factionId, path);
    }
  }
}
