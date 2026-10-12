import { z } from 'zod';

import { Background } from '../factions/schema';
import { LEADER_SKILL_HEAD, LEADER_SKILL_SYMBOL } from './gf9LeaderSkills';
import { NEXUS_HEAD } from './nexusTemplate';
import { TreacheryAsset } from './schema';
import { STORM_CARD_HEAD, STORM_CARD_ICON } from './standardStormDeck';
import { STRONGHOLD_BACKGROUND, STRONGHOLD_ICON_BACKGROUND } from './strongholdCardTemplate';
import { TREACHERY_STYLES, treacheryStyle } from './treacheryStyles';

export const cardFrontPresetKeySchema = z.enum([
  'stronghold',
  'storm',
  'nexus',
  'leader-skill',
  'treachery-weapon',
  'treachery-defense',
  'treachery-special',
  'treachery-worthless',
]);
export type CardFrontPresetKey = z.infer<typeof cardFrontPresetKeySchema>;

/* Null preserves a Nexus card's faction background. Every other family has a shared icon background. */
export const cardFrontStyleSchema = z.strictObject({ head: Background, iconBackground: Background.nullable() });
export type CardFrontStyle = z.infer<typeof cardFrontStyleSchema>;
export const cardFrontPresetSchema = z.object({
  key: cardFrontPresetKeySchema,
  label: z.string(),
  style: cardFrontStyleSchema,
  revision: z.number().int().nonnegative(),
});
export type CardFrontPreset = z.infer<typeof cardFrontPresetSchema>;
export const cardFrontSnapshotSchema = cardFrontPresetSchema.pick({ style: true, revision: true });

export const INITIAL_CARD_FRONT_PRESETS: CardFrontPreset[] = [
  {
    key: 'stronghold',
    label: 'Stronghold',
    style: { head: STRONGHOLD_BACKGROUND, iconBackground: STRONGHOLD_ICON_BACKGROUND },
    revision: 0,
  },
  { key: 'storm', label: 'Storm', style: { head: STORM_CARD_HEAD, iconBackground: STORM_CARD_ICON[0] }, revision: 0 },
  { key: 'nexus', label: 'Nexus', style: { head: NEXUS_HEAD, iconBackground: null }, revision: 0 },
  {
    key: 'leader-skill',
    label: 'Leader skill',
    style: { head: LEADER_SKILL_HEAD, iconBackground: LEADER_SKILL_SYMBOL[0] },
    revision: 0,
  },
  ...TREACHERY_STYLES.map(({ key, label, head, striped }) => ({
    key: `treachery-${key}` as CardFrontPresetKey,
    label: `Treachery · ${label}`,
    style: { head, iconBackground: striped },
    revision: 0,
  })),
];

export const CARD_FRONT_PUBLICATION_REVISIONS = {
  'card-stronghold': 4,
  'card-storm': 4,
  'card-nexus': 4,
  'card-leaderability': 4,
  'card-treachery': 6,
} as const;
export const cardFrontAssetTypeSchema = z.enum([
  'card-stronghold',
  'card-storm',
  'card-nexus',
  'card-leaderability',
  'card-treachery',
]);
export type CardFrontAssetType = z.infer<typeof cardFrontAssetTypeSchema>;

export function cardFrontPresetKey(type: string, data: unknown): CardFrontPresetKey | null {
  switch (type) {
    case 'card-stronghold':
      return 'stronghold';
    case 'card-storm':
      return 'storm';
    case 'card-nexus':
      return 'nexus';
    case 'card-leaderability':
      return 'leader-skill';
    case 'card-treachery': {
      const parsed = TreacheryAsset.safeParse(data);
      return parsed.success ? `treachery-${treacheryStyle(parsed.data).key}` : null;
    }
    default:
      return null;
  }
}

export function cardFrontPresetType(key: CardFrontPresetKey): CardFrontAssetType {
  if (key.startsWith('treachery-')) {
    return 'card-treachery';
  }
  if (key === 'leader-skill') {
    return 'card-leaderability';
  }
  return `card-${key}` as CardFrontAssetType;
}

export function cardFrontStyleFor(
  type: string,
  data: unknown,
  presets: readonly CardFrontPreset[]
): CardFrontStyle | undefined {
  const key = cardFrontPresetKey(type, data);
  return presets.find((preset) => preset.key === key)?.style;
}
