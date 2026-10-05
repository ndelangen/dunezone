import { z } from 'zod';

import { CanonicalFactionStoredObject, TroopArtwork } from '../factions/schema';
import type { RulebookBattleSideValue } from './battleStep';
import { getRulebookCoverFooter } from './contents';
import type { RulebookContentsDraftV1 } from './contents';
import type { RulebookBoardSceneValue } from './illustratedScenes';
import { rulebookResolvedSourceSchema } from './sources';
import type { RulebookSourceReference } from './sources';

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

/** Collects selected live sources once, including unsaved picks, in a stable order for query inputs. */
export function collectRulebookReferenceIds(
  contents: RulebookContentsDraftV1,
  requested: { assetIds?: readonly string[]; factionIds?: readonly string[] } = {}
) {
  const assetIds = new Set(requested.assetIds);
  const factionIds = new Set(requested.factionIds);
  const troopSources = new Map<string, Extract<RulebookSourceReference, { kind: 'faction-troop' }>>();
  const collectSource = (source: RulebookSourceReference | undefined) => {
    if (source?.kind === 'faction-troop') {
      troopSources.set(`${source.factionId}.${source.troopId}.${source.face}`, source);
    }
    if (source?.kind === 'asset') {
      assetIds.add(source.assetId);
    }
    if (source?.kind === 'faction' || source?.kind === 'faction-member' || source?.kind === 'faction-troop') {
      factionIds.add(source.factionId);
    }
  };
  const collectBattleSide = (side: RulebookBattleSideValue) => {
    if (side.factionId) {
      factionIds.add(side.factionId);
    }
    collectSource(side.leader);
    collectSource(side.knownCard);
    for (const card of side.cards) {
      collectSource(card);
    }
  };
  const collectBoard = (board: RulebookBoardSceneValue) => {
    for (const item of [...board.players, ...board.troops]) {
      if (item.factionId) {
        factionIds.add(item.factionId);
      }
    }
  };
  for (const page of Object.values(contents.pagesById)) {
    const footer = page.layoutId === 'cover' ? getRulebookCoverFooter(page.controlValues) : undefined;
    if (footer?.enabled) {
      const { leftFactionId, rightFactionId } = footer;
      if (leftFactionId) {
        factionIds.add(leftFactionId);
      }
      if (rightFactionId) {
        factionIds.add(rightFactionId);
      }
    }
    if (page.layoutId === 'cover' && page.controlValues.cover.artworkAssetId) {
      assetIds.add(page.controlValues.cover.artworkAssetId);
    }
    for (const block of Object.values(page.blocksById)) {
      if ((block.kind === 'section-heading' || block.kind === 'faction-introduction') && block.factionId) {
        factionIds.add(block.factionId);
      }
      if (block.kind === 'referenced-illustration' || block.kind === 'card-entry' || block.kind === 'asset-explainer') {
        collectSource(block.source);
      }
      if (block.kind === 'battle-step' || block.kind === 'battle-plans') {
        collectBattleSide(block.left);
        collectBattleSide(block.right);
      }
      if (block.kind === 'battle-comparison') {
        for (const example of block.examples) {
          collectBattleSide(example.left);
          collectBattleSide(example.right);
        }
      }
      if (block.kind === 'board-scene') {
        collectBoard(block);
      }
      if (block.kind === 'piece-movement') {
        for (const group of [block.left, block.right]) {
          for (const piece of group.pieces) {
            if (piece.kind === 'source') {
              collectSource(piece.source);
            } else if (piece.factionId) {
              factionIds.add(piece.factionId);
            }
          }
        }
        for (const note of block.notes ?? []) {
          collectSource(note.source);
        }
        if (block.board) {
          collectBoard(block.board);
        }
      }
      if (block.kind === 'illustrated-inventory' || block.kind === 'card-group') {
        for (const item of Object.values(block.itemsById)) {
          collectSource(item.source);
        }
      }
    }
  }
  return {
    assetIds: [...assetIds].sort(),
    factionIds: [...factionIds].sort(),
    ...(troopSources.size ? { troopSources: [...troopSources.values()] } : {}),
  };
}
