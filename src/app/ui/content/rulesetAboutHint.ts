import { RULESET_ABOUT_MIN_LENGTH } from '@shared/rulesets/validation';

/**
 * The words around a Ruleset About field, shared by both Ruleset forms so they cannot drift.
 * The guidance sits behind the control's help icon and the live count stays under the field.
 * The floor cannot drift because it comes from the shared schema, while separate copies of the sentence could.
 */
export const RULESET_ABOUT_HELP = `What this ruleset is for, and how it differs from the base game. At least ${RULESET_ABOUT_MIN_LENGTH} characters.`;

export function rulesetAboutCount(value: string) {
  return `${value.trim().length} so far.`;
}
