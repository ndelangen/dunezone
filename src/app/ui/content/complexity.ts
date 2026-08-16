import { calculateComplexity } from '@shared/factions/complexity';
import type { FactionInput } from '@shared/factions/schema';

export {
  COMPLEXITY_CAPACITY_WORDS,
  calculateComplexity,
  effectiveComplexity,
} from '@shared/factions/complexity';

type FactionRules = FactionInput['rules'];

/**
 * How hard a faction is to play, as a 0..1 score derived from the amount of rules text the printed
 * sheet must carry. Calibrated against the live corpus (see wayfinder #405): the grace floor keeps
 * near-empty drafts at 0, the capacity anchor marks the word count at which text stops fitting the
 * sheet, and adjustments capture complexity that word count alone misses. The optional stored
 * manual rating wins over the stored calculated rating on reader-facing surfaces.
 */

/** A manual rating this far from the calculation earns the editor's deviation advisory. */
const COMPLEXITY_DEVIATION_THRESHOLD_POINTS = 3;

/** A calculated score at or above this earns the editor's near-capacity advisory. */
const COMPLEXITY_NEAR_CAPACITY = 0.9;

export type ComplexityTier = 'novice' | 'intermediate' | 'expert' | 'master';

/** Band edges over the 0..1 score; a score at an edge belongs to the band above it. */
const COMPLEXITY_TIER_EDGES: { edge: number; tier: ComplexityTier }[] = [
  { edge: 0.25, tier: 'novice' },
  { edge: 0.5, tier: 'intermediate' },
  { edge: 0.75, tier: 'expert' },
];

export function complexityTier(score: number): ComplexityTier {
  const hit = COMPLEXITY_TIER_EDGES.find(({ edge }) => score < edge);
  return hit ? hit.tier : 'master';
}

/** The display form: 0..1 rounded onto the x/10 scale. */
export function complexityOutOfTen(score: number): number {
  return Math.round(score * 10);
}

/** Whether the displayed manual and calculated ratings differ enough to warrant an advisory. */
export function hasAdvisableComplexityDeviation(manual: number, calculated: number): boolean {
  return (
    Math.abs(complexityOutOfTen(manual) - complexityOutOfTen(calculated)) >=
    COMPLEXITY_DEVIATION_THRESHOLD_POINTS
  );
}

/** The shared editor projection behind the chapter and toolbar indicator. */
export function complexityEditorPresentation(rules: FactionRules, manual: number | undefined) {
  const calculated = calculateComplexity(rules);
  return {
    calculated,
    calculatedOutOfTen: complexityOutOfTen(calculated),
    tier: complexityTier(calculated),
    deviates: manual != null && hasAdvisableComplexityDeviation(manual, calculated),
    nearCapacity: calculated >= COMPLEXITY_NEAR_CAPACITY,
  };
}
