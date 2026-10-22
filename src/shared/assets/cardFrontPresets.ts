import { z } from 'zod';

import { stockBackgroundValues } from '../backgrounds/defaults';
import { AuthoredBackground, Background } from '../factions/schema';
import { LEADER_SKILL_HEAD, LEADER_SKILL_SYMBOL } from './gf9LeaderSkills';
import { HOMEWORLD_HEAD, HOMEWORLD_ICON_BACKGROUND } from './homeworldTemplate';
import { NEXUS_HEAD } from './nexusTemplate';
import { TreacheryAsset } from './schema';
import { STORM_CARD_HEAD, STORM_CARD_ICON } from './standardStormDeck';
import { STRONGHOLD_BACKGROUND, STRONGHOLD_ICON_BACKGROUND } from './strongholdCardTemplate';
import { TREACHERY_STYLES, treacheryStyle } from './treacheryStyles';

export const cardFrontPresetKeySchema = z.enum([
  'spice',
  'custom',
  'traitor',
  'alliance',
  'prediction',
  'stronghold',
  'storm',
  'nexus',
  'homeworld',
  'leader-skill',
  'treachery-weapon',
  'treachery-defense',
  'treachery-special',
  'treachery-worthless',
]);
export type CardFrontPresetKey = z.infer<typeof cardFrontPresetKeySchema>;

/* Null preserves a Nexus card's faction background. Every other family has a shared icon background. */
export const cardFrontStyleSchema = z.strictObject({ head: Background, iconBackground: Background.nullable() });
export const authoredCardFrontStyleSchema = z.strictObject({
  head: AuthoredBackground,
  iconBackground: AuthoredBackground.nullable(),
});
export type AuthoredCardFrontStyle = z.infer<typeof authoredCardFrontStyleSchema>;
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
  {
    key: 'homeworld',
    label: 'Homeworld',
    style: { head: HOMEWORLD_HEAD, iconBackground: HOMEWORLD_ICON_BACKGROUND },
    revision: 0,
  },
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
  {
    key: 'spice',
    label: 'Spice',
    style: { head: stockBackgroundValues.spice, iconBackground: stockBackgroundValues.stripedSpice },
    revision: 0,
  },
  {
    key: 'custom',
    label: 'Custom card',
    style: { head: stockBackgroundValues.special, iconBackground: stockBackgroundValues.stripedSpecial },
    revision: 0,
  },
  {
    key: 'traitor',
    label: 'Traitor',
    style: { head: stockBackgroundValues.traitor, iconBackground: stockBackgroundValues.stripedSpecial },
    revision: 0,
  },
  {
    key: 'alliance',
    label: 'Alliance',
    style: { head: stockBackgroundValues.special, iconBackground: stockBackgroundValues.stripedAlliance },
    revision: 0,
  },
  {
    key: 'prediction',
    label: 'Prediction',
    style: { head: stockBackgroundValues.special, iconBackground: stockBackgroundValues.stripedSpecial },
    revision: 0,
  },
];

export const CARD_FRONT_PUBLICATION_REVISIONS = {
  'card-spice': 5,
  'card-custom': 5,
  'faction-traitor': 3,
  'faction-alliance': 3,
  'card-stronghold': 4,
  'card-storm': 4,
  'card-nexus': 4,
  'card-homeworld': 1,
  'card-leaderability': 4,
  'card-treachery': 6,
} as const;
export const cardFrontAssetTypeSchema = z.enum([
  'card-spice',
  'card-custom',
  'faction-traitor',
  'faction-alliance',
  'card-stronghold',
  'card-storm',
  'card-nexus',
  'card-homeworld',
  'card-leaderability',
  'card-treachery',
]);
export type CardFrontAssetType = z.infer<typeof cardFrontAssetTypeSchema>;

export function cardFrontPresetKey(type: string, data: unknown): CardFrontPresetKey | null {
  switch (type) {
    case 'card-spice':
      return 'spice';
    case 'card-custom':
      return 'custom';
    case 'faction-traitor':
      return 'traitor';
    case 'faction-alliance':
      return 'alliance';
    case 'card-stronghold':
      return 'stronghold';
    case 'card-storm':
      return 'storm';
    case 'card-homeworld':
      return 'homeworld';
    case 'card-nexus':
      return 'nexus';
    case 'card-leaderability':
      return 'leader-skill';
    case 'card-treachery': {
      const parsed = TreacheryAsset.safeParse(data);
      if (!parsed.success) {
        return null;
      }
      return /^prediction(?:\s|$)/i.test(parsed.data.subName)
        ? 'prediction'
        : `treachery-${treacheryStyle(parsed.data).key}`;
    }
    default:
      return null;
  }
}

export function cardFrontPresetType(key: CardFrontPresetKey): CardFrontAssetType {
  if (key === 'traitor' || key === 'alliance') {
    return `faction-${key}`;
  }
  if (key === 'prediction') {
    return 'card-treachery';
  }
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
  const style = presets.find((preset) => preset.key === key)?.style;
  if (!style || !data || typeof data !== 'object') {
    return style;
  }
  const card = data as {
    head?: z.infer<typeof AuthoredBackground>;
    icon?: [z.infer<typeof AuthoredBackground>, unknown];
  };
  const ownHeader = card.head?.source;
  const ownIcon = card.icon?.[0]?.source;
  return {
    head:
      card.head && (ownHeader?.kind === 'custom' || ownHeader?.kind === 'preset' || (key === 'custom' && !ownHeader))
        ? card.head
        : style.head,
    iconBackground:
      card.icon?.[0] && (ownIcon?.kind === 'custom' || ownIcon?.kind === 'preset' || (key === 'custom' && !ownIcon))
        ? card.icon[0]
        : style.iconBackground,
  };
}

/** A new card opts into its family's standards; loading an existing card preserves its authored choices. */
export function newCardWithStandards<T>(type: string, card: T): T {
  const parsed = z
    .object({ head: AuthoredBackground, icon: z.tuple([AuthoredBackground, z.unknown()]) })
    .safeParse(card);
  const key = cardFrontPresetKey(type, card);
  if (!key || !parsed.success) {
    return card;
  }
  const { head, icon } = parsed.data;
  return {
    ...card,
    head: { ...head, source: { kind: 'family' } },
    icon: [key === 'nexus' ? icon[0] : { ...icon[0], source: { kind: 'family' } }, icon[1]],
  };
}

export function inheritsCardFrontRegion(type: string, data: unknown, region: 'header' | 'icon'): boolean {
  const parsed = z
    .object({ head: AuthoredBackground.optional(), icon: z.tuple([AuthoredBackground, z.unknown()]).optional() })
    .safeParse(data);
  if (!parsed.success) {
    return false;
  }
  const background = region === 'header' ? parsed.data.head : parsed.data.icon?.[0];
  return background?.source?.kind === 'family' || (!background?.source && type !== 'card-custom');
}
