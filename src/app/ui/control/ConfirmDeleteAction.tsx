import { Button, Group, Text } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconAction } from './IconAction';

export interface ConfirmDeleteActionProps {
  /**
   * What gets deleted, as a verb phrase, for example "Delete faction".
   * This is the trigger's accessible name and the name of the confirmation that replaces it.
   */
  label: string;
  /**
   * The question, shown beside the confirm button, for example "Delete faction?".
   * Required rather than derived from `label`: it is the only sentence in the two-step, and the one place a page can name a consequence the terse trigger cannot carry ("Delete card?
   * Its publications stay.").
   */
  prompt: string;
  /** The confirm button's word. Override only when "Delete" would be a lie. */
  confirmLabel?: string;
  /** True while the deletion is in flight. Latches the confirm button so a second click cannot fire it twice. */
  pending: boolean;
  /** Fires once the reader has confirmed. The caller owns the mutation and wherever it navigates afterwards. */
  onConfirm: () => void;
}

/**
 * Deletes something, having asked first.
 *
 * Callers own what is deleted and the words for it;
 * this owns the two-step shape.
 * A red glyph expands in place into a question and a pair of answers, and collapses again on cancel.
 *
 * The asking is in place rather than in a dialog, deliberately.
 * A toolbar action that opens one loses the row it belongs to, and `window.confirm` cannot be styled, tested, or dismissed by keyboard the way the rest of the app can.
 * See docs/technical/ui-design-decisions.md, "Destructive confirmation asks in place".
 * The mid-confirm state lives here because it is furniture around committing the action, not something a caller ever needs to read.
 *
 * Swapping the trigger for the question would strand keyboard focus on an unmounted node, so the swap hands focus over in both directions.
 * Focus goes to the question on open and back to the glyph on cancel, the same contract `AssignPopover` gets from Mantine's `returnFocus`.
 * Focus lands on the group rather than the confirm button on purpose.
 * A held Enter would otherwise repeat straight through onto "Delete".
 */
export function ConfirmDeleteAction({
  label,
  prompt,
  confirmLabel = 'Delete',
  pending,
  onConfirm,
}: ConfirmDeleteActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sawPending, setSawPending] = useState(false);
  /* Reset during render, the search box's pattern: when the caller's round trip ends, a failed delete gets its retry back. */
  if (pending && !sawPending) {
    setSawPending(true);
  }
  if (!pending && sawPending) {
    setSawPending(false);
    setSubmitted(false);
  }
  const triggerRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  /* Only a cancel should pull focus back to the glyph; the first render has nothing to return to. */
  const wasConfirming = useRef(false);

  useEffect(() => {
    switch (true) {
      case confirming:
        questionRef.current?.focus();
        break;
      case wasConfirming.current:
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!confirming) {
    return (
      <IconAction
        ref={triggerRef}
        label={label}
        variant="light"
        color="red"
        size="lg"
        onClick={() => setConfirming(true)}
        icon={<Trash2 size={17} aria-hidden />}
      />
    );
  }

  return (
    <Group
      ref={questionRef}
      gap={4}
      wrap="nowrap"
      role="group"
      aria-label={label}
      tabIndex={-1}
      /* Escape closes the asking the way it closes every popover here; the focus effect then hands focus back to the trigger. */
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setConfirming(false);
        }
      }}
    >
      <Text size="xs" c="red" fw={700}>
        {prompt}
      </Text>
      <Button
        type="button"
        color="red"
        size="compact-xs"
        loading={pending || submitted}
        onClick={() => {
          /*
           * Latched locally before the callback: the caller's pending arrives a render later, and the gap is where a double click fires a destructive callback twice.
           * Focus moves to the group in the same breath, because the loading button is about to disable and a disabled element drops keyboard focus to the document.
           */
          setSubmitted(true);
          questionRef.current?.focus();
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      {/* Cancel stays live during an in-flight delete on purpose: there is no abort channel to reach, and latching it would trap the reader here with no exit if the round trip stalls. It closes the asking, never the mutation. The caller's navigation or error alert reports the outcome. */}
      <Button type="button" variant="subtle" color="gray" size="compact-xs" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </Group>
  );
}
