import { z } from 'zod';

import { HistoricalFactionPublicationSchema } from '../factions/schema';
import { factionMemberPublicationId } from './componentPublication';

export const FACTION_TRAITOR_ASSET_TYPE = 'faction-traitor' as const;
export const FACTION_ALLIANCE_ASSET_TYPE = 'faction-alliance' as const;

const faction = HistoricalFactionPublicationSchema.shape;

/**
 * A traitor card's front names one supporting leader by its identity, `{factionId}.{memberId}`, so renames and reorders keep the URL.
 * Every traitor card shares the admin-authored traitor cardback.
 * Only what the traitor renderer draws belongs in the capture identity, so the owner is the faction's name.
 */
export const factionTraitorAssetDataSchema = z.strictObject({
  name: faction.leaders.element.shape.name,
  strength: faction.leaders.element.shape.strength,
  image: faction.leaders.element.shape.image,
  logo: faction.logo,
  background: faction.background,
  owner: faction.name,
});
export type FactionTraitorAssetData = z.infer<typeof factionTraitorAssetDataSchema>;

/** The alliance card's front publishes under the bare faction id and shares the admin-authored alliance cardback. */
export const factionAllianceAssetDataSchema = z.strictObject({
  title: faction.name,
  text: faction.rules.shape.alliance.shape.text,
  logo: faction.logo,
  background: faction.background,
  troop: faction.troops.element.shape.image,
  decals: faction.decals,
});
export type FactionAllianceAssetData = z.infer<typeof factionAllianceAssetDataSchema>;

/** Every traitor front a faction publishes, one per identified supporting leader, keyed by its publication id. */
export function factionTraitorPublications(factionId: string, data: unknown): Map<string, FactionTraitorAssetData> {
  const parsed = HistoricalFactionPublicationSchema.safeParse(data);
  if (!parsed.success) {
    return new Map();
  }
  const { name: owner, logo, background, leaders } = parsed.data;
  return new Map(
    leaders.flatMap(({ memberId, name, strength, image }) =>
      memberId
        ? [
            [
              factionMemberPublicationId(factionId, memberId),
              factionTraitorAssetDataSchema.parse({ name, strength, image, logo, background, owner }),
            ],
          ]
        : []
    )
  );
}

/** The alliance front a faction publishes, or null when its data does not parse or it has no troop for the card to show. */
export function factionAllianceAssetData(data: unknown): FactionAllianceAssetData | null {
  const parsed = HistoricalFactionPublicationSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }
  const { name, rules, logo, background, troops, decals } = parsed.data;
  if (!troops[0]) {
    return null;
  }
  return factionAllianceAssetDataSchema.parse({
    title: name,
    text: rules.alliance.text,
    logo,
    background,
    troop: troops[0].image,
    decals,
  });
}
