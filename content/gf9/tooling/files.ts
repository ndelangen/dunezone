import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { z } from 'zod';

import type { DataPath } from './contracts';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const valueHash = (value: unknown) => sha256(canonical(value));
export const pretty = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(JSON.parse(await readFile(file, 'utf8')));
}
export async function fileHash(file: string) {
  return sha256(await readFile(file));
}
export const RASTER_LOCK_INPUT = '../../media/raster.lock.json';
/** The raster lock is the only project input outside the GF9 content directory. */
export async function projectInputFile(root: string, relative: string) {
  if (relative !== RASTER_LOCK_INPUT) {
    return inside(root, relative);
  }
  const repository = path.resolve(root, '../..');
  if (path.relative(repository, root) !== path.join('content', 'gf9')) {
    throw new Error('Use the repository content/gf9 directory to read its raster lock.');
  }
  return inside(repository, 'media/raster.lock.json');
}
export async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, pretty(value), { flag: 'wx' });
  await rename(temporary, file);
}
/** Tool writes stay inside the declared GF9 directory, including through symlinks. */
export async function inside(root: string, relative: string, write = false) {
  if (path.isAbsolute(relative)) {
    throw new Error(`Use a path relative to the GF9 directory: ${relative}`);
  }
  const target = path.resolve(root, relative);
  if (target === root || !target.startsWith(root + path.sep)) {
    throw new Error(`Path leaves the GF9 directory: ${relative}`);
  }
  let existing = write ? path.dirname(target) : target;
  while (true) {
    try {
      const actual = await realpath(existing);
      if (actual !== root && !actual.startsWith(root + path.sep)) {
        throw new Error(`Symlink leaves the GF9 directory: ${relative}`);
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(existing);
      if (parent === existing) {
        throw error;
      }
      existing = parent;
    }
  }
  return target;
}
export function at(value: unknown, parts: DataPath): unknown {
  let cursor = value;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, part)) {
      throw new Error(`Missing typed path ${parts.join('.')}`);
    }
    cursor = (cursor as Record<string | number, unknown>)[part];
  }
  return cursor;
}
export function put(value: unknown, parts: DataPath, replacement: unknown) {
  const parent = parts.length === 1 ? value : at(value, parts.slice(0, -1));
  if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, parts.at(-1)!)) {
    throw new Error(`Missing typed path ${parts.join('.')}`);
  }
  (parent as Record<string | number, unknown>)[parts.at(-1)!] = replacement;
}
export function differences(before: unknown, after: unknown, prefix = '$'): string[] {
  if (canonical(before) === canonical(after)) {
    return [];
  }
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) =>
        differences(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
          `${prefix}.${key}`
        )
      );
  }
  return [prefix];
}
