import { Alert, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

export interface FormErrorProps {
  /** What failed, as the reader would say it, "Ruleset could not be saved". */
  title: string;
  /** The reason, usually a message off the rejected mutation. */
  children: string;
  /** The way out, when the reader has to choose before anything can be saved, "Keep my settings" beside "Use saved settings". */
  action?: ReactNode;
}

/**
 * Says that an action did not happen, and why.
 *
 * Callers own both sentences and decide when there is anything to say at all.
 * Render this only when an attempt actually failed, never as an empty placeholder.
 * This owns the treatment: the alert colour, and the live region that makes a screen reader announce the failure the moment it appears.
 *
 * It is a Block rather than a Surface even though it paints: it is handed words and nothing else, so the colour is content telling you something went wrong, not a pane for content to sit on.
 * The one exception is `action`, for a failure the reader resolves on the spot, and it sits under the words.
 * It exists because the same failure was previously rendered three ways (inside a field, as an alert, and as a bare paragraph), so whether a save failure was announced at all depended on which form you were on.
 * A red Alert outside the kit is a lint error (`local/form-error`), so it stays one way.
 */
export function FormError({ title, children, action }: FormErrorProps) {
  return (
    <Alert color="red" title={title} role="alert">
      {action ? (
        <Stack gap="sm">
          {children}
          {action}
        </Stack>
      ) : (
        children
      )}
    </Alert>
  );
}
