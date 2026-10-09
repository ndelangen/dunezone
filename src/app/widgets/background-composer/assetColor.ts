import { MEDIA_MAP } from '@shared/media/map.generated';
import type { CSSProperties } from 'react';

/**
 * Dominant-color underlay for an asset slot (#255): paints roughly-right color behind a lazy image so grids never flash white while tiles arrive.
 */
export function assetColorStyle(key: string): CSSProperties | undefined {
  const color = MEDIA_MAP[key]?.[1];
  return color ? { backgroundColor: color } : undefined;
}
