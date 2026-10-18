import type { z } from 'zod';

import type { Spice } from '../../data/objects';

type SpiceIcon = z.infer<typeof Spice>['icon'];

/** The vector a card's icon draws: a classic card's key names one of the two spice icons, a newer card stores the vector itself. */
export const spiceIconSrc = (icon: SpiceIcon) => (icon.startsWith('/') ? icon : `/vector/icon/${icon}.svg`);

/** The standard sentence a spice card prints, built from its icon, amount and name. */
export function standardSpiceText({ icon, amount, name }: { icon: SpiceIcon; amount: number; name: string }) {
  return spiceIconSrc(icon) === '/vector/icon/spice-mine.svg'
    ? `Place a *spice mine* of ${amount} on\n${name}`
    : `Add *${amount} spice* to\n${name}`;
}
