import { FormError } from './FormError';
import type { FormErrorProps } from './FormError';

/** What the reader tried to do to the thing, as a verb. */
export type FailedAction =
  | 'save'
  | 'create'
  | 'delete'
  | 'rename'
  | 'update'
  | 'change'
  | 'add'
  | 'convert'
  | 'publish'
  | 'fill'
  | 'clear'
  | 'ask'
  | 'merge'
  | 'store'
  | 'import';

const DONE: Record<FailedAction, string> = {
  save: 'saved',
  create: 'created',
  delete: 'deleted',
  rename: 'renamed',
  update: 'updated',
  change: 'changed',
  add: 'added',
  convert: 'converted',
  publish: 'published',
  fill: 'filled',
  clear: 'cleared',
  ask: 'asked',
  merge: 'merged',
  store: 'stored',
  import: 'imported',
};

export interface ActionErrorProps extends Pick<FormErrorProps, 'action'> {
  /** The thing the action was on, as the page names it: "Rulebook", "deck", "answer". */
  subject: string;
  /** What the reader tried to do to it. */
  verb: FailedAction;
  /**
   * The failure, usually the rejected mutation's `error`, or the reason as words.
   * Nothing renders while it is empty, so a caller passes its mutation's error as it stands instead of guarding it.
   * A server refusal (a `ConvexError` with words as its data) is shown in the server's own words.
   */
  error: Error | string | null | undefined;
}

/** The reason under the title. Read structurally, because the kit must not import Convex to recognise its error. */
function reason(error: Error | string): string {
  if (typeof error === 'string') {
    return error.trim() || 'Try again in a moment.';
  }
  const data: unknown = (error as { data?: unknown }).data;
  const words = typeof data === 'string' ? data : error.message;
  return words.trim() || 'Try again in a moment.';
}

/**
 * A save, delete, create or rename that did not happen: `FormError` with the one title pattern, "Rulebook could not be deleted".
 * The title names the thing, so the failure reads on its own even when it sits away from the button that caused it (Norbert, 2026-11-06).
 * Failures that are not an action on a thing (sign-in, an import, the table) keep `FormError` with their own words.
 */
export function ActionError({ subject, verb, error, action }: ActionErrorProps) {
  if (error == null || error === '') {
    return null;
  }
  const name = `${subject[0]?.toUpperCase() ?? ''}${subject.slice(1)}`;
  return (
    <FormError title={`${name} could not be ${DONE[verb]}`} action={action}>
      {reason(error)}
    </FormError>
  );
}
