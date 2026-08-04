import { z } from 'zod';

const sources = ['profiles', 'factions', 'rulesets', 'faq_items', 'faq_answers'] as const;
type Source = (typeof sources)[number];

const reconciliationItemSchema = z.object({
  id: z.string(),
  included: z.boolean(),
  rulesetId: z.string().nullable(),
  parentExists: z.boolean(),
});

const reconciliationPageSchema = z.object({
  page: z.array(reconciliationItemSchema),
  isDone: z.boolean(),
  continueCursor: z.string(),
});

const globalTotalsSchema = z.object({
  users: z.number(),
  factions: z.number(),
  rulesets: z.number(),
  questions: z.number(),
  answers: z.number(),
});

const rulesetTotalsSchema = z.object({ questions: z.number(), answers: z.number() });

function runConvex(functionName: string, args: unknown, useProd: boolean): unknown {
  const command = ['bunx', 'convex', 'run', functionName, JSON.stringify(args)];
  if (useProd) {
    command.push('--prod');
  }
  const result = Bun.spawnSync({ cmd: command, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command.join(' ')}`,
        result.stdout.toString().trim(),
        result.stderr.toString().trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return JSON.parse(result.stdout.toString());
}

async function loadSource(source: Source, useProd: boolean) {
  const items: z.infer<typeof reconciliationItemSchema>[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = reconciliationPageSchema.parse(
      runConvex(
        'statistics:getCanonicalReconciliationPage',
        { source, paginationOpts: { cursor, numItems: 64 } },
        useProd
      )
    );
    items.push(...page.page);
    if (page.isDone) {
      return items;
    }
    cursor = page.continueCursor;
  }
}

function emptyRulesetTotals() {
  return { questions: 0, answers: 0 };
}

async function verify(useProd: boolean) {
  const pages = new Map<Source, z.infer<typeof reconciliationItemSchema>[]>();
  for (const source of sources) {
    pages.set(source, await loadSource(source, useProd));
  }

  const canonical = {
    users: pages.get('profiles')?.filter((item) => item.included).length ?? 0,
    factions: pages.get('factions')?.filter((item) => item.included).length ?? 0,
    rulesets: pages.get('rulesets')?.filter((item) => item.included).length ?? 0,
    questions: pages.get('faq_items')?.filter((item) => item.included).length ?? 0,
    answers: pages.get('faq_answers')?.filter((item) => item.included).length ?? 0,
  };

  const perRuleset = new Map<string, { questions: number; answers: number }>();
  for (const item of pages.get('rulesets') ?? []) {
    if (item.rulesetId) {
      perRuleset.set(item.rulesetId, emptyRulesetTotals());
    }
  }
  for (const item of pages.get('faq_items') ?? []) {
    if (item.rulesetId) {
      const totals = perRuleset.get(item.rulesetId) ?? emptyRulesetTotals();
      totals.questions += 1;
      perRuleset.set(item.rulesetId, totals);
    }
  }
  for (const item of pages.get('faq_answers') ?? []) {
    if (item.rulesetId) {
      const totals = perRuleset.get(item.rulesetId) ?? emptyRulesetTotals();
      totals.answers += 1;
      perRuleset.set(item.rulesetId, totals);
    }
  }

  const statistics = globalTotalsSchema.parse(runConvex('statistics:getGlobalTotals', {}, useProd));
  const rulesets = [];
  for (const [rulesetId, expected] of perRuleset) {
    const actual = rulesetTotalsSchema.parse(
      runConvex('statistics:getRulesetTotals', { rulesetId }, useProd)
    );
    rulesets.push({
      rulesetId,
      canonical: expected,
      statistics: actual,
      matches: expected.questions === actual.questions && expected.answers === actual.answers,
    });
  }

  const orphaned = sources.flatMap((source) =>
    (pages.get(source) ?? [])
      .filter((item) => !item.parentExists)
      .map((item) => ({ source, id: item.id }))
  );
  const validatedCanonical = globalTotalsSchema.parse(canonical);
  const globalMatches =
    validatedCanonical.users === statistics.users &&
    validatedCanonical.factions === statistics.factions &&
    validatedCanonical.rulesets === statistics.rulesets &&
    validatedCanonical.questions === statistics.questions &&
    validatedCanonical.answers === statistics.answers;
  const matches =
    globalMatches && rulesets.every((ruleset) => ruleset.matches) && orphaned.length === 0;

  const report = {
    environment: useProd ? 'production' : 'development',
    verifiedAt: new Date().toISOString(),
    canonical: validatedCanonical,
    statistics,
    perRuleset: {
      checked: rulesets.length,
      mismatches: rulesets.filter((ruleset) => !ruleset.matches),
    },
    orphaned,
    matches,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!matches) {
    process.exitCode = 1;
  }
}

await verify(process.argv.includes('--prod'));
