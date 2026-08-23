import type { Doc } from '../_generated/dataModel';

/**
 * A Ruleset row as the widened release puts it on the wire.
 * The stored canonical field stays optional until the backfill finishes, but every read supplies it from the legacy field so the new Worker has one stable contract throughout the rollout.
 */
export type RulesetWithAbout = Doc<'rulesets'> & { about: string };

export function withRulesetAbout(row: Doc<'rulesets'>): RulesetWithAbout {
  return { ...row, about: row.about ?? row.description };
}
