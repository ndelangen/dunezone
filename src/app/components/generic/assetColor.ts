import type { CSSProperties } from 'react';

import { ASSET_MAP } from '../../../game/data/assetMap.generated';

/**
 * Dominant-color underlay for an asset slot (#255): paints roughly-right color behind a lazy image
 * so grids never flash white while tiles arrive.
 */
export function assetColorStyle(key: string): CSSProperties | undefined {
  const color = (ASSET_MAP as Record<string, { color?: string }>)[key]?.color;
  return color ? { backgroundColor: color } : undefined;
}
