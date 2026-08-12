import { Button } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';

export interface SubmitActionProps {
  /** What saving means here — "Save group". A verb phrase, because it is a promise to act. */
  children: string;
  /** True while the submission is in flight. Swaps the label and blocks a second click. */
  pending: boolean;
  /** Blocks the action for a reason of the form's own, such as a required field still empty. */
  disabled?: boolean;
  /** Shown in place of `children` while pending. Override only when "Saving…" would be a lie. */
  pendingLabel?: string;
  size?: ButtonProps['size'];
}

/**
 * Commits a form.
 *
 * Callers own when it may fire and what it says; this owns the fact that a commit looks the same
 * everywhere — the confirm colour that marks a positive action (DD-007), and the swap to a progress
 * label that also latches the button so an impatient second click cannot submit twice.
 *
 * Distinct from `CallToAction`, which starts a journey by navigating and therefore needs a
 * `renderRoot`; this one submits the form it sits in and needs no route at all.
 */
export function SubmitAction({
  children,
  pending,
  disabled = false,
  pendingLabel = 'Saving…',
  size,
}: SubmitActionProps) {
  return (
    <Button
      type="submit"
      variant="filled"
      color="confirm"
      size={size}
      loading={pending}
      disabled={disabled || pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
