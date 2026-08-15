/**
 * PROTOTYPE — THROWAWAY. Wayfinder ticket #405: starting constants and shape of the complexity
 * calculation, calibrated against the real faction corpus.
 *
 * Usage:
 *   bunx convex run factions:list > /tmp/factions-dump.json
 *   bun scripts/prototype-405-complexity-calibration.ts /tmp/factions-dump.json
 *
 * Prints per-faction word counts and the score each candidate model assigns, plus a histogram per
 * model, so the constants can be judged against factions we know. Not production code — the real
 * calculation ships in the shared module with these constants as its starting values.
 */

type Rule = { title?: string; text: string; karama?: string };
type FactionRow = {
  slug: string;
  data: {
    name: string;
    rules: {
      startText: string;
      revivalText: string;
      spiceCount: number;
      advantages: Rule[];
      fate: { title?: string; text: string };
      alliance: { text: string };
    };
  };
};

/* ---------------------------------------------------------------- word counting */

function words(text: string | undefined): number {
  if (!text) {
    return 0;
  }
  return text
    .replace(/[*_~`#>[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function sheetWords(rules: FactionRow['data']['rules']): number {
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

/* ---------------------------------------------------------------- candidate models */

/**
 * The rule-pipeline shape the real module will use: a base curve over the word count, then a list
 * of declarative adjustments, clamped to 0..1. Adding a tuning rule later is one entry + one test.
 */
type Adjustment = {
  id: string;
  /** Returns a score delta in 0..1 space. */
  apply: (rules: FactionRow['data']['rules']) => number;
};

type Model = {
  key: string;
  floor: number;
  capacity: number;
  curve: (linear: number) => number;
  adjustments: Adjustment[];
};

/** Each advantage beyond the eighth costs sheet space beyond its words: headers, gaps. */
const manyAdvantages: Adjustment = {
  id: 'many-advantages',
  apply: (rules) => Math.max(0, rules.advantages.length - 8) * 0.03,
};

const MODELS: Model[] = [
  {
    key: 'A linear 60→900',
    floor: 60,
    capacity: 900,
    curve: (linear) => linear,
    adjustments: [],
  },
  {
    key: 'B linear 80→700',
    floor: 80,
    capacity: 700,
    curve: (linear) => linear,
    adjustments: [],
  },
  {
    key: 'C sqrt 60→900',
    floor: 60,
    capacity: 900,
    curve: Math.sqrt,
    adjustments: [],
  },
  {
    key: 'D linear 80→700 +adv',
    floor: 80,
    capacity: 700,
    curve: (linear) => linear,
    adjustments: [manyAdvantages],
  },
];

function score(model: Model, rules: FactionRow['data']['rules']): number {
  const total = sheetWords(rules);
  const linear =
    total <= model.floor ? 0 : Math.min(1, (total - model.floor) / (model.capacity - model.floor));
  const base = model.curve(linear);
  const adjusted = model.adjustments.reduce((sum, rule) => sum + rule.apply(rules), base);
  return Math.min(1, Math.max(0, adjusted));
}

/* ---------------------------------------------------------------- report */

const TIER_EDGES: [number, string][] = [
  [0.25, 'novice'],
  [0.5, 'intermediate'],
  [0.75, 'expert'],
  [1.01, 'master'],
];

function tierOf(value: number): string {
  const hit = TIER_EDGES.find(([edge]) => value < edge);
  return hit ? hit[1] : 'master';
}

const path = process.argv[2];
if (!path) {
  console.error('usage: bun scripts/prototype-405-complexity-calibration.ts <factions-dump.json>');
  process.exit(1);
}
const rows = (await Bun.file(path).json()) as FactionRow[];

const scored = rows
  .map((row) => {
    const rules = row.data.rules;
    return {
      name: row.data.name || row.slug,
      words: sheetWords(rules),
      advantages: rules.advantages.length,
      scores: MODELS.map((model) => score(model, rules)),
    };
  })
  .sort((left, right) => left.words - right.words);

const header = ['faction'.padEnd(26), 'words'.padStart(5), 'adv'.padStart(4)]
  .concat(MODELS.map((model) => model.key.padStart(22)))
  .join('  ');
console.log(header);
console.log('-'.repeat(header.length));
for (const entry of scored) {
  console.log(
    [entry.name.slice(0, 26).padEnd(26), String(entry.words).padStart(5), String(entry.advantages).padStart(4)]
      .concat(
        entry.scores.map((value) =>
          `${Math.round(value * 10)}/10 ${tierOf(value).slice(0, 12)}`.padStart(22)
        )
      )
      .join('  ')
  );
}

console.log('\nDistribution per model (novice / intermediate / expert / master):');
MODELS.forEach((model, index) => {
  const counts = { novice: 0, intermediate: 0, expert: 0, master: 0 } as Record<string, number>;
  for (const entry of scored) {
    counts[tierOf(entry.scores[index] as number)] += 1;
  }
  console.log(
    `  ${model.key.padEnd(24)} ${counts['novice']} / ${counts['intermediate']} / ${counts['expert']} / ${counts['master']}`
  );
});

const wordCounts = scored.map((entry) => entry.words);
console.log(
  `\ncorpus: n=${wordCounts.length}, min=${Math.min(...wordCounts)}, median=${wordCounts[Math.floor(wordCounts.length / 2)]}, max=${Math.max(...wordCounts)}`
);
