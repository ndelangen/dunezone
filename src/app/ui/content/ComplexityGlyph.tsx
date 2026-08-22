import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';

import { complexityOutOfTen, complexityTier } from './complexity';
import type { ComplexityTier } from './complexity';
import styles from './ComplexityGlyph.module.css';

const PROGRESS_RING_SIZE = 34;
const PROGRESS_RING_STROKE = 3;
const PROGRESS_RING_RADIUS = (PROGRESS_RING_SIZE - PROGRESS_RING_STROKE) / 2;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

/** The one place a tier's presentation is defined; every surface reads it from here. */
/** The x/10 slider positions where each tier's glyph marks the track, shared by every slider. */
export function complexityTierSliderMarks(size = 12) {
  return [
    { value: 1, label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.novice.icon} size={size} /> },
    {
      value: 4,
      label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.intermediate.icon} size={size} />,
    },
    { value: 6, label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.expert.icon} size={size} /> },
    { value: 9, label: <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION.master.icon} size={size} /> },
  ];
}

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
  /** The 0..1 rating this glyph represents (already effective, manual or calculated). */
  score: number;
  /** Renders the numeric `n/10` beside the glyph. */
  showValue?: boolean;
  /** Wraps the tier glyph in an animated ring filled to the score. */
  progressRing?: boolean;
  /**
   * Hides the glyph from assistive technology.
   * Use where the surrounding element already names itself (a chapter tab, a labelled row) so the rating doesn't churn its accessible name.
   */
  decorative?: boolean;
  size?: number;
  className?: string;
}

/**
 * The canonical indicator for a complexity rating: the tier's glyph in `currentColor`, optionally with its x/10 value.
 * Owns which tier a score presents as;
 * callers own colour and placement: on a faction card it inherits the caption's white, in a toolbar the toolbar's ink.
 */
export function ComplexityGlyph({
  score,
  showValue = false,
  progressRing = false,
  decorative = false,
  size = 22,
  className,
}: ComplexityGlyphProps) {
  const tier = complexityTier(score);
  const rounded = complexityOutOfTen(score);
  return (
    <span
      className={clsx(styles.root, className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative}
      aria-label={
        decorative ? undefined : `${COMPLEXITY_TIER_PRESENTATION[tier].label} complexity, ${rounded} out of 10`
      }
    >
      {progressRing ? (
        <span className={styles.progressRing}>
          <svg
            width={PROGRESS_RING_SIZE}
            height={PROGRESS_RING_SIZE}
            viewBox={`0 0 ${PROGRESS_RING_SIZE} ${PROGRESS_RING_SIZE}`}
            aria-hidden
            className={styles.progressRingSvg}
          >
            <circle
              cx={PROGRESS_RING_SIZE / 2}
              cy={PROGRESS_RING_SIZE / 2}
              r={PROGRESS_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.18}
              strokeWidth={PROGRESS_RING_STROKE}
            />
            <circle
              className={styles.progressRingFill}
              cx={PROGRESS_RING_SIZE / 2}
              cy={PROGRESS_RING_SIZE / 2}
              r={PROGRESS_RING_RADIUS}
              fill="none"
              strokeWidth={PROGRESS_RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
              strokeDashoffset={PROGRESS_RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, score)))}
            />
          </svg>
          <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION[tier].icon} size={size} />
        </span>
      ) : (
        <TopicIcon topic={COMPLEXITY_TIER_PRESENTATION[tier].icon} size={size} />
      )}
      {showValue ? <span className={styles.value}>{rounded}/10</span> : null}
    </span>
  );
}
