export const FAQ_TAG_VALUES = ['rules', 'army_list', 'strategy', 'balance', 'errata', 'other'] as const;

export type FaqTag = (typeof FAQ_TAG_VALUES)[number];

export const DEFAULT_FAQ_TAG: FaqTag = 'other';
