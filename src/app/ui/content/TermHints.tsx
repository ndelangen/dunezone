import { Alert, Anchor, Button, Group, Text, VisuallyHidden } from '@mantine/core';
import type { TermHint } from '@shared/glossary/hints';
import { BookA } from 'lucide-react';

export interface TermHintsProps {
  /** One entry per avoided word worth mentioning; with none, nothing renders unless a fix can be undone. */
  hints: readonly TermHint[];
  /** Lets the field it advises name it in `aria-describedby`, so screen readers hear the advice with the field. */
  id?: string;
  /** Rewrites the draft in the glossary's words; the button shows only when some hint has a fix. */
  onFix?: () => void;
  /** Puts back the draft from before the last fix; while it is set, the callout offers to undo. */
  onUndo?: () => void;
}

const label = 'Wording suggestions';

/**
 * Advice beside a text field about words the glossary says differently.
 * It is never an error: the author may keep their wording, and nothing about saving changes.
 * Each glossary link opens a new tab so an unsaved draft stays where it is.
 */
export function TermHints({ hints, id, onFix, onUndo }: TermHintsProps) {
  const fixable = onFix && hints.some((hint) => hint.fix !== undefined);
  if (hints.length === 0 && !onUndo) {
    return null;
  }
  return (
    <Alert variant="light" color="dune" icon={<BookA size={16} />} p="xs" id={id} role="note" aria-label={label}>
      <Group gap="xs" justify="space-between" wrap="wrap">
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
        <Group gap="xs">
          {onUndo ? (
            <Button size="compact-sm" variant="subtle" color="dune" onClick={onUndo}>
              Undo
            </Button>
          ) : null}
          {fixable ? (
            <Button size="compact-sm" variant="light" color="dune" onClick={onFix}>
              Fix wording
            </Button>
          ) : null}
        </Group>
      </Group>
    </Alert>
  );
}
