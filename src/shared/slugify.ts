/**
 * How a name becomes a URL slug, everywhere: the database derives stored slugs with it, and the editors derive candidate slugs from a draft name to warn about conflicts before a save is tried.
 * One implementation on the shared side of the fence, because a client-side copy that drifted would warn about the wrong slug.
 */
export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
