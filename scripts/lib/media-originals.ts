/**
 * Moves raster originals between a checkout and R2 through the publisher's ingest at `/__media/src/<sha256>` (#1888).
 * `media:backfill` and `media:sync` share it.
 *
 * MEDIA_ORIGIN picks the Worker: https://dune.zone by default, or a local one on localhost.
 * Reads need no token, and uploads take MEDIA_UPLOAD_TOKEN.
 * Ingest creates an object only if it is absent, so every operation can be repeated.
 */
import { createHash } from 'node:crypto';

import type { RasterLock, RasterLockEntry } from '../../src/shared/media/rasterLock';
import { fetchMedia, integrityMatches } from './media-fetch';

/* Uploads carry the upload token, so the origin is limited to production and a local Worker. */
const TRUSTED_ORIGINS = new Map([
  ['dune.zone', ['https:']],
  ['localhost', ['http:', 'https:']],
  ['127.0.0.1', ['http:', 'https:']],
]);

function trustedOrigin(value: string): string {
  const url = new URL(value);
  if (!TRUSTED_ORIGINS.get(url.hostname)?.includes(url.protocol)) {
    throw new Error(`MEDIA_ORIGIN must be https://dune.zone or a local Worker, not ${value}`);
  }
  return url.origin;
}

export const mediaOrigin = trustedOrigin(process.env.MEDIA_ORIGIN ?? 'https://dune.zone');
const RETRY_DELAYS_MS = [2000, 4000, 8000];

/** One original the lock lists, under the first key that names it. */
export type Original = { hash: string; key: string; entry: RasterLockEntry };

/** Each distinct original once, under the first key that names it: two keys can share an original, and R2 holds it once. */
export function distinctOriginals(lock: RasterLock, keys: readonly string[] = Object.keys(lock)): Original[] {
  const byHash = new Map<string, Original>();
  for (const key of keys) {
    const entry = lock[key];
    if (!byHash.has(entry.sha256)) {
      byHash.set(entry.sha256, { hash: entry.sha256, key, entry });
    }
  }
  return [...byHash.values()];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fetchSource(original: Original, init: RequestInit = {}) {
  return fetchMedia(`${mediaOrigin}/__media/src/${original.hash}`, init, {
    subject: original.key,
    delaysMs: RETRY_DELAYS_MS,
  });
}

/** Refuses the original with the reason unless the condition holds. */
function demand(condition: boolean, original: Original, reason: string): void {
  if (!condition) {
    throw new Error(`${original.key}: ${reason}`);
  }
}

function integrity(original: Original) {
  return { sha256: original.hash, bytes: original.entry.bytes };
}

/** Reports whether R2 already holds the original, refusing one whose integrity headers disagree with the lock. */
async function alreadyStored(original: Original): Promise<boolean> {
  const head = await fetchSource(original, { method: 'HEAD' });
  if (head.status === 404) {
    return false;
  }
  demand(head.status === 200, original, `HEAD answered ${head.status}`);
  demand(
    integrityMatches(head.headers, integrity(original)),
    original,
    `R2 holds an object at ${original.hash} whose integrity headers disagree with the lock`
  );
  return true;
}

function checkReceipt(text: string, original: Original): void {
  const { sha256: hash, bytes, width, height, format } = JSON.parse(text) as Record<string, unknown>;
  const actual = { sha256: hash, bytes, width, height, format };
  const { entry } = original;
  const expected = {
    sha256: original.hash,
    bytes: entry.bytes,
    width: entry.width,
    height: entry.height,
    format: entry.format,
  };
  demand(
    JSON.stringify(actual) === JSON.stringify(expected),
    original,
    `the receipt ${JSON.stringify(actual)} disagrees with the lock ${JSON.stringify(expected)}`
  );
}

/** Uploads the original unless R2 already holds it, and checks the ingest receipt against the lock entry. */
export async function upload(
  original: Original,
  bytes: Uint8Array<ArrayBuffer>,
  token: string
): Promise<'present' | 'uploaded'> {
  demand(sha256(bytes) === original.hash, original, 'the bytes do not match the lock entry');
  if (await alreadyStored(original)) {
    return 'present';
  }
  const put = await fetchSource(original, {
    method: 'PUT',
    body: bytes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
  });
  const text = new TextDecoder().decode(put.bytes);
  demand(put.status === 201 || put.status === 200, original, `ingest answered ${put.status} ${text}`);
  checkReceipt(text, original);
  return 'uploaded';
}

/** Downloads the original and proves its bytes and integrity headers match the lock. */
export async function download(original: Original): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetchSource(original);
  demand(response.status === 200, original, `GET answered ${response.status}`);
  demand(sha256(response.bytes) === original.hash, original, 'the bytes R2 served do not match the lock');
  demand(
    integrityMatches(response.headers, integrity(original)),
    original,
    'the integrity headers do not match the lock'
  );
  return response.bytes;
}

/** Runs the task over the items a few at a time and counts each outcome, logging and counting each failure. */
export async function eachWithCounts<Item, Outcome extends string>(
  items: readonly Item[],
  task: (item: Item) => Promise<Outcome>,
  concurrency = 4
): Promise<Partial<Record<Outcome | 'failed', number>>> {
  const counts: Partial<Record<Outcome | 'failed', number>> = {};
  const queue = [...items];
  const bump = (outcome: Outcome | 'failed') => {
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  };
  async function worker() {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      try {
        bump(await task(next));
      } catch (error) {
        bump('failed');
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return counts;
}
