import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import type { FactionInput } from '@shared/factions/schema';
import { INHERITABLE_FIELDS } from '@shared/factions/variantFields';
import type { InheritableField } from '@shared/factions/variantFields';
import { slugify } from '@shared/slugify';

import { db, ref, ruleset, storybookViewer } from '@db/storybook/database';
import type { StorybookDatabase } from '@db/storybook/database';
import type { WorkerIdentity } from '@db/storybook/protocol';

/** One variant of House Atreides beside its Original: what it changes, and the ruleset that plays it. */
type PracticeVariant = Readonly<{
  name: string;
  /** The fields it keeps as its own; it follows the Original, its parent, in every other one. */
  custom: readonly InheritableField[];
  change: (rules: FactionInput['rules']) => Partial<FactionInput['rules']>;
  ruleset?: string;
}>;

/* Each is named for what sets it apart, as the Create variant form asks of a learner's own. */
const VARIANTS: readonly PracticeVariant[] = [
  {
    name: 'Tournament',
    custom: ['rules.spiceCount'],
    change: () => ({ spiceCount: 12 }),
    ruleset: 'Spring Cup',
  },
  {
    name: 'Two players',
    custom: ['rules.startText', 'rules.revivalText'],
    change: () => ({
      startText: '10 troops in Arrakeen, 5 in Carthag and 5 in reserve *(off planet)*.',
      revivalText: '3 troops free.',
    }),
    ruleset: 'Desert Duel',
  },
  { name: 'Beginner', custom: ['rules.revivalText'], change: () => ({ revivalText: '4 troops free.' }) },
];

/*
 * House Atreides with four variants, for the tutorial that teaches them: the Original, which the seed makes with the faction,
 * and three that follow it in all but a field or two, so switching between them shows a difference.
 * The Original stays in ClassicRules, two of the others are each in a ruleset of their own, and Beginner is in none.
 */
function seedVariants(baseline: StorybookDatabase) {
  const original = baseline.factions.find((faction) => faction.$key === 'faction:house-atreides')!;
  /* Battle strengths on every troop, so no variant's page is headed by a problem that has nothing to do with variants. */
  original.data.troops = original.data.troops.map((troop: FactionInput['troops'][number]) => ({
    ...troop,
    capable: true,
    combat: { strength: 1, supportedStrength: 2 },
  }));
  for (const variant of VARIANTS) {
    const variantSlug = slugify(variant.name);
    const key = `faction:house-atreides-${variantSlug}`;
    const data: FactionInput = structuredClone(original.data);
    data.rules = { ...data.rules, ...variant.change(data.rules) };
    baseline.factions.push({
      ...original,
      $key: key,
      $patch: undefined,
      slug: `house-atreides-${variantSlug}`,
      data,
      variant_name: variant.name,
      variant_slug: variantSlug,
      parent_id: ref('faction:house-atreides'),
      inherited: INHERITABLE_FIELDS.filter((field) => !variant.custom.includes(field)),
      revision: 0,
    });
    if (variant.ruleset) {
      const row = ruleset({ name: variant.ruleset });
      baseline.rulesets.push(row);
      baseline.ruleset_factions.push({ ruleset_id: ref(row.$key!), faction_id: ref(key), position: 0 });
    }
  }
}

/*
 * What a creator tutorial's practice copy of the site starts with: the page stories' catalogue, signed in as the tutorial's learner.
 * The learner is an ordinary member there, not an administrator, so the pages show them what a new creator sees.
 * The site's stock background presets are there as the preset library writes them on the site, so the background picker has its choices.
 * House Atreides has several variants there, which the page stories' catalogue leaves to the stories about them.
 */
export const practiceDatabase = db((baseline) => {
  baseline.users = baseline.users.map((user) => ({ ...user, isAdmin: false }));
  baseline.background_presets = INITIAL_BACKGROUND_PRESETS.map((preset) => ({ ...preset, updated_at: 0 }));
  seedVariants(baseline);
});

export const PRACTICE_VIEWER: WorkerIdentity = storybookViewer;
