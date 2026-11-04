import type { SectorLineStyle } from '@shared/boards/geometry';
import { createContext, useContext } from 'react';

/*
 * The storm's 18 sectors drawn on the table's map, so players can tell which sector a territory or troop is in (#2670).
 * Four looks to compare; the one Norbert picks stays and the rest go.
 */
export const SECTOR_LINE_VARIANTS = {
  /** The board editor's own guide: warm brown dashes, as the board's author saw them. */
  guide: { stroke: '#705327', width: 1.1, dash: '5 2', opacity: 0.45 },
  /** The printed board's look: fine black dashes. */
  ink: { stroke: '#000', width: 1.1, dash: '5 2', opacity: 0.55 },
  /** A fine solid line in the rock's dark brown. */
  solid: { stroke: '#67371C', width: 0.8, opacity: 0.7 },
  /** Heavier, longer black dashes that hold up when the camera is far away. */
  bold: { stroke: '#000', width: 1.8, dash: '8 3', opacity: 0.45 },
} as const satisfies Record<string, SectorLineStyle>;
export type SectorLineVariant = keyof typeof SECTOR_LINE_VARIANTS;

const SectorLineVariantContext = createContext<SectorLineVariant>('guide');
export const SectorLineVariantOverride = SectorLineVariantContext.Provider;
export function useSectorLineStyle(): SectorLineStyle {
  return SECTOR_LINE_VARIANTS[useContext(SectorLineVariantContext)];
}
