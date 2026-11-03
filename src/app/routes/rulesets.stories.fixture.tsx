import { faction, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { publishEverything } from './_app/play/create.route.stories.fixture';

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

/** Numbered questions on ClassicRules, asked after the baseline's storm question, so the storm question is the oldest. */
export function seedQuestions(baseline: StorybookDatabase, count: number) {
  for (let index = 1; index <= count; index++) {
    const number = String(index).padStart(2, '0');
    baseline.faq_items.push({
      ruleset_id: ref('ruleset:classicrules'),
      slug: `question-${number}`,
      question: `Question ${number}?`,
      tags: ['rules'],
      asked_by: ref('storybook-viewer'),
      created_at: `2030-01-01T00:00:${number}.000Z`,
      updated_at: `2030-01-01T00:00:${number}.000Z`,
      accepted_answer_id: null,
    });
  }
}

/* ClassicRules as a game can take it: its treachery deck slotted as the spice deck too, and every face published. */
export function readyForPlay(baseline: StorybookDatabase) {
  const treachery = baseline.ruleset_asset_slots.find((slot) => slot.slot === 'treachery')!;
  baseline.ruleset_asset_slots.push({ ...treachery, slot: 'spice' });
  publishEverything(baseline);
  return baseline;
}
