import { RULESET_ABOUT_MIN_LENGTH } from '@shared/rulesets/validation';

/**
 * The requirement line under a Ruleset About field, with a live count of what has been written.
 * A support module rather than a component: it turns a length into words, which is Content's job, and it lives here because both Ruleset forms show the identical sentence.
 * The floor cannot drift because it comes from the shared schema, while separate copies of the sentence could.
 */
export function rulesetAboutHint(value: string) {
  return `What this ruleset is for, and how it differs from the base game. At least ${RULESET_ABOUT_MIN_LENGTH} characters. ${value.trim().length} so far.`;
}
