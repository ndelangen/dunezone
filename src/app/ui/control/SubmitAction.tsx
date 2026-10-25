import { Button } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import type { ReactNode } from 'react';

export interface SubmitActionProps {
  /** What saving means here, "Save group". A verb phrase, because it is a promise to act. */
  children: string;
  /** True while the submission is in flight. Swaps the label and blocks a second click. */
  pending: boolean;
  /** Blocks the action for a reason of the form's own, such as a required field still empty. */
  disabled?: boolean;
  /** Shown in place of `children` while pending. Override only when "Saving…" would be a lie. */
  pendingLabel?: string;
  /** Associates the action with a form elsewhere in the page, such as a PageLayout toolbar. */
  form?: string;
  /** Optional glyph placed before the action label. */
  icon?: ReactNode;
  size?: ButtonProps['size'];
}

/**
 * Commits a form.
 *
 * Callers own when it may fire and what it says;
 * this owns the primary accent and the progress label that blocks a second submission while saving.
 *
 * Distinct from `CallToAction`, which starts a journey by navigating and therefore needs a `renderRoot`;
 * this one submits the form it sits in and needs no route at all.
 */
export function SubmitAction({
  children,
  pending,
  disabled = false,
  pendingLabel = 'Saving…',
  form,
  icon,
  size,
}: SubmitActionProps) {
  return (
    <Button
      type="submit"
      form={form}
      variant="filled"
      color="cta"
      size={size}
      leftSection={icon}
      loading={pending}
      disabled={disabled || pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
