import { Anchor, List, Text, VisuallyHidden } from '@mantine/core';
import type { TermHint } from '@shared/glossary/hints';

export interface TermHintsProps {
  /** One entry per avoided word worth mentioning; with none, nothing renders. */
  hints: readonly TermHint[];
  /** Lets the field it advises name it in `aria-describedby`, so screen readers hear the advice with the field. */
  id?: string;
}

/**
 * Advice beside a text field about words the glossary says differently.
 * It is never an error: the author may keep their wording, and nothing about saving changes.
 * Each glossary link opens a new tab so an unsaved draft stays where it is.
 */
export function TermHints({ hints, id }: TermHintsProps) {
  if (hints.length === 0) {
    return null;
  }
  return (
    <div id={id} role="note" aria-label="Wording suggestions">
      <List size="sm" listStyleType="none" spacing={2}>
        {hints.map((hint) => (
          <List.Item key={`${hint.term.id}:${hint.found.toLowerCase()}`}>
            <Text size="sm" c="dimmed" span>
              &ldquo;{hint.found}&rdquo;: you may mean{' '}
              <Anchor href={`/glossary#${hint.term.id}`} target="_blank" rel="noreferrer" size="sm" fw={600}>
                {hint.term.term}
                <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
              </Anchor>
              .
            </Text>
          </List.Item>
        ))}
      </List>
    </div>
  );
}
