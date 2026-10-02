import { Anchor, Group, Text, VisuallyHidden } from '@mantine/core';
import type { TermHint } from '@shared/glossary/hints';
import { BookA } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './TermHints.module.css';

export interface TermHintsProps {
  /** One entry per avoided word worth mentioning. */
  hints: readonly TermHint[];
  /** Lets the field it advises name it in `aria-describedby`, so screen readers hear the advice with the field. */
  id?: string;
  /** The draft was just rewritten in the glossary's words; with no hints left, the note says so instead of vanishing. */
  fixed?: boolean;
  /** The field's own buttons for the advice, such as fixing the wording or undoing that fix. */
  actions?: ReactNode;
}

const label = 'Wording suggestions';

/**
 * Advice under a text field about words the glossary says differently.
 * It is never an error: the author may keep their wording, and nothing about saving changes.
 * It paints no pane of its own, because the field it advises already sits on one.
 * Each glossary link opens a new tab so an unsaved draft stays where it is.
 */
export function TermHints({ hints, id, fixed = false, actions }: TermHintsProps) {
  if (hints.length === 0 && !fixed) {
    return null;
  }
  return (
    <Group gap="xs" justify="space-between" wrap="wrap" id={id} role="note" aria-label={label}>
      <Group gap="xs" wrap="nowrap" align="flex-start" className={styles.message}>
        <BookA size={16} aria-hidden className={styles.icon} />
        {hints.length > 0 ? (
          <Text size="sm">
            Dune Zone says{' '}
            {hints.map((hint, index) => (
              <span key={`${hint.term.id}:${hint.found.toLowerCase()}`}>
                {index > 0 ? ', ' : ''}
                <Anchor href={`/glossary#${hint.term.id}`} target="_blank" rel="noreferrer" size="sm" fw={600}>
                  {hint.term.term.toLowerCase()}
                  <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                </Anchor>{' '}
                rather than &ldquo;{hint.found}&rdquo;
              </span>
            ))}
            . You can keep your wording.
          </Text>
        ) : (
          <Text size="sm">Wording fixed.</Text>
        )}
      </Group>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
