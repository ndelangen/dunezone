import type { z } from 'zod';

import { CustomCardAsset, TreacheryAsset } from './schema';

/** Converts the treachery face into editable layers while preserving its drawing order and geometry. */
export function treacheryToCustomCard(value: unknown): z.infer<typeof CustomCardAsset> {
  const { decals, text, ...head } = TreacheryAsset.parse(value);
  const ordered = [...decals.filter((decal) => decal.muted), ...decals.filter((decal) => !decal.muted)];
  const layerId = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return CustomCardAsset.parse({
    ...head,
    format: 'decal-window',
    layers: [
      ...ordered.map((decal, index) => ({
        ...decal,
        kind: 'decal',
        layerId: layerId(index),
        offset: [decal.offset[0], decal.offset[1] - 161.5],
        opacity: 1,
        rotation: 0,
        behindFrame: true,
      })),
      {
        kind: 'text',
        layerId: layerId(ordered.length),
        content: text,
        offset: [-361, 72.5],
        width: 734,
        height: 499,
        size: 40,
        font: 'C_Candara',
        color: '#0b0503',
        align: 'left',
        opacity: 0.937,
        rotation: 0,
      },
    ],
  });
}
