import type { FactionInput } from './schema';

type FactionRules = FactionInput['rules'];
export type FactionComplexity = FactionInput['complexity'];
export type TransitionalFactionComplexity = FactionComplexity | number | undefined;

/** Below this many words the score stays 0 — every faction needs some baseline text. */
const COMPLEXITY_GRACE_FLOOR_WORDS = 80;

/** At this many words the base score reaches 1.0 — roughly the printed sheet's capacity. */
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
      Math.max(0, rules.advantages.length - COMPLEXITY_MANY_ADVANTAGES_THRESHOLD) *
      COMPLEXITY_MANY_ADVANTAGES_STEP,
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
    rules.advantages.reduce(
      (sum, rule) => sum + words(rule.title) + words(rule.text) + words(rule.karama),
      0
    )
  );
}

/** The calculated 0..1 complexity of a rules block — never reads the manual rating. */
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

function complexityRecord(calculated: number, manual: number | undefined): FactionComplexity {
  return manual === undefined ? { calculated } : { calculated, manual };
}

function isGroupedComplexity(
  complexity: TransitionalFactionComplexity
): complexity is FactionComplexity {
  return complexity !== null && typeof complexity === 'object';
}

function manualComplexity(complexity: TransitionalFactionComplexity): number | undefined {
  return typeof complexity === 'number'
    ? complexity
    : isGroupedComplexity(complexity)
      ? complexity.manual
      : undefined;
}

function withRecalculatedComplexity<
  T extends { rules: FactionRules; complexity?: TransitionalFactionComplexity },
>(data: T): T & { complexity: FactionComplexity } {
  return {
    ...data,
    complexity: complexityRecord(
      calculateComplexity(data.rules),
      manualComplexity(data.complexity)
    ),
  };
}

/**
 * Normalizes either side of the migration for readers. A stored grouped calculation is
 * authoritative; only absent and legacy-scalar records calculate on read.
 */
export function normalizeStoredFactionComplexity<
  T extends { rules: FactionRules; complexity?: TransitionalFactionComplexity },
>(data: T): T & { complexity: FactionComplexity } {
  if (isGroupedComplexity(data.complexity)) {
    return { ...data, complexity: data.complexity };
  }
  return withRecalculatedComplexity(data);
}

/** Recalculates the stored value at an authoring or migration boundary while retaining manual. */
export function recalculateFactionComplexity<
  T extends { rules: FactionRules; complexity?: TransitionalFactionComplexity },
>(data: T): T & { complexity: FactionComplexity } {
  return withRecalculatedComplexity(data);
}

/** Manual when present, otherwise stored calculated; legacy rows calculate only as a fallback. */
export function effectiveComplexity(data: {
  rules: FactionRules;
  complexity?: TransitionalFactionComplexity;
}): number {
  if (isGroupedComplexity(data.complexity)) {
    return data.complexity.manual ?? data.complexity.calculated;
  }
  return data.complexity ?? calculateComplexity(data.rules);
}
