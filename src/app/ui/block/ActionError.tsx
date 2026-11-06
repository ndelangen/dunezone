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
  /** The reason, usually the rejected mutation's message. */
  children: string;
}

/**
 * A save, delete, create or rename that did not happen: `FormError` with the one title pattern, "Rulebook could not be deleted".
 * The title names the thing, so the failure reads on its own even when it sits away from the button that caused it (Norbert, 2026-11-06).
 * Failures that are not an action on a thing (sign-in, an import, the table) keep `FormError` with their own words.
 */
export function ActionError({ subject, verb, children, action }: ActionErrorProps) {
  const name = `${subject[0]?.toUpperCase() ?? ''}${subject.slice(1)}`;
  return (
    <FormError title={`${name} could not be ${DONE[verb]}`} action={action}>
      {children}
    </FormError>
  );
}
