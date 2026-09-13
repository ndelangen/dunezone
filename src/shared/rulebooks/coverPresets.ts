import { z } from 'zod';

/** Cover artwork uses progressive JPEG tiers generated from the original PNGs in media/. */
export const rulebookCoverPresetCatalogue = (
  [
    {
      id: 'stone-circle',
      label: 'Stone circle',
    },
    {
      id: 'worm-cavern',
      label: 'Worm cavern',
    },
    {
      id: 'sandworm',
      label: 'Sandworm',
    },
    {
      id: 'desert-citadel',
      label: 'Desert citadel',
    },
    {
      id: 'ancient-bones',
      label: 'Ancient bones',
    },
    {
      id: 'desert-lookout',
      label: 'Desert lookout',
    },
    {
      id: 'cavern',
      label: 'Cavern',
    },
    {
      id: 'rock-passages',
      label: 'Rock passages',
    },
    {
      id: 'shielded-city',
      label: 'Shielded city',
    },
    {
      id: 'worm-riders',
      label: 'Worm riders',
    },
    {
      id: 'spice-harvester',
      label: 'Spice harvester',
    },
  ] as const
).map((preset) => ({
  ...preset,
  imageUrl: `/image/rulebook-cover/${preset.id}-print.jpg`,
  thumbnailUrl: `/image/rulebook-cover/${preset.id}-small.jpg`,
}));

export const rulebookCoverPresetIdSchema = z.enum(rulebookCoverPresetCatalogue.map(({ id }) => id));

export type RulebookCoverPresetId = z.infer<typeof rulebookCoverPresetIdSchema>;

export function getRulebookCoverPreset(id: RulebookCoverPresetId) {
  return rulebookCoverPresetCatalogue.find((preset) => preset.id === id)!;
}
