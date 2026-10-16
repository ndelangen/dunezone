import { TINT_STAMP_NAMES } from '@shared/play/territoryTints';
import type { TintStamp } from '@shared/play/territoryTints';

import city from '../../../../media/vector/icon/city.svg?raw';
import herb from '../../../../media/vector/icon/herb.svg?raw';
import landscape from '../../../../media/vector/icon/landscape.svg?raw';
import ornithopter from '../../../../media/vector/icon/ornithopter.svg?raw';
import sietch from '../../../../media/vector/icon/seitch.svg?raw';
import shaiHulud from '../../../../media/vector/icon/shai-hulud.svg?raw';
import spiceMine from '../../../../media/vector/icon/spice-mine.svg?raw';
import spice from '../../../../media/vector/icon/spice.svg?raw';

const ART: Record<TintStamp, string> = {
  sietch,
  landscape,
  city,
  shai_hulud: shaiHulud,
  spice_mine: spiceMine,
  herb,
  ornithopter,
  spice,
};

/** Each sticker's artwork and name, in the order they sit side by side. */
export const TINT_STICKERS = Object.fromEntries(
  Object.entries(ART).map(([stamp, svg]) => [stamp, { label: TINT_STAMP_NAMES[stamp as TintStamp], svg }])
) as Record<TintStamp, { label: string; svg: string }>;
