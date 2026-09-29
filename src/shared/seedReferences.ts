/*
 * How a seed database names rows before they have ids.
 * The Storybook worker and the local fixture seed in `convex/provisioning.ts` both insert the
 * page-story baseline, so both resolve its references here.
 */

/** The characters `refText` replaces with the resolved id, chosen so `encodeURIComponent` leaves them alone. */
export const SEED_REF_TOKEN = '__seed_ref__';

/* A bare reference resolves to the id; one carrying `$seedText` resolves to that text with the token replaced. */
export type SeedReference = { $seedRef: string; $seedText?: string };

function resolveSeedObject(value: Record<string, unknown>, ids: ReadonlyMap<string, string>) {
  if (typeof value.$seedRef === 'string') {
    const resolved = ids.get(value.$seedRef);
    if (!resolved) {
      throw new Error(`Unknown seed reference: ${value.$seedRef}`);
    }
    if (typeof value.$seedText === 'string') {
      return value.$seedText.replaceAll(SEED_REF_TOKEN, resolved);
    }
    return resolved;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSeedValue(item, ids)]));
}

/** Replaces every seed reference in a value with the id inserted under its key. */
export function resolveSeedValue(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveSeedValue(item, ids));
  }
  if (value instanceof ArrayBuffer) {
    return value;
  }
  return resolveSeedObject(value as Record<string, unknown>, ids);
}
