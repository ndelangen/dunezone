const COUNTER_PROBES = 4;
const RANDOM_PROBES = 2;

function randomSuffix() {
  const words = crypto.getRandomValues(new Uint32Array(2));
  const value = (BigInt(words[0]!) << 32n) | BigInt(words[1]!);
  return value.toString(36).padStart(13, '0');
}

/**
 * Selection makes at most seven availability checks, including the plain base.
 * The caller owns normalization, policy, indexed absence reads and the transaction that claims the result.
 * Rejected candidates consume the same budget as occupied candidates.
 * Arbitrary name endings never determine a cursor.
 */
export async function selectSlug({
  base,
  nextSuffix,
  available,
  accept,
}: {
  base: string;
  nextSuffix: number;
  available: (slug: string) => Promise<boolean>;
  accept?: (slug: string) => boolean;
}): Promise<{ slug: string; nextSuffix: number | null } | null> {
  async function usable(slug: string) {
    return (accept?.(slug) ?? true) && (await available(slug));
  }
  if (await usable(base)) {
    return { slug: base, nextSuffix: null };
  }
  /* Exhausted or unsafe cursors recover through random candidates without unsafe arithmetic. */
  let next = Number.isSafeInteger(nextSuffix) && nextSuffix >= 1 ? nextSuffix : Number.MAX_SAFE_INTEGER;
  for (let probe = 0; probe < COUNTER_PROBES && next < Number.MAX_SAFE_INTEGER; probe += 1) {
    const candidate = `${base}-${next.toString(36)}`;
    next += 1;
    if (await usable(candidate)) {
      return { slug: candidate, nextSuffix: next };
    }
  }
  for (let probe = 0; probe < RANDOM_PROBES; probe += 1) {
    const candidate = `${base}-${randomSuffix()}`;
    if (await usable(candidate)) {
      return { slug: candidate, nextSuffix: next };
    }
  }
  return null;
}
