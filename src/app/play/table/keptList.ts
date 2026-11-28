import { useState } from 'react';

/* Two records hold the same fields when each key names the same value in both. */
function sameFields(a: object, b: object) {
  if (Object.is(a, b)) {
    return true;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key as keyof typeof a], b[key as keyof typeof b]))
  );
}

/**
 * The list given, keeping each entry from an earlier render while its fields are the same, and the whole earlier list while every entry is.
 * The table hands out a new projection on every update, so a list derived from it is new each time even when nothing it lists changed.
 * Kept, it lets the panels and tokens that show it skip that update.
 * Fields are compared by identity, so an entry's fields must be primitives or references the table keeps.
 * An entry built with a fresh object or array in a field never matches, and the list would be stored again on every render.
 */
export function useKeptList<T extends object>(items: readonly T[]): readonly T[] {
  const [kept, keep] = useState(items);
  const next = items.map((item, index) => {
    const before = kept[index];
    return before !== undefined && sameFields(before, item) ? before : item;
  });
  const stable = next.length === kept.length && next.every((item, index) => item === kept[index]) ? kept : next;
  if (stable !== kept) {
    keep(stable);
  }
  return stable;
}
