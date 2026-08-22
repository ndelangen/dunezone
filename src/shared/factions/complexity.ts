import type { FactionInput } from './schema';

type FactionRules = FactionInput['rules'];
export type FactionComplexity = FactionInput['complexity'];

/** Below this many words the score stays 0, every faction needs some baseline text. */
const COMPLEXITY_GRACE_FLOOR_WORDS = 80;

/** At this many words the base score reaches 1.0, roughly the printed sheet's capacity. */
export const COMPLEXITY_CAPACITY_WORDS = 700;

/** Advantages beyond this count each add {@link COMPLEXITY_MANY_ADVANTAGES_STEP} to the score. */
const COMPLEXITY_MANY_ADVANTAGES_THRESHOLD = 8;
const COMPLEXITY_MANY_ADVANTAGES_STEP = 0.03;

type ComplexityAdjustment = {
  id: string;
  apply: (rules: FactionRules) => number;
};

const COMPLEXITY_ADJUSTMENTS: ComplexityAdjustment[] = [
  {
    id: 'many-advantages',
    apply: (rules) =>
      Math.max(0, rules.advantages.length - COMPLEXITY_MANY_ADVANTAGES_THRESHOLD) * COMPLEXITY_MANY_ADVANTAGES_STEP,
  },
];

function words(text: string | undefined): number {
  if (!text) {
    return 0;
  }
  return text
    .replace(/\]\([^)]*\)/g, '] ')
    .replace(/^[ \t]*(?:`{3,}|~{3,})[^\r\n]*$/gm, ' ')
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/gm, '')
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ')
    .replace(/[*_~`#>[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function sheetWordCount(rules: FactionRules): number {
  return (
    words(rules.startText) +
    words(rules.revivalText) +
    words(rules.alliance.text) +
    words(rules.fate.title) +
    words(rules.fate.text) +
    rules.advantages.reduce((sum, rule) => sum + words(rule.title) + words(rule.text) + words(rule.karama), 0)
  );
}

/** The calculated 0..1 complexity of a rules block, never reads the manual rating. */
export function calculateComplexity(rules: FactionRules): number {
  const total = sheetWordCount(rules);
  const base =
    total <= COMPLEXITY_GRACE_FLOOR_WORDS
      ? 0
      : Math.min(
          1,
          (total - COMPLEXITY_GRACE_FLOOR_WORDS) / (COMPLEXITY_CAPACITY_WORDS - COMPLEXITY_GRACE_FLOOR_WORDS)
        );
  const adjusted = COMPLEXITY_ADJUSTMENTS.reduce((sum, rule) => sum + rule.apply(rules), base);
  return Math.min(1, Math.max(0, adjusted));
}

function complexityRecord(calculated: number, manual: number | undefined): FactionComplexity {
  return manual === undefined ? { calculated } : { calculated, manual };
}

/** Creates or refreshes the grouped value at an authoring boundary while retaining manual. */
export function recalculateFactionComplexity<T extends { rules: FactionRules; complexity?: FactionComplexity }>(
  data: T
): T & { complexity: FactionComplexity } {
  return {
    ...data,
    complexity: complexityRecord(calculateComplexity(data.rules), data.complexity?.manual),
  };
}

/** Manual when present, otherwise the stored calculated rating. */
export function effectiveComplexity(complexity: FactionComplexity): number {
  return complexity.manual ?? complexity.calculated;
}
