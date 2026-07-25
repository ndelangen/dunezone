import { FACTION_SHEET_ASSET_TYPE } from './publication';

/**
 * Increasing a number invalidates every eligible asset of that type.
 * It never selects a historical Renderer implementation.
 */
export const CHECKED_IN_RENDERER_REVISIONS = {
  [FACTION_SHEET_ASSET_TYPE]: 5,
} as const;
