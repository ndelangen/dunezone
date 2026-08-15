import { complexityOutOfTen, complexityTier } from '@shared/factions/complexity';
import type { ComplexityTier } from '@shared/factions/complexity';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';

/** The one place a tier's presentation is defined; every surface reads it from here. */
export const COMPLEXITY_TIER_PRESENTATION: Record<
  ComplexityTier,
  { label: string; blurb: string; icon: TopicIconTopic }
> = {
  novice: {
    label: 'Novice',
    blurb: 'Light rules — a fine first faction.',
    icon: 'complexityNovice',
  },
  intermediate: {
    label: 'Intermediate',
    blurb: 'A comfortable read with a few twists.',
    icon: 'complexityIntermediate',
  },
  expert: {
    label: 'Expert',
    blurb: 'Dense rules that reward table experience.',
    icon: 'complexityExpert',
  },
  master: {
    label: 'Master',
    blurb: 'A heavy read — for veterans of the sand.',
    icon: 'complexityMaster',
  },
};

export interface ComplexityGlyphProps {
  /** The 0..1 rating this glyph represents (already effective — manual or calculated). */
  score: number;
  /** Renders the numeric `n/10` beside the glyph. */
  showValue?: boolean;
  size?: number;
  className?: string;
}

/**
 * The canonical indicator for a complexity rating: the tier's glyph in `currentColor`, optionally
 * with its x/10 value. Owns which tier a score presents as; callers own colour and placement — on a
 * faction card it inherits the caption's white, in a toolbar the toolbar's ink.
 */
export function ComplexityGlyph({
  score,
  showValue = false,
  size = 22,
  className,
}: ComplexityGlyphProps) {
  const tier = complexityTier(score);
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      aria-label={`${COMPLEXITY_TIER_PRESENTATION[tier].label} complexity, ${complexityOutOfTen(score)} out of 10`}
    >
      <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION[tier].icon} size={size} />
      {showValue ? (
        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{complexityOutOfTen(score)}/10</span>
      ) : null}
    </span>
  );
}
