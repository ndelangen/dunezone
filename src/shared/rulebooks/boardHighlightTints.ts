import type { BoardTint } from '../boards/markup';
import { BOARD_MAX_TINTS } from '../boards/markup';
import type { RulebookBoardSceneValue } from './illustratedScenes';

type Highlight = RulebookBoardSceneValue['highlights'][number];

/* The maintained Arrakis geometry's group parts name territory types; every other part is a territory spelled with hyphens. */
const GROUP_TYPES: Record<string, NonNullable<BoardTint['types']>[number]> = {
  sand: 'sand',
  rock: 'rock',
  strongholds: 'stronghold',
};
const GROUP_TERRITORIES: Record<string, string> = { polar: 'polar_sink' };
/* The sector guides are a part of the maintained artwork, not a territory a tint can cover. */
const NOT_TERRITORIES = new Set(['sectors']);

const DEFAULT_OPACITY = 0.35;

/** A highlight's colour with its see-through amount, as a tint writes it. */
function tintColor(highlight: Highlight) {
  const alpha = Math.round((highlight.opacity ?? DEFAULT_OPACITY) * 255);
  return `${highlight.color.toLowerCase()}${alpha.toString(16).padStart(2, '0')}`;
}

/**
 * A scene's highlights as tints on a saved board, one tint per colour, so moving a scene onto a saved board keeps what it showed.
 * Group parts become territory types, every other part Play's territory ID;
 * colours past the tint limit are left out.
 */
export function boardHighlightTints(highlights: readonly Highlight[]): BoardTint[] {
  const byColor = new Map<string, Highlight[]>();
  for (const highlight of highlights.filter(({ territory }) => !NOT_TERRITORIES.has(territory))) {
    const color = tintColor(highlight);
    byColor.set(color, [...(byColor.get(color) ?? []), highlight]);
  }
  return [...byColor.entries()].slice(0, BOARD_MAX_TINTS).map(([color, group], index) => {
    const types = [...new Set(group.flatMap(({ territory }) => GROUP_TYPES[territory] ?? []))];
    const territories = [
      ...new Set(
        group
          .filter(({ territory }) => !GROUP_TYPES[territory])
          .map(({ territory }) => GROUP_TERRITORIES[territory] ?? territory.replaceAll('-', '_'))
      ),
    ];
    return {
      id: `highlights-${index + 1}`,
      name: byColor.size > 1 ? `Highlights ${index + 1}` : 'Highlights',
      color,
      territories,
      ...(types.length ? { types } : {}),
    };
  });
}
