export const FAQ_TAG_VALUES = [
  'rules',
  'army_list',
  'strategy',
  'balance',
  'errata',
  'other',
] as const;

export type FaqTag = (typeof FAQ_TAG_VALUES)[number];

export const DEFAULT_FAQ_TAG: FaqTag = 'other';

export const FAQ_TAG_LABELS: Record<FaqTag, string> = {
  rules: 'Rules',
  army_list: 'Army List',
  strategy: 'Strategy',
  balance: 'Balance',
  errata: 'Errata',
  other: 'Other',
};
