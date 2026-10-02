import { Anchor, List, Text } from '@mantine/core';
import type { TermHint } from '@shared/glossary/hints';

export interface TermHintsProps {
  /** One entry per avoided word worth mentioning; with none, nothing renders. */
  hints: readonly TermHint[];
}

/**
 * Advice beside a text field about words the glossary says differently.
 * It is never an error: the author may keep their wording, and nothing about saving changes.
 * Each glossary link opens a new tab so an unsaved draft stays where it is.
 */
export function TermHints({ hints }: TermHintsProps) {
  if (hints.length === 0) {
    return null;
  }
  return (
    <div role="note" aria-label="Wording suggestions">
      <List size="sm" listStyleType="none" spacing={2}>
        {hints.map((hint) => (
          <List.Item key={`${hint.term.id}:${hint.found.toLowerCase()}`}>
            <Text size="sm" c="dimmed" span>
              &ldquo;{hint.found}&rdquo;: you may mean{' '}
              <Anchor href={`/glossary#${hint.term.id}`} target="_blank" rel="noopener" size="sm" fw={600}>
                {hint.term.term}
              </Anchor>
              .
            </Text>
          </List.Item>
        ))}
      </List>
    </div>
  );
}
