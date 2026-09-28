/**
 * Shared mechanics for a faction's component identities (#1227): leaders carry `memberId`, troop types `troopId`.
 * These UUIDs identify components;
 * they are not credentials.
 */

/** A version 4 UUID from the platform CSPRNG; each save allocates inside its own transaction. */
export function createComponentId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
