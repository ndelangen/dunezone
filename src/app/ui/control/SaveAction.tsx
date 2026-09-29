import { Stack, Text, VisuallyHidden } from '@mantine/core';
import { Check, CircleAlert, Save } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import { IconAction } from './IconAction';
import styles from './SaveAction.module.css';

/** Where the work stands, as Save shows it. */
export type SaveActionState = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';

export interface SaveActionProps {
  /** What it saves, as a verb phrase: "Save faction". The accessible name, whatever the state. */
  label: string;
  state: SaveActionState;
  /** The hover text: the state in words first, then anything the page adds, one sentence per line. */
  lines: readonly string[];
  onSave: () => void;
  /** Why saving is blocked right now, such as a blank name. The action looks disabled and says this on hover. */
  disabledReason?: string | null;
  /** Holds the action without a reason, such as a draft with nothing to save that the page keeps unpressable. */
  disabled?: boolean;
  /** The id of words describing the state for a screen reader, usually the page's live region. Without one, Save describes itself with `lines`. */
  describedBy?: string;
  /** A glyph for a state the page names itself, such as a review of differences. */
  icon?: ReactNode;
  /** Submits a form this action sits outside of, by that form's id. */
  form?: string;
}

/**
 * Save, wearing where the work stands, so no status beside it has to (Norbert, 2026-09-29).
 *
 * Callers own the state and its words.
 * This owns the look of each state: a dot on the glyph while there are unsaved changes, a spinner while saving, a check once saved, red when a save failed, and the disabled look with the reason on hover while something blocks it.
 * It is green, and last on the right, on every editor.
 */
export function SaveAction({
  label,
  state,
  lines,
  onSave,
  disabledReason,
  disabled,
  describedBy,
  icon,
  form,
}: SaveActionProps) {
  /* Without the page's own live region, the words describe Save from here, so a reader who never hovers still hears the state. */
  const ownId = useId();
  const description = describedBy ?? ownId;
  const words = [...lines, ...(disabledReason && !lines.includes(disabledReason) ? [disabledReason] : [])];
  const ownWords = describedBy ? null : <VisuallyHidden id={ownId}>{words.join(' ')}</VisuallyHidden>;
  const glyph =
    icon ??
    (state === 'saved' ? (
      <Check size={17} aria-hidden />
    ) : state === 'failed' ? (
      <CircleAlert size={17} aria-hidden />
    ) : (
      <span className={styles.glyph}>
        <Save size={17} aria-hidden />
        {state === 'dirty' ? <span className={styles.dirtyDot} /> : null}
      </span>
    ));
  if (disabledReason && state !== 'saving') {
    return (
      <>
        <IconAction
          label={label}
          disabledReason={disabledReason}
          intent="positive"
          emphasis="strong"
          size="lg"
          aria-describedby={description}
          icon={glyph}
        />
        {ownWords}
      </>
    );
  }
  return (
    <>
      <IconAction
        label={label}
        tooltip={
          <Stack gap={4} className={styles.tooltip}>
            {lines.map((line) => (
              <Text key={line} size="sm" inherit>
                {line}
              </Text>
            ))}
          </Stack>
        }
        intent={state === 'failed' ? 'negative' : 'positive'}
        emphasis="strong"
        size="lg"
        type={form ? 'submit' : 'button'}
        form={form}
        disabled={disabled || state === 'saving'}
        loading={state === 'saving'}
        aria-describedby={description}
        onClick={onSave}
        icon={glyph}
      />
      {ownWords}
    </>
  );
}
