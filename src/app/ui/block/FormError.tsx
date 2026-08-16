import { Alert } from '@mantine/core';

export interface FormErrorProps {
  /** What failed, as the reader would say it — "Ruleset could not be saved". */
  title: string;
  /** The reason, usually a message off the rejected mutation. */
  children: string;
}

/**
 * Says that an action did not happen, and why.
 * 
 * Callers own both sentences and decide when there is anything to say at all — render this only when an attempt actually failed, never as an empty placeholder.
 * This owns the treatment: the alert colour, and the live region that makes a screen reader announce the failure the moment it appears.
 * 
 * It is a Block rather than a Surface even though it paints: it is handed words and nothing else, so the colour is content telling you something went wrong, not a pane for content to sit on.
 * It exists because the same failure was previously rendered three ways — inside a field, as an alert, and as a bare paragraph — so whether a save failure was announced at all depended on which form you were on.
 */
export function FormError({ title, children }: FormErrorProps) {
  return (
    <Alert color="red" title={title} role="alert">
      {children}
    </Alert>
  );
}
