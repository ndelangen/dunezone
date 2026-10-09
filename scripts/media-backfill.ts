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
import { TransientError, describeError, retryTransient } from './retry-transient';

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

async function request(url: string, init: RequestInit, subject: string): Promise<Response> {
  return await retryTransient(
    async () => {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (error) {
        throw new TransientError(describeError(error));
      }
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        throw new TransientError(`HTTP ${response.status}`);
      }
      return response;
    },
    { subject, delaysMs: RETRY_DELAYS_MS }
  );
}

type Outcome = 'present' | 'uploaded' | 'verified';

async function backfill(hash: string, key: string, entry: RasterLockEntry): Promise<Outcome> {
  const url = `${origin}/__media/src/${hash}`;
  const head = await request(url, { method: 'HEAD' }, key);
  if (head.ok) {
    if (head.headers.get('X-Media-SHA256') !== hash || head.headers.get('X-Media-Bytes') !== String(entry.bytes)) {
      throw new Error(`${key}: R2 holds an object at ${hash} whose integrity headers disagree with the lock`);
    }
    return 'present';
  }
  if (head.status !== 404) {
    throw new Error(`${key}: HEAD answered ${head.status}`);
  }
  const bytes = readFileSync(path.join(repoRoot, 'media', key));
  if (sha256(bytes) !== hash) {
    throw new Error(`${key}: the checked-out bytes do not match the lock; run \`bun run media:lock\``);
  }
  const put = await request(
    url,
    {
      method: 'PUT',
      body: bytes,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    },
    key
  );
  const text = await put.text();
  if (put.status !== 201 && put.status !== 200) {
    throw new Error(`${key}: ingest answered ${put.status} ${text}`);
  }
  const receipt = JSON.parse(text) as { sha256: string; bytes: number; width: number; height: number; format: string };
  const expected = { sha256: hash, bytes: entry.bytes, width: entry.width, height: entry.height, format: entry.format };
  const actual = {
    sha256: receipt.sha256,
    bytes: receipt.bytes,
    width: receipt.width,
    height: receipt.height,
    format: receipt.format,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${key}: the receipt ${JSON.stringify(actual)} disagrees with the lock ${JSON.stringify(expected)}`
    );
  }
  return 'uploaded';
}

async function verify(hash: string, key: string, entry: RasterLockEntry): Promise<Outcome> {
  const response = await request(`${origin}/__media/src/${hash}`, {}, key);
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`${key}: GET answered ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256(bytes) !== hash || bytes.byteLength !== entry.bytes) {
    throw new Error(`${key}: the bytes R2 served do not match the lock`);
  }
  if (
    response.headers.get('X-Media-SHA256') !== hash ||
    response.headers.get('X-Media-Bytes') !== String(entry.bytes)
  ) {
    throw new Error(`${key}: the integrity headers do not match the lock`);
  }
  return 'verified';
}

const counts: Record<Outcome | 'failed', number> = { present: 0, uploaded: 0, verified: 0, failed: 0 };
const queue = [...byHash.entries()];
async function worker() {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [hash, { key, entry }] = next;
    try {
      counts[await (verifyOnly ? verify : backfill)(hash, key, entry)] += 1;
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
