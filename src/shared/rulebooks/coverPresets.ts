import { z } from 'zod';

/** Cover artwork uses progressive JPEG tiers generated from the original PNGs in media/. */
export const rulebookCoverPresetCatalogue = (
  [
    ['stone-circle', 'Stone circle'],
    ['worm-cavern', 'Worm cavern'],
    ['sandworm', 'Sandworm'],
    ['sandworm-riding', 'Sandworm riding'],
    ['warm-sand-desert', 'Warm sand desert'],
    ['military-assembly', 'Military assembly'],
    ['dreamrules-rainbow', 'Dreamrules rainbow'],
    ['kiss-planet', 'KISS planet'],
    ['desert-citadel', 'Desert citadel'],
    ['ancient-bones', 'Ancient bones'],
    ['desert-lookout', 'Desert lookout'],
    ['cavern', 'Cavern'],
    ['rock-passages', 'Rock passages'],
    ['shielded-city', 'Shielded city'],
    ['worm-riders', 'Worm riders'],
    ['spice-harvester', 'Spice harvester'],
  ] as const
).map(([id, label]) => ({
  id,
  label,
  imageUrl: `/image/rulebook-cover/${id}-print.jpg`,
  thumbnailUrl: `/image/rulebook-cover/${id}-small.jpg`,
}));

export const rulebookCoverPresetIdSchema = z.enum(rulebookCoverPresetCatalogue.map(({ id }) => id));

export type RulebookCoverPresetId = z.infer<typeof rulebookCoverPresetIdSchema>;

export function getRulebookCoverPreset(id: RulebookCoverPresetId) {
  return rulebookCoverPresetCatalogue.find((preset) => preset.id === id)!;
}
