import type { z } from 'zod';

/**
 * Incoming data no longer matches this bundle's compiled expectations — the stale-tab signal. Rendered by the router's
 * error component as a refresh prompt instead of a crash.
 */
export class StaleClientDataError extends Error {
  constructor(context: string, options?: { cause?: unknown }) {
    super(`${context} does not match this version of the app`, options);
    this.name = 'StaleClientDataError';
  }
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
