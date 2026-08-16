import type { FaqTag } from '@shared/faq/tags';

/**
 * How the interface writes each FAQ tag.
 * The vocabulary itself (`FAQ_TAG_VALUES`) is a shared contract the Convex server also parses; these display strings are the browser's alone, so they live in the kit rather than in `@shared`, keyed off the shared type so a new tag forces a label.
 */
export const FAQ_TAG_LABELS: Record<FaqTag, string> = {
  rules: 'Rules',
  army_list: 'Army List',
  strategy: 'Strategy',
  balance: 'Balance',
  errata: 'Errata',
  other: 'Other',
};
