/**
 * Publishes every encoded raster variant to R2 through the publisher Worker, and proves parity with what production serves (#1888 step 4).
 *
 * `MEDIA_PUBLISH_TOKEN=… bun run media:publish` uploads the variants `/m` lacks.
 * With MEDIA_RELEASE_ID set it then writes that release's `prepared` record to the ledger, listing every variant the release serves.
 * `bun run media:publish --deployed` writes the release's `deployed` marker, which the Worker accepts only once the record exists.
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
import { fetchMedia, integrityMatches, storedState } from './lib/media-fetch';
import type { Fetched } from './lib/media-fetch';
import { checksumRecord, matchesRecord, planVariants } from './media-variants';
import type { ChecksumRecord, PlannedVariant } from './media-variants';
import { describeError } from './retry-transient';

const repoRoot = path.resolve(import.meta.dirname, '..');
const storeRoot = path.join(repoRoot, '.cache/media/local/v');
const origin = (process.env.MEDIA_ORIGIN ?? 'https://dune.zone').replace(/\/$/, '');
const verifyOnly = process.argv.includes('--verify');
const markDeployed = process.argv.includes('--deployed');
const token = process.env.MEDIA_PUBLISH_TOKEN;
const release = process.env.MEDIA_RELEASE_ID;
const CONCURRENCY = 8;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

if (!verifyOnly && !token) {
  console.error('MEDIA_PUBLISH_TOKEN is not set; pass --verify to check without publishing.');
  process.exit(1);
}
if (markDeployed && !release) {
  console.error('MEDIA_RELEASE_ID is not set; --deployed marks that release.');
  process.exit(1);
}

const lock = JSON.parse(readFileSync(path.join(repoRoot, 'media/raster.lock.json'), 'utf8')) as RasterLock;
const plan = Object.keys(lock)
  .sort((left, right) => left.localeCompare(right))
  .flatMap((key) => planVariants(key, lock[key], sharp.versions));

/** One stored variant and the record it must match everywhere. */
type Local = { variant: PlannedVariant; bytes: Uint8Array<ArrayBuffer>; record: ChecksumRecord };

/** The checksum record the store keeps beside a variant, read without its bytes. */
function storedRecord(variant: PlannedVariant): ChecksumRecord {
  return JSON.parse(readFileSync(path.join(storeRoot, `${variant.name}.sha256`), 'utf8')) as ChecksumRecord;
}

function local(variant: PlannedVariant): Local {
  const file = path.join(storeRoot, variant.name);
  const bytes = new Uint8Array(readFileSync(file));
  const record = storedRecord(variant);
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

/** Reports whether R2 already stores the variant, refusing one whose integrity headers disagree with the record. */
async function alreadyPublished(item: Local): Promise<boolean> {
  try {
    return storedState(await fetchVariant(item, { method: 'HEAD' }), item.record) === 'stored';
  } catch (error) {
    throw new Error(`${item.variant.name}: ${describeError(error)}`);
  }
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

/** Writes one ledger object through the Worker and checks its receipt. */
async function writeLedger(pathname: string, body: string): Promise<{ object: string; created: boolean }> {
  const fetched = await fetchMedia(
    `${origin}${pathname}`,
    { method: 'PUT', body, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    { subject: pathname, delaysMs: RETRY_DELAYS_MS }
  );
  const text = new TextDecoder().decode(fetched.bytes);
  if (fetched.status !== 201 && fetched.status !== 200) {
    throw new Error(`${pathname} answered ${fetched.status} ${text}`);
  }
  return JSON.parse(text) as { object: string; created: boolean };
}

if (markDeployed) {
  const receipt = await writeLedger(`/__media/releases/${release}/deployed`, '');
  console.log(JSON.stringify({ origin, mode: 'deployed', release, ...receipt }));
  process.exit(0);
}

/** The prepared record lists every variant in plan order, so a repeated run sends identical bytes. */
function releaseRecord(items: { variant: PlannedVariant; record: ChecksumRecord }[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    release,
    state: 'prepared',
    variants: items.map(({ variant, record }) => ({
      name: variant.name,
      key: variant.key,
      source: lock[variant.key].sha256,
      sha256: record.sha256,
      bytes: record.bytes,
    })),
  });
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
/* The record is written only after every variant it lists is in R2. */
if (!verifyOnly && release) {
  const receipt = await writeLedger(
    `/__media/releases/${release}`,
    releaseRecord(plan.map((variant) => ({ variant, record: storedRecord(variant) })))
  );
  console.log(JSON.stringify({ origin, mode: 'prepared', release, ...receipt }));
}
