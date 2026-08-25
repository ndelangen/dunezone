import type { Doc } from '../_generated/dataModel';

/**
 * The active Ruleset contract during storage retirement.
 * The database may still carry `description` until the retirement migration reaches a row, but no reader receives that field.
 */
export type ActiveRuleset = Omit<Doc<'rulesets'>, 'description'>;

export function activeRuleset(row: Doc<'rulesets'>): ActiveRuleset {
  const { description: _description, ...active } = row;
  return active;
}
