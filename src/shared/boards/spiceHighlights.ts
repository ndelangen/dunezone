import type { z } from 'zod';

import { SPICE_TERRITORY_TYPES } from '../assets/schema';
import type { Spice, SpiceTint } from '../assets/schema';

type LegacyHighlight = z.infer<typeof Spice>['highlights'][number];

/* The legacy regions name territory types; every other highlight is a territory slug spelled with hyphens. */
const LEGACY_REGIONS: Partial<Record<LegacyHighlight, (typeof SPICE_TERRITORY_TYPES)[number]>> = {
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
export function legacyHighlightTint(
  highlights: readonly LegacyHighlight[],
  name: string
): z.infer<typeof SpiceTint> | null {
  if (!highlights.length) {
    return null;
  }
  const types = SPICE_TERRITORY_TYPES.filter((type) =>
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
