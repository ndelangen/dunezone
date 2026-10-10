/**
 * Orders strings by UTF-16 code unit, the same order `Array.prototype.sort()` uses with no comparator.
 * Passing it explicitly keeps that order and says so, rather than leaving the default to look like an oversight.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
