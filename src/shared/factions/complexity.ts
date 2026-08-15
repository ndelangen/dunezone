import type { FactionInput } from './schema';

type FactionRules = FactionInput['rules'];

/**
 * How hard a faction is to play, as a 0..1 score derived from the amount of rules text the printed
 * sheet must carry. Calibrated against the live corpus (see wayfinder #405): the grace floor keeps
 * near-empty drafts at 0, the capacity anchor marks the word count at which text stops fitting the
 * sheet, and adjustments capture complexity that word count alone misses. The author's manual
 * `complexity` field, when present, always wins over the calculation.
 */

/** Below this many words the score stays 0 — every faction needs some baseline text. */
export const COMPLEXITY_GRACE_FLOOR_WORDS = 80;

/** At this many words the base score reaches 1.0 — roughly the printed sheet's capacity. */
export const COMPLEXITY_CAPACITY_WORDS = 700;

/** Advantages beyond this count each add {@link COMPLEXITY_MANY_ADVANTAGES_STEP} to the score. */
export const COMPLEXITY_MANY_ADVANTAGES_THRESHOLD = 8;
export const COMPLEXITY_MANY_ADVANTAGES_STEP = 0.03;

/** A manual rating this far from the calculation earns the editor's deviation advisory. */
export const COMPLEXITY_DEVIATION_THRESHOLD = 0.3;

/** A calculated score at or above this earns the editor's near-capacity advisory. */
export const COMPLEXITY_NEAR_CAPACITY = 0.9;

/**
 * A tuning rule applied after the base curve; the sum is clamped to 0..1. Adding one is a single
 * entry here plus a test.
 */
type ComplexityAdjustment = {
  id: string;
  apply: (rules: FactionRules) => number;
};

const COMPLEXITY_ADJUSTMENTS: ComplexityAdjustment[] = [
  {
    /* Many separate rules cost table overhead and sheet headers beyond their words. */
    id: 'many-advantages',
    apply: (rules) =>
      Math.max(0, rules.advantages.length - COMPLEXITY_MANY_ADVANTAGES_THRESHOLD) *
      COMPLEXITY_MANY_ADVANTAGES_STEP,
  },
];

function words(text: string | undefined): number {
  if (!text) {
    return 0;
  }
  return text
    .replace(/[*_~`#>[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Word count over exactly the text the faction sheet renders, markdown syntax stripped. */
export function sheetWordCount(rules: FactionRules): number {
  return (
    words(rules.startText) +
    words(rules.revivalText) +
    words(rules.alliance.text) +
    words(rules.fate.title) +
    words(rules.fate.text) +
    rules.advantages.reduce(
      (sum, rule) => sum + words(rule.title) + words(rule.text) + words(rule.karama),
      0
    )
  );
}

/** The calculated 0..1 complexity of a rules block — never reads the manual field. */
export function calculateComplexity(rules: FactionRules): number {
  const total = sheetWordCount(rules);
  const base =
    total <= COMPLEXITY_GRACE_FLOOR_WORDS
      ? 0
      : Math.min(
          1,
          (total - COMPLEXITY_GRACE_FLOOR_WORDS) /
            (COMPLEXITY_CAPACITY_WORDS - COMPLEXITY_GRACE_FLOOR_WORDS)
        );
  const adjusted = COMPLEXITY_ADJUSTMENTS.reduce((sum, rule) => sum + rule.apply(rules), base);
  return Math.min(1, Math.max(0, adjusted));
}

/** The rating surfaces actually show: the author's manual rating when set, else the calculation. */
export function effectiveComplexity(data: Pick<FactionInput, 'rules' | 'complexity'>): number {
  return data.complexity ?? calculateComplexity(data.rules);
}

export type ComplexityTier = 'novice' | 'intermediate' | 'expert' | 'master';

/** Band edges over the 0..1 score; a score at an edge belongs to the band above it. */
export const COMPLEXITY_TIER_EDGES: { edge: number; tier: ComplexityTier }[] = [
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
