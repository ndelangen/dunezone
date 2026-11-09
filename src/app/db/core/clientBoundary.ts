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
 * What Convex answers when a tab asks for a function the deployment no longer has.
 * The server writes it and `convex/react` wraps it into the thrown message, so it is matched as a substring.
 */
const MISSING_FUNCTION = 'Could not find public function';

/**
 * How Chrome, Firefox and Safari word a dynamic import that failed, and how Vite words a CSS preload that did.
 * After a deploy that is a chunk this tab's bundle names and the server no longer has.
 */
const MISSING_CHUNK =
  /^(?:Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS)/u;

/**
 * Whether a caught error is the stale-tab signal, and so wants a refresh rather than a red alert.
 * Three errors mean it: data that fails this bundle's schema, a call to a Convex function a later release deleted, which a tab opened before that release still makes (see AGENTS.md on expand/contract), and a chunk a later deploy removed.
 * The tab reloads itself for a missing chunk (`staleBundleReload`);
 * this is what the reader sees when that reload was already spent.
 *
 * One owner for the question, because it is asked from two places that cannot share an answer's presentation: the router's error component renders outside `MantineProvider` and styles itself inline, while a route's own error component renders inside it.
 * Five route error components used to skip the question entirely and show the message with no way forward (#700).
 */
export function isStaleClientData(error: unknown): boolean {
  return (
    error instanceof StaleClientDataError ||
    (error instanceof Error && (error.message.includes(MISSING_FUNCTION) || MISSING_CHUNK.test(error.message)))
  );
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
