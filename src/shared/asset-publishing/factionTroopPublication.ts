import { z } from 'zod';

import {
  HistoricalFactionPublicationObject,
  HistoricalFactionPublicationSchema,
  TroopArtwork,
} from '../factions/schema';
import { FactionTroopIdSchema } from '../factions/troopIdentity';
import { factionIdSchema } from './componentPublication';

export const FACTION_TROOP_ASSET_TYPE = 'faction-troop' as const;

/**
 * A troop face URL names one troop type of one faction by its identity (#1227), so renames and reorders keep the URL.
 * The authored back publishes under `{factionId}.{troopId}.back`;
 * a troop without one shows its front on both sides.
 */
const factionTroopPublicationIdentitySchema = z.strictObject({
  factionId: factionIdSchema,
  troopId: FactionTroopIdSchema,
});

export function factionTroopPublicationId(factionId: string, troopId: string): string {
  const identity = factionTroopPublicationIdentitySchema.parse({ factionId, troopId });
  return `${identity.factionId}.${identity.troopId}`;
}

/** Reverses `factionTroopPublicationId`, with or without the `.back` face. */
export function parseFactionTroopPublicationId(value: string) {
  const [, factionId, troopId, back] = /^([^.]+)\.([^.]+)(\.back)?$/.exec(value) ?? [];
  const result = factionTroopPublicationIdentitySchema.safeParse({ factionId, troopId });
  return result.success ? { ...result.data, face: back ? ('back' as const) : null } : null;
}

/** Only what the troop renderer draws belongs in the capture identity: one side's artwork on the faction background. */
export const factionTroopAssetDataSchema = z.strictObject({
  image: TroopArtwork.shape.image,
  star: TroopArtwork.shape.star,
  hue: TroopArtwork.shape.hue,
  striped: TroopArtwork.shape.striped,
  background: HistoricalFactionPublicationObject.shape.background,
});
export type FactionTroopAssetData = z.infer<typeof factionTroopAssetDataSchema>;

/** Each identified troop's faces as the renderer draws them; the back is present only when the troop authors one. */
function factionTroopFaces(data: unknown) {
  const faction = HistoricalFactionPublicationSchema.safeParse(data);
  if (!faction.success) {
    return [];
  }
  const { background } = faction.data;
  const face = (side: { image: string; star?: string; hue?: string; striped?: boolean }): FactionTroopAssetData =>
    factionTroopAssetDataSchema.parse({
      image: side.image,
      star: side.star,
      hue: side.hue,
      striped: side.striped,
      background,
    });
  return faction.data.troops.flatMap((troop) =>
    troop.troopId ? [{ troopId: troop.troopId, front: face(troop), back: troop.back ? face(troop.back) : null }] : []
  );
}

/** Every face a faction's troops publish, keyed by the publication id each lives under. */
export function factionTroopPublications(factionId: string, data: unknown): Map<string, FactionTroopAssetData> {
  return new Map(
    factionTroopFaces(data).flatMap(({ troopId, front, back }) => {
      const id = factionTroopPublicationId(factionId, troopId);
      return back
        ? [
            [id, front],
            [`${id}.back`, back],
          ]
        : [[id, front]];
    })
  );
}
