import { faction, ref, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';
import productFactions from '@app/routes/_app/play/product.stories.fixture/factions.json';

/* The battle wheel page stories' database, shared by the visual and the behaviour stories. */
/* GF9, whose base six the page offers first, as Play's product fixture captures them from production, and KISS, which dials its own way. */
export function withRulesets(baseline: StorybookDatabase) {
  const gf9 = { ...ruleset({ name: 'GF9' }), battle_dialing: 'advanced' as const };
  baseline.rulesets.push(gf9, { ...ruleset({ name: 'KISS' }), battle_dialing: 'kiss' as const });
  productFactions.forEach((row, position) => {
    const seated = faction({ name: row.data.name, data: row.data as never });
    /* The baseline already holds House Atreides: it takes the production faction's data rather than a second row. */
    const known = baseline.factions.find((existing) => existing.$key === seated.$key);
    if (known) {
      known.data = seated.data;
    } else {
      baseline.factions.push(seated);
    }
    baseline.ruleset_factions.push({ ruleset_id: ref(gf9.$key!), faction_id: ref(seated.$key!), position });
  });
  return baseline;
}
