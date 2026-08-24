import type { z } from 'zod';

/**
 * Incoming data no longer matches this bundle's compiled expectations, the stale-tab signal.
 * Rendered as a refresh prompt instead of a crash.
 *
 * Not exported: the throw is this module's and so is the question about it, so callers ask `isStaleClientData` rather than matching the class themselves.
 */
class StaleClientDataError extends Error {
  constructor(context: string, options?: { cause?: unknown }) {
    super(`${context} does not match this version of the app`, options);
    this.name = 'StaleClientDataError';
  }
}

/**
 * Whether a caught error is the stale-tab signal, and so wants a refresh rather than a red alert.
 *
 * One owner for the question, because it is asked from two places that cannot share an answer's presentation: the router's error component renders outside `MantineProvider` and styles itself inline, while a route's own error component renders inside it.
 * Five route error components used to skip the question entirely and show the message with no way forward (#700).
 */
export function isStaleClientData(error: unknown): boolean {
  return error instanceof StaleClientDataError;
}

/** Validate data entering the client runtime against this bundle's schema. */
export function parseClientBoundary<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  context: string
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StaleClientDataError(context, { cause: result.error });
  }
  return result.data as z.output<Schema>;
}
