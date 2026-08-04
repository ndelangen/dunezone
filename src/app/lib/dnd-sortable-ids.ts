/** Stable string ids for dnd-kit `SortableContext` items built from array index. */
export function getSortableIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

/** Parse index from a `getSortableIds` id, or `null` if the id does not match the prefix. */
export function indexFromSortableId(id: string | number, prefix: string): number | null {
  if (typeof id !== 'string' || !id.startsWith(prefix)) {
    return null;
  }
  const parsed = Number.parseInt(id.slice(prefix.length), 10);
  return Number.isNaN(parsed) ? null : parsed;
}
