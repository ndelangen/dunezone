import { z } from 'zod';

export const factionSpecialRuleLabelSchema = z.enum(['karama', 'fate']);

export const factionSpecialRuleLabels = {
  karama: 'Faction Special Karama',
  fate: 'Fate',
} satisfies Record<z.infer<typeof factionSpecialRuleLabelSchema>, string>;

/** An absent override uses Karama without rewriting existing faction definitions. */
export function factionSpecialRuleLabel(label: z.infer<typeof factionSpecialRuleLabelSchema> | undefined): string {
  return factionSpecialRuleLabels[label ?? 'karama'];
}
