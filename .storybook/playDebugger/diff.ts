/** One value that differs between two states, by its path from the root. */
export type Change = { path: string; before: unknown; after: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A path segment as it reads in code: `.key` for a name, `[index]` for an array entry or a key that is not a name. */
export const segment = (key: string | number) =>
  typeof key === 'number' ? `[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;

/**
 * The values that differ between two JSON states, deepest first found, up to `limit` of them.
 * An entry missing on one side reads as undefined there;
 * arrays compare by index.
 */
export function changes(before: unknown, after: unknown, limit = 300): Change[] {
  const found: Change[] = [];
  const walk = (left: unknown, right: unknown, path: string) => {
    if (found.length >= limit || Object.is(left, right)) {
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let index = 0; index < Math.max(left.length, right.length); index++) {
        walk(left[index], right[index], `${path}${segment(index)}`);
      }
      return;
    }
    if (isRecord(left) && isRecord(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        walk(left[key], right[key], `${path}${segment(key)}`);
      }
      return;
    }
    found.push({ path: path || '(root)', before: left, after: right });
  };
  walk(before, after, '');
  return found;
}
