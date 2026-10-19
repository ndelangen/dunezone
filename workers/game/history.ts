import type { GameSnapshot } from '../../src/shared/play/protocol';
import type { StoredSnapshot } from './state';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Patch = { path: string[]; value?: Json; remove?: true };
const object = (value: Json): value is Record<string, Json> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/*
 * Only server-produced patches are stored. An array changes element by element when that is smaller than the whole array:
 * a changed element by its index, an added one at its new index and a shorter array by its `length`.
 * These are the same set operations `applyPatch` has always read, so a room rolled back to an older release still restores them.
 */
export function diff(base: GameSnapshot | StoredSnapshot, next: GameSnapshot | StoredSnapshot): Patch[] {
  return visit(base as Json, next as Json, []);
}

function visit(a: Json, b: Json, path: string[]): Patch[] {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return [];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return elements(a, b, path);
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

function elements(a: Json[], b: Json[], path: string[]): Patch[] {
  const whole: Patch[] = [{ path, value: b }];
  const patches = b.flatMap((entry, index) =>
    index < a.length
      ? visit(a[index], entry, [...path, String(index)])
      : [{ path: [...path, String(index)], value: entry }]
  );
  if (b.length < a.length) {
    patches.push({ path: [...path, 'length'], value: b.length });
  }
  return JSON.stringify(patches).length < JSON.stringify(whole).length ? patches : whole;
}

export function applyPatch<Snapshot extends GameSnapshot | StoredSnapshot>(base: Snapshot, patches: Patch[]): Snapshot {
  return applyPatchInPlace(
    structuredClone(base),
    patches.map((patch) => structuredClone(patch))
  );
}

/**
 * `applyPatch` without its copies: `target` is changed and returned, and the patches' values become part of it.
 * Only for a target and patches nothing else holds, such as a restore's freshly read rows.
 */
export function applyPatchInPlace<Snapshot extends GameSnapshot | StoredSnapshot>(
  target: Snapshot,
  patches: Patch[]
): Snapshot {
  let result = target as Json;
  for (const patch of patches) {
    if (patch.path.length === 0) {
      result = patch.value!;
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
      parent[key] = patch.value!;
    }
  }
  return result as Snapshot;
}
