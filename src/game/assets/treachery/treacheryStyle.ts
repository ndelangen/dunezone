import type { Treachery } from '@shared/assets/schema';
import type { z } from 'zod';

import { backgroundPresets } from '../../data/backgrounds';

export const TREACHERY_STYLES = [
  { key: 'weapon', label: 'Weapon', head: backgroundPresets.weapon, striped: backgroundPresets.stripedWeapon },
  { key: 'defense', label: 'Defense', head: backgroundPresets.defense, striped: backgroundPresets.stripedDefense },
  { key: 'special', label: 'Special', head: backgroundPresets.special, striped: backgroundPresets.stripedSpecial },
  {
    key: 'worthless',
    label: 'Worthless',
    head: backgroundPresets.worthless,
    striped: backgroundPresets.stripedWorthless,
  },
] as const;

/* Saved custom textures keep their category colours; older custom colours fall back to the printed type. */
export function treacheryStyle(card: Pick<z.infer<typeof Treachery>, 'head' | 'subName'>) {
  return (
    TREACHERY_STYLES.find((style) => JSON.stringify(style.head.colors) === JSON.stringify(card.head.colors)) ??
    TREACHERY_STYLES.find((style) => card.subName.toLowerCase().startsWith(style.key)) ??
    TREACHERY_STYLES[0]
  );
}
