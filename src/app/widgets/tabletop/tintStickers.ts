import { TINT_STAMP_NAMES } from '@shared/play/territoryTints';
import type { TintStamp } from '@shared/play/territoryTints';

import explode from '../../../../media/vector/decal/atomics.svg?raw';
import city from '../../../../media/vector/icon/city.svg?raw';
import herb from '../../../../media/vector/icon/herb.svg?raw';
import landscape from '../../../../media/vector/icon/landscape.svg?raw';
import ornithopter from '../../../../media/vector/icon/ornithopter.svg?raw';
import sietch from '../../../../media/vector/icon/seitch.svg?raw';
import shaiHulud from '../../../../media/vector/icon/shai-hulud.svg?raw';
import spiceMine from '../../../../media/vector/icon/spice-mine.svg?raw';
import spice from '../../../../media/vector/icon/spice.svg?raw';

/* media/vector/decal/block.svg with its two clip paths worked into the shapes: the board's SVG loader ignores clipping, and the picker draws it the same either way. */
const block =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 103">' +
  '<path d="M0.203 47A50 50 0 0 1 99.797 47L90.752 47A41 41 0 0 0 9.248 47Z"/>' +
  '<path d="M99.797 56A50 50 0 0 1 0.203 56L9.248 56A41 41 0 0 0 90.752 56Z"/>' +
  '<path d="M19.328 47A31 31 0 0 1 80.672 47L71.535 47A22 22 0 0 0 28.465 47Z"/>' +
  '<path d="M80.672 56A31 31 0 0 1 19.328 56L28.465 56A22 22 0 0 0 71.535 56Z"/>' +
  '<path d="M0.203 47A50 50 0 0 1 1.857 38L98.143 38A50 50 0 0 1 99.797 47Z"/>' +
  '<path d="M1.857 65A50 50 0 0 1 0.203 56L99.797 56A50 50 0 0 1 98.143 65Z"/>' +
  '</svg>';

const ART: Record<TintStamp, string> = {
  sietch,
  landscape,
  city,
  shai_hulud: shaiHulud,
  spice_mine: spiceMine,
  herb,
  ornithopter,
  spice,
  explode,
  block,
};

/** Each sticker's artwork and name, in the order they sit side by side. */
export const TINT_STICKERS = Object.fromEntries(
  Object.entries(ART).map(([stamp, svg]) => [stamp, { label: TINT_STAMP_NAMES[stamp as TintStamp], svg }])
) as Record<TintStamp, { label: string; svg: string }>;
