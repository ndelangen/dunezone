import type { GameSnapshot } from '../../src/shared/play/protocol';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Patch = { path: string[]; value?: Json; remove?: true };
const object = (value: Json): value is Record<string, Json> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Ordered arrays are replaced together. Only server-produced patches are stored.
export function diff(base: GameSnapshot, next: GameSnapshot): Patch[] {
  return visit(base as Json, next as Json, []);
}

function visit(a: Json, b: Json, path: string[]): Patch[] {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return [];
  }
  if (!object(a) || !object(b)) {
    return [{ path, value: b }];
  }
  const removals: Patch[] = Object.keys(a)
    .filter((key) => !Object.hasOwn(b, key))
    .map((key) => ({ path: [...path, key], remove: true }));
  const changes = Object.keys(b).flatMap((key) =>
    Object.hasOwn(a, key) ? visit(a[key], b[key], [...path, key]) : [{ path: [...path, key], value: b[key] }]
  );
  return [...removals, ...changes];
}

export function applyPatch(base: GameSnapshot, patches: Patch[]): GameSnapshot {
  let result: Json = structuredClone(base) as Json;
  for (const patch of patches) {
    if (patch.path.length === 0) {
      result = structuredClone(patch.value!);
      continue;
    }
    let parent = result as Record<string, Json>;
    for (const key of patch.path.slice(0, -1)) {
      parent = parent[key] as Record<string, Json>;
    }
    const key = patch.path.at(-1)!;
    if (patch.remove) {
      delete parent[key];
    } else {
      parent[key] = structuredClone(patch.value!);
    }
  }
  return result as GameSnapshot;
}
