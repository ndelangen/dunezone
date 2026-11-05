import type { z } from 'zod';

import type { Spice } from '../assets/schema';
import { BOARD_TERRITORY_TYPES } from './markup';
import type { BoardTint } from './markup';

type LegacyHighlight = NonNullable<z.infer<typeof Spice>['highlights']>[number];

/* The legacy regions name territory types; every other highlight is a territory slug spelled with hyphens. */
const LEGACY_REGIONS: Partial<Record<LegacyHighlight, (typeof BOARD_TERRITORY_TYPES)[number]>> = {
  sand: 'sand',
  rock: 'rock',
  strongholds: 'stronghold',
};
const LEGACY_TERRITORIES: Partial<Record<LegacyHighlight, string>> = { polar: 'polar_sink' };

/** The colour the legacy Arrakis map highlights with, as a tint keeps it. */
const LEGACY_HIGHLIGHT_COLOR = '#9e5f00';

/**
 * A legacy card's highlights as one tint on a saved board: its regions become territory types, its territories Play's territory IDs.
 * A card without highlights has nothing to carry over.
 */
export function legacyHighlightTint(highlights: readonly LegacyHighlight[], name: string): BoardTint | null {
  if (!highlights.length) {
    return null;
  }
  const types = BOARD_TERRITORY_TYPES.filter((type) =>
    highlights.some((highlight) => LEGACY_REGIONS[highlight] === type)
  );
  const territories = highlights
    .filter((highlight) => !LEGACY_REGIONS[highlight])
    .map((highlight) => LEGACY_TERRITORIES[highlight] ?? highlight.replaceAll('-', '_'));
  return {
    id: 'highlights',
    name: name.trim().slice(0, 48) || 'Highlights',
    color: LEGACY_HIGHLIGHT_COLOR,
    territories,
    ...(types.length ? { types } : {}),
  };
}

/** Stored card data without its `highlights` key; every other key is kept exactly as stored. */
export function withoutHighlights(data: Record<string, unknown>): Record<string, unknown> {
  const { highlights: _highlights, ...rest } = data;
  return rest;
}
