import { Button, Group, Text } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconAction } from './IconAction';

export interface ConfirmDeleteActionProps {
  /**
   * What gets deleted, as a verb phrase — "Delete faction".
   * This is the trigger's accessible name and the name of the confirmation that replaces it.
   */
  label: string;
  /**
   * The question, shown beside the confirm button — "Delete faction?".
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
 * this owns the two-step shape — a red glyph that expands in place into a question and a pair of answers, and collapses again on cancel.
 *
 * The asking is in place rather than in a modal, deliberately: a toolbar action that opens a dialog loses the row it belongs to, and this repo puts addressable pages where other apps put modals.
 * The mid-confirm state lives here because it is furniture around committing the action, not something a caller ever needs to read.
 *
 * Swapping the trigger for the question would strand keyboard focus on an unmounted node, so the swap hands focus over in both directions — to the question on open, back to the glyph on cancel — the same contract `AssignPopover` gets from Mantine's `returnFocus`.
 * Focus lands on the group rather than the confirm button on purpose: a held Enter would otherwise repeat straight through onto "Delete".
 */
export function ConfirmDeleteAction({
  label,
  prompt,
  confirmLabel = 'Delete',
  pending,
  onConfirm,
}: ConfirmDeleteActionProps) {
  const [confirming, setConfirming] = useState(false);
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
    <Group ref={questionRef} gap={4} wrap="nowrap" role="group" aria-label={label} tabIndex={-1}>
      <Text size="xs" c="red" fw={700}>
        {prompt}
      </Text>
      <Button type="button" color="red" size="compact-xs" loading={pending} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      {/* Cancel stays live during an in-flight delete on purpose: there is no abort channel to reach, and latching it would trap the reader here with no exit if the round trip stalls. It closes the asking, never the mutation — the caller's navigation or error alert is what reports the outcome. */}
      <Button type="button" variant="subtle" color="gray" size="compact-xs" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </Group>
  );
}
