import { within } from 'storybook/test';

import { ref, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

/**
 * A second ruleset with its own questions, so a search reaches across rulesets.
 * Every question names the storm, so one search finds them all;
 * the ClassicRules ones are numbered so there is more to load than one answer shows.
 */
export function seedRulesets(baseline: StorybookDatabase, classicQuestions: number) {
  baseline.rulesets.push(ruleset({ name: 'Dreamrules' }));
  const dreamQuestions = [
    { slug: 'storm-and-shipment', question: 'Can I ship troops into the storm?' },
    { slug: 'storm-over-a-stronghold', question: 'Does the storm kill troops in a stronghold?' },
  ];
  for (const [index, entry] of dreamQuestions.entries()) {
    baseline.faq_items.push({
      ruleset_id: ref('ruleset:dreamrules'),
      slug: entry.slug,
      question: entry.question,
      tags: ['rules'],
      asked_by: ref('storybook-viewer'),
      created_at: `2030-02-01T00:00:0${index}.000Z`,
      updated_at: `2030-02-01T00:00:0${index}.000Z`,
      accepted_answer_id: null,
    });
  }
  for (let index = 1; index <= classicQuestions; index++) {
    const number = String(index).padStart(2, '0');
    baseline.faq_items.push({
      ruleset_id: ref('ruleset:classicrules'),
      slug: `storm-question-${number}`,
      question: `Storm question ${number}?`,
      tags: ['rules'],
      asked_by: ref('storybook-viewer'),
      created_at: `2030-01-01T00:00:${number}.000Z`,
      updated_at: `2030-01-01T00:00:${number}.000Z`,
      accepted_answer_id: null,
    });
  }
  return baseline;
}

/** The list's rows, each named by the question it opens. */
export function questionRows(main: ReturnType<typeof within>) {
  return main.getAllByRole('link', { name: /^Open question: / });
}

/** The whole page and its main region, once the FAQ page has rendered. */
export async function findFaqMain(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
  return { page, main };
}
