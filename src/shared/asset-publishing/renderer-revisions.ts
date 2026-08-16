import { FACTION_SHEET_ASSET_TYPE } from './publication';

/**
 * Increasing a number invalidates every eligible asset of that type. It never selects a historical Renderer
 * implementation.
 */
export const CHECKED_IN_RENDERER_REVISIONS = {
  // 8: vector train (wayfinder #294) — normalized spaces, unclipped halos, retuned decals.
  [FACTION_SHEET_ASSET_TYPE]: 8,
} as const;
