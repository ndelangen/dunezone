import { RULESET_DESCRIPTION_MIN_LENGTH } from '@shared/rulesets/validation';

/**
 * The requirement line under a ruleset description field, with a live count of what has been written.
 * A support module rather than a component: it turns a length into words, which is Content's job, and it lives here because both ruleset forms show the identical sentence;
 * the floor cannot drift, since it comes from the shared schema's constant, but the wording would if each form kept its own copy.
 */
export function rulesetDescriptionHint(value: string) {
  return `What this ruleset is for, and how it differs from the base game. At least ${RULESET_DESCRIPTION_MIN_LENGTH} characters — ${value.trim().length} so far.`;
}
