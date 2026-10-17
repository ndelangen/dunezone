/**
 * Renders a stored value so that two equal values render identically, whatever order their keys were written in.
 *
 * Keys sort by code unit rather than by `localeCompare`, which is collation: it answers with the host's ICU data and may call two distinct strings equal, and a comparator that returns 0 for distinct keys leaves their relative order to whichever one was inserted first.
 * That would let one value out-sort its own twin.
 * A key whose value is `undefined` is left out, because Convex cannot store one, so the stored copy of a value never carries it.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
