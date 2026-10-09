/**
 * Publishes every encoded raster variant to R2 through the publisher Worker, and proves parity with what production serves (#1888 step 4).
 *
 * `MEDIA_PUBLISH_TOKEN=… bun run media:publish` uploads the variants `/m` lacks.
 * `bun run media:publish --verify` needs no token: it downloads every variant from `/m` and from its legacy static URL and checks both against the local checksum record.
 *
 * The bytes come from the store `generate:images` fills (`.cache/media/local/v`), so run that first.
 * MEDIA_ORIGIN picks the Worker, https://dune.zone by default.
 * The Worker creates a variant only if it is absent and answers 409 when a stored one differs, so a run can be repeated or resumed at any point.
 * 429, 5xx and connection errors are retried as transport, not as findings.
 * Any other refusal fails that variant and the run.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import type { RasterLock } from '../src/shared/media/rasterLock';
import { fetchMedia, integrityMatches } from './lib/media-fetch';
import type { Fetched } from './lib/media-fetch';
import { checksumRecord, matchesRecord, planVariants } from './media-variants';
import type { ChecksumRecord, PlannedVariant } from './media-variants';
import { describeError } from './retry-transient';

const repoRoot = path.resolve(import.meta.dirname, '..');
const storeRoot = path.join(repoRoot, '.cache/media/local/v');
const origin = (process.env.MEDIA_ORIGIN ?? 'https://dune.zone').replace(/\/$/, '');
const verifyOnly = process.argv.includes('--verify');
const token = process.env.MEDIA_PUBLISH_TOKEN;
const CONCURRENCY = 8;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

if (!verifyOnly && !token) {
  console.error('MEDIA_PUBLISH_TOKEN is not set; pass --verify to check without publishing.');
  process.exit(1);
}

const lock = JSON.parse(readFileSync(path.join(repoRoot, 'media/raster.lock.json'), 'utf8')) as RasterLock;
const plan = Object.keys(lock)
  .sort((left, right) => left.localeCompare(right))
  .flatMap((key) => planVariants(key, lock[key], sharp.versions));

/** One stored variant and the record it must match everywhere. */
type Local = { variant: PlannedVariant; bytes: Uint8Array<ArrayBuffer>; record: ChecksumRecord };

function local(variant: PlannedVariant): Local {
  const file = path.join(storeRoot, variant.name);
  const bytes = new Uint8Array(readFileSync(file));
  const record = JSON.parse(readFileSync(`${file}.sha256`, 'utf8')) as ChecksumRecord;
  if (!matchesRecord(bytes, record)) {
    throw new Error(`${variant.name}: the stored bytes do not match their record; run \`bun run generate:images\``);
  }
  return { variant, bytes, record };
}

function fetchVariant(item: Local, init: RequestInit = {}) {
  return fetchMedia(`${origin}/m/${item.variant.name}`, init, {
    subject: item.variant.name,
    delaysMs: RETRY_DELAYS_MS,
  });
}

type Outcome = 'present' | 'published' | 'verified';

/** Reports whether `/m` already serves the variant, refusing one whose integrity headers disagree with the record. */
async function alreadyPublished(item: Local): Promise<boolean> {
  const head = await fetchVariant(item, { method: 'HEAD' });
  if (head.status === 404) {
    return false;
  }
  if (head.status !== 200 || !integrityMatches(head.headers, item.record)) {
    throw new Error(`${item.variant.name}: HEAD answered ${head.status} with integrity that disagrees with the record`);
  }
  return true;
}

async function publish(item: Local): Promise<Outcome> {
  if (await alreadyPublished(item)) {
    return 'present';
  }
  const put = await fetchVariant(item, {
    method: 'PUT',
    body: item.bytes,
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = new TextDecoder().decode(put.bytes);
  if (put.status !== 201 && put.status !== 200) {
    throw new Error(`${item.variant.name}: publishing answered ${put.status} ${text}`);
  }
  const receipt = JSON.parse(text) as { sha256?: string; bytes?: number };
  if (receipt.sha256 !== item.record.sha256 || receipt.bytes !== item.record.bytes) {
    throw new Error(`${item.variant.name}: the receipt ${text} disagrees with the local record`);
  }
  return 'published';
}

/** Proves `/m` and the legacy static URL both serve exactly the bytes the store recorded. */
/** True for a 200 whose body is exactly the recorded bytes. */
function servedIntact(fetched: Fetched, record: ChecksumRecord): boolean {
  return fetched.status === 200 && matchesRecord(fetched.bytes, record);
}

async function verify(item: Local): Promise<Outcome> {
  const { name, legacyPath } = item.variant;
  const variant = await fetchVariant(item);
  const headersMatch = integrityMatches(variant.headers, item.record);
  if (!servedIntact(variant, item.record) || !headersMatch) {
    throw new Error(`${name}: /m answered ${variant.status} with ${JSON.stringify(checksumRecord(variant.bytes))}`);
  }
  const legacy = await fetchMedia(`${origin}/${legacyPath}`, {}, { subject: name, delaysMs: RETRY_DELAYS_MS });
  if (!servedIntact(legacy, item.record)) {
    throw new Error(`${name}: /${legacyPath} answered ${legacy.status} with different bytes from /m`);
  }
  return 'verified';
}

/* Two keys can share a variant name. Publishing sends each name once, and verifying probes every legacy path. */
const queue = verifyOnly ? [...plan] : [...new Map(plan.map((variant) => [variant.name, variant])).values()];
const counts: Record<Outcome | 'failed', number> = { present: 0, published: 0, verified: 0, failed: 0 };
async function worker() {
  for (let next = queue.shift(); next; next = queue.shift()) {
    try {
      counts[await (verifyOnly ? verify : publish)(local(next))] += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(describeError(error));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(JSON.stringify({ origin, mode: verifyOnly ? 'verify' : 'publish', variants: plan.length, ...counts }));
if (counts.failed > 0) {
  process.exit(1);
}
