/* A value built from some keys, kept while every key stays the same, so whoever holds it sees no new identity. */
export type Cached<T> = { keys: readonly unknown[]; value: T };

export function cachedBy<T>(cached: Cached<T> | undefined, keys: readonly unknown[], build: () => T): Cached<T> {
  const same = cached && cached.keys.length === keys.length && cached.keys.every((key, at) => key === keys[at]);
  return same ? cached : { keys, value: build() };
}
