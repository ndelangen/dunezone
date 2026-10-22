/* oxlint-disable no-restricted-imports -- This is the read-only function-builder boundary. */
import { query as rawQuery } from './_generated/server';

/**
 * Which builder a client-callable query was made with.
 * `convex/queryAudience.architecture.test.ts` reads it to hold every query to its declared audience.
 */
export const QUERY_AUDIENCE = Symbol.for('dunezone.queryAudience');
export type QueryAudience = 'public' | 'viewer' | 'admin';

/** Marks a registered query while preserving its builder signature. */
export function withAudience<Builder extends (...args: never[]) => unknown>(
  audience: QueryAudience,
  builder: Builder
): Builder {
  return ((...args: Parameters<Builder>) => {
    const registered = builder(...args) as object;
    Object.defineProperty(registered, QUERY_AUDIENCE, { value: audience });
    return registered;
  }) as Builder;
}

/** A viewer query registers without loading mutation triggers. */
export const viewerQuery = withAudience('viewer', rawQuery);
