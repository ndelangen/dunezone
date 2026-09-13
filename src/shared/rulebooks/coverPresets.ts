import { z } from 'zod';

/** Cover artwork uses progressive JPEG tiers generated from the original PNGs in media/. */
export const rulebookCoverPresetCatalogue = [
  {
    id: 'stone-circle',
    label: 'Stone circle',
    imageUrl: '/image/rulebook-cover/stone-circle-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/stone-circle-small.jpg',
  },
  {
    id: 'worm-cavern',
    label: 'Worm cavern',
    imageUrl: '/image/rulebook-cover/worm-cavern-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/worm-cavern-small.jpg',
  },
  {
    id: 'sandworm',
    label: 'Sandworm',
    imageUrl: '/image/rulebook-cover/sandworm-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/sandworm-small.jpg',
  },
  {
    id: 'desert-citadel',
    label: 'Desert citadel',
    imageUrl: '/image/rulebook-cover/desert-citadel-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/desert-citadel-small.jpg',
  },
  {
    id: 'ancient-bones',
    label: 'Ancient bones',
    imageUrl: '/image/rulebook-cover/ancient-bones-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/ancient-bones-small.jpg',
  },
  {
    id: 'desert-lookout',
    label: 'Desert lookout',
    imageUrl: '/image/rulebook-cover/desert-lookout-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/desert-lookout-small.jpg',
  },
  {
    id: 'cavern',
    label: 'Cavern',
    imageUrl: '/image/rulebook-cover/cavern-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/cavern-small.jpg',
  },
  {
    id: 'rock-passages',
    label: 'Rock passages',
    imageUrl: '/image/rulebook-cover/rock-passages-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/rock-passages-small.jpg',
  },
  {
    id: 'shielded-city',
    label: 'Shielded city',
    imageUrl: '/image/rulebook-cover/shielded-city-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/shielded-city-small.jpg',
  },
  {
    id: 'worm-riders',
    label: 'Worm riders',
    imageUrl: '/image/rulebook-cover/worm-riders-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/worm-riders-small.jpg',
  },
  {
    id: 'spice-harvester',
    label: 'Spice harvester',
    imageUrl: '/image/rulebook-cover/spice-harvester-print.jpg',
    thumbnailUrl: '/image/rulebook-cover/spice-harvester-small.jpg',
  },
] as const;

export const rulebookCoverPresetIdSchema = z.enum(rulebookCoverPresetCatalogue.map(({ id }) => id));

export type RulebookCoverPresetId = z.infer<typeof rulebookCoverPresetIdSchema>;

export function getRulebookCoverPreset(id: RulebookCoverPresetId) {
  return rulebookCoverPresetCatalogue.find((preset) => preset.id === id)!;
}
