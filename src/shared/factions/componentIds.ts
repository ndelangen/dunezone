/**
 * Shared mechanics for a faction's component identities (#1227): leaders carry `memberId`, troop types `troopId`.
 * These UUIDs identify components;
 * they are not credentials.
 */

/** Convex supplies deterministic randomness during mutation retries. */
export function createComponentId(): string {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (digit) =>
    (Number(digit) ^ (Math.floor(Math.random() * 16) >> (Number(digit) / 4))).toString(16)
  );
}

export function assertUniqueIds(ids: ReadonlyArray<string | undefined>, message: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === undefined) {
      continue;
    }
    if (seen.has(id)) {
      throw new Error(message);
    }
    seen.add(id);
  }
}

/** Returns an allocator that never repeats an identity already taken or handed out. */
export function uniqueIdAllocator(taken: ReadonlyArray<string | undefined>, exhausted: string): () => string {
  const seen = new Set(taken.filter((id): id is string => id !== undefined));
  return () => {
    for (let attempt = 0; attempt < 128; attempt += 1) {
      const id = createComponentId();
      if (!seen.has(id)) {
        seen.add(id);
        return id;
      }
    }
    throw new Error(exhausted);
  };
}
