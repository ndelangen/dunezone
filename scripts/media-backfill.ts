/**
 * Copies every raster original the lock lists into R2 through the publisher's ingest, and proves the copy (#1888 step 0).
 *
 * `MEDIA_UPLOAD_TOKEN=… bun run media:backfill` uploads what R2 lacks.
 * An original already there is checked, not sent again.
 * `bun run media:backfill --verify` downloads every original back and compares it with the lock.
 * It needs no token.
 *
 * MEDIA_ORIGIN picks the Worker, https://dune.zone by default.
 * The bytes come from the git checkout and must match the lock first, so a stale lock stops the run before anything is sent.
 * Ingest creates an object only if it is absent, so a run can be repeated or resumed at any point.
 * 429, 5xx and connection errors are retried as transport, not as findings.
 * Any other refusal fails that original and the run.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { RasterLock, RasterLockEntry } from '../src/shared/media/rasterLock';
import { fetchMedia, integrityMatches } from './lib/media-fetch';
import { describeError } from './retry-transient';

const repoRoot = path.resolve(import.meta.dirname, '..');
const origin = (process.env.MEDIA_ORIGIN ?? 'https://dune.zone').replace(/\/$/, '');
const verifyOnly = process.argv.includes('--verify');
const token = process.env.MEDIA_UPLOAD_TOKEN;
const CONCURRENCY = 4;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

if (!verifyOnly && !token) {
  console.error('MEDIA_UPLOAD_TOKEN is not set; pass --verify to check without uploading.');
  process.exit(1);
}

const lock = JSON.parse(readFileSync(path.join(repoRoot, 'media/raster.lock.json'), 'utf8')) as RasterLock;

/* Two keys can share an original; R2 holds it once. */
const byHash = new Map<string, { key: string; entry: RasterLockEntry }>();
for (const [key, entry] of Object.entries(lock)) {
  if (!byHash.has(entry.sha256)) {
    byHash.set(entry.sha256, { key, entry });
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

type Outcome = 'present' | 'uploaded' | 'verified';

/** One original the lock lists, under the first key that names it. */
type Original = { hash: string; key: string; entry: RasterLockEntry };

function sourceUrl(original: Original): string {
  return `${origin}/__media/src/${original.hash}`;
}

function fetchSource(original: Original, init: RequestInit = {}) {
  return fetchMedia(sourceUrl(original), init, { subject: original.key, delaysMs: RETRY_DELAYS_MS });
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
  if (head.status !== 200) {
    throw new Error(`${original.key}: HEAD answered ${head.status}`);
  }
  if (!integrityMatches(head.headers, integrity(original))) {
    throw new Error(
      `${original.key}: R2 holds an object at ${original.hash} whose integrity headers disagree with the lock`
    );
  }
  return true;
}

function checkedOutBytes(original: Original): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(readFileSync(path.join(repoRoot, 'media', original.key)));
  if (sha256(bytes) !== original.hash) {
    throw new Error(`${original.key}: the checked-out bytes do not match the lock; run \`bun run media:lock\``);
  }
  return bytes;
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${original.key}: the receipt ${JSON.stringify(actual)} disagrees with the lock ${JSON.stringify(expected)}`
    );
  }
}

async function backfill(original: Original): Promise<Outcome> {
  if (await alreadyStored(original)) {
    return 'present';
  }
  const put = await fetchSource(original, {
    method: 'PUT',
    body: checkedOutBytes(original),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
  });
  const text = new TextDecoder().decode(put.bytes);
  if (put.status !== 201 && put.status !== 200) {
    throw new Error(`${original.key}: ingest answered ${put.status} ${text}`);
  }
  checkReceipt(text, original);
  return 'uploaded';
}

async function verify(original: Original): Promise<Outcome> {
  const response = await fetchSource(original);
  if (response.status !== 200) {
    throw new Error(`${original.key}: GET answered ${response.status}`);
  }
  if (sha256(response.bytes) !== original.hash) {
    throw new Error(`${original.key}: the bytes R2 served do not match the lock`);
  }
  if (!integrityMatches(response.headers, integrity(original))) {
    throw new Error(`${original.key}: the integrity headers do not match the lock`);
  }
  return 'verified';
}

const counts: Record<Outcome | 'failed', number> = { present: 0, uploaded: 0, verified: 0, failed: 0 };
const queue = [...byHash.entries()];
async function worker() {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [hash, { key, entry }] = next;
    try {
      counts[await (verifyOnly ? verify : backfill)({ hash, key, entry })] += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(describeError(error));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(JSON.stringify({ origin, mode: verifyOnly ? 'verify' : 'backfill', originals: byHash.size, ...counts }));
if (counts.failed > 0) {
  process.exit(1);
}
