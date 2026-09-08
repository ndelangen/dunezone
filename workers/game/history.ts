import type { GameSnapshot } from '../../src/shared/play/protocol';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Patch = { path: string[]; value?: Json; remove?: true };
const object = (value: Json): value is Record<string, Json> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Ordered arrays are replaced together. Only server-produced patches are stored.
export function diff(base: GameSnapshot, next: GameSnapshot): Patch[] {
  const patches: Patch[] = [];
  function visit(a: Json, b: Json, path: string[]) {
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return;
    }
    if (object(a) && object(b)) {
      for (const key of Object.keys(a)) {
        if (!Object.hasOwn(b, key)) {
          patches.push({ path: [...path, key], remove: true });
        }
      }
      for (const key of Object.keys(b)) {
        if (!Object.hasOwn(a, key)) {
          patches.push({ path: [...path, key], value: b[key] });
        } else {
          visit(a[key], b[key], [...path, key]);
        }
      }
    } else {
      patches.push({ path, value: b });
    }
  }
  visit(base as Json, next as Json, []);
  return patches;
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
