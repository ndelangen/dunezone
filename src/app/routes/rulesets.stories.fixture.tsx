import { faction, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

/** More factions on ClassicRules, linked after the baseline's House Atreides, so they follow it in the ruleset's order. */
export function seedLinkedFactions(baseline: StorybookDatabase, names: string[]) {
  for (const name of names) {
    const key = `faction:${name.toLowerCase().replace(/\s+/g, '-')}`;
    baseline.factions.push({ ...faction({ name }), $key: key });
    baseline.ruleset_factions.push({
      ruleset_id: ref('ruleset:classicrules'),
      faction_id: ref(key),
      position: baseline.ruleset_factions.length,
    });
  }
}
