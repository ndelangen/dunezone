/**
 * The R2 media report (#1888 step 9): a dry run of the retention rules that lists what a collection could remove, and a check that every variant any release record lists is still stored at its published size, which fails the run when one is not.
 *
 * Bun run media:gc
 *
 * It lists `dunezone-media-src`, `dunezone-media` and `dunezone-media-releases` through the Cloudflare API, reads every release record, reads the lock on this checkout (main) and on every open pull request, and prints the plan.
 * It never deletes and has no code that could.
 * Any listing or read that fails or comes back incomplete stops the report with an error, so a plan is never made from partial data.
 *
 * Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (R2 read), and GITHUB_TOKEN with GITHUB_REPOSITORY for the pull request locks.
 */
import sharp from 'sharp';

import type { RasterLock } from '../src/shared/media/rasterLock';
import { ledgerProblems, missingVariants, planCollection } from './lib/media-gc';
import type { ReleaseVariant, StoredObject } from './lib/media-gc';
import { readRasterLock } from './lib/raster-lock';
import { planVariants } from './media-variants';
import { TransientError, describeError, retryTransient } from './retry-transient';

const SOURCE_BUCKET = 'dunezone-media-src';
const VARIANT_BUCKET = 'dunezone-media';
const RELEASE_BUCKET = 'dunezone-media-releases';
const RETRY_DELAYS_MS = [1000, 4000, 15_000];
const ATTEMPT_MS = 30_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const cloudflare = `https://api.cloudflare.com/client/v4/accounts/${required('CLOUDFLARE_ACCOUNT_ID')}/r2/buckets`;
const cloudflareToken = required('CLOUDFLARE_API_TOKEN');
const github = `https://api.github.com/repos/${required('GITHUB_REPOSITORY')}`;
const githubToken = required('GITHUB_TOKEN');

/** One GET under the transport retry policy, with 429 and 5xx retried and every other status returned. */
function get(url: string, headers: Record<string, string>): Promise<Response> {
  return retryTransient(
    async () => {
      let response: Response;
      try {
        response = await fetch(url, { headers, signal: AbortSignal.timeout(ATTEMPT_MS) });
      } catch (error) {
        throw new TransientError(describeError(error), { cause: error });
      }
      if (response.status === 429 || response.status >= 500) {
        throw new TransientError(`HTTP ${response.status}`);
      }
      return response;
    },
    { subject: `GET ${new URL(url).pathname}`, delaysMs: RETRY_DELAYS_MS }
  );
}

function cloudflareGet(pathname: string): Promise<Response> {
  return get(`${cloudflare}${pathname}`, { Authorization: `Bearer ${cloudflareToken}` });
}

type ListedObject = { key: string; size: number; last_modified: string };
type ListPage = {
  success?: boolean;
  result?: Partial<ListedObject>[];
  result_info?: { cursor?: string; is_truncated?: boolean };
};
type CompletePage = ListPage & { result: ListedObject[] };
/** One page request: the bucket, and the cursor the previous page returned. */
type Listing = { bucket: string; cursor?: string };

function isListedObject(item: Partial<ListedObject>): item is ListedObject {
  if (typeof item.key !== 'string') {
    return false;
  }
  if (typeof item.size !== 'number') {
    return false;
  }
  return typeof item.last_modified === 'string';
}

function isCompletePage(page: ListPage): page is CompletePage {
  return Array.isArray(page.result) && page.result.every(isListedObject);
}

/** One listing page, refused unless the request succeeded and every object has a key, size and upload time. */
async function readPage(listing: Listing): Promise<CompletePage> {
  const query = new URLSearchParams({ per_page: '1000', ...(listing.cursor ? { cursor: listing.cursor } : {}) });
  const response = await cloudflareGet(`/${listing.bucket}/objects?${query}`);
  if (!response.ok) {
    throw new Error(`Listing ${listing.bucket} failed with HTTP ${response.status}`);
  }
  const page = (await response.json()) as ListPage;
  if (page.success !== true) {
    throw new Error(`Listing ${listing.bucket} did not succeed`);
  }
  if (!isCompletePage(page)) {
    throw new Error(`${listing.bucket} listed an object without a key, size or upload time`);
  }
  return page;
}

function storedObject(item: ListedObject): StoredObject {
  return { key: item.key, bytes: item.size, uploaded: item.last_modified };
}

/**
 * Every object in a bucket, following any cursor a page returns.
 * Both `is_truncated` and `cursor` are optional in Cloudflare's schema, so a cursor alone continues the listing, and a truncated page without one, or a cursor that repeats, stops it with an error.
 */
async function listBucket(
  listing: Listing,
  listed: StoredObject[] = [],
  seen: ReadonlySet<string> = new Set()
): Promise<StoredObject[]> {
  const page = await readPage(listing);
  const objects = [...listed, ...page.result.map(storedObject)];
  const cursor = page.result_info?.cursor;
  if (!cursor) {
    if (page.result_info?.is_truncated) {
      throw new Error(`Listing ${listing.bucket} was truncated without a cursor`);
    }
    return objects;
  }
  if (seen.has(cursor)) {
    throw new Error(`Listing ${listing.bucket} returned the same cursor twice`);
  }
  return listBucket({ bucket: listing.bucket, cursor }, objects, new Set([...seen, cursor]));
}

/** The variants one prepared release record lists. */
async function readRelease(key: string): Promise<ReleaseVariant[]> {
  const response = await cloudflareGet(
    `/${RELEASE_BUCKET}/objects/${key.split('/').map(encodeURIComponent).join('/')}`
  );
  if (!response.ok) {
    throw new Error(`Reading ${key} failed with HTTP ${response.status}`);
  }
  const record = (await response.json()) as { variants?: { name?: unknown; source?: unknown; bytes?: unknown }[] };
  if (!Array.isArray(record.variants)) {
    throw new Error(`${key} has no variant list`);
  }
  return record.variants.map((variant) => {
    if (
      typeof variant.name !== 'string' ||
      typeof variant.source !== 'string' ||
      !Number.isSafeInteger(variant.bytes) ||
      (variant.bytes as number) <= 0
    ) {
      throw new Error(`${key} lists a variant without a name, source or positive size`);
    }
    return { name: variant.name, source: variant.source, bytes: variant.bytes as number };
  });
}

/** A GitHub API GET, asking for the file itself rather than its JSON description when `raw` is set. */
function githubGet(pathname: string, raw = false): Promise<Response> {
  const accept = raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json';
  return get(`${github}${pathname}`, { Authorization: `Bearer ${githubToken}`, Accept: accept });
}

/** Every open pull request number, page by page while GitHub's Link header names a next page. */
async function openPullRequests(page = 1, numbers: number[] = []): Promise<number[]> {
  const response = await githubGet(`/pulls?state=open&per_page=100&page=${page}`);
  if (!response.ok) {
    throw new Error(`Listing open pull requests failed with HTTP ${response.status}`);
  }
  const pulls = (await response.json()) as { number: number }[];
  const all = [...numbers, ...pulls.map((pull) => pull.number)];
  const hasNext = (response.headers.get('link') ?? '').includes('rel="next"');
  return hasNext ? openPullRequests(page + 1, all) : all;
}

/** The lock at a pull request's head, or an empty lock when that branch predates it. */
async function pullRequestLock(pull: number): Promise<RasterLock> {
  const response = await githubGet(
    `/contents/media/raster.lock.json?ref=${encodeURIComponent(`refs/pull/${pull}/head`)}`,
    true
  );
  if (response.status === 404) {
    return {};
  }
  if (!response.ok) {
    throw new Error(`Reading the lock of pull request ${pull} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as RasterLock;
}

function planNames(lock: RasterLock): string[] {
  return Object.entries(lock).flatMap(([key, entry]) =>
    planVariants(key, entry, sharp.versions).map((variant) => variant.name)
  );
}

/*
 * The ledger is listed before the variant bucket, and only the records that listing found are read.
 * A deploy writes a record only after every variant it lists is stored, so each record read here names variants that were stored before the variant listing began; a deploy running alongside this report can only add variants no record read here names.
 */
const ledgerKeys = (await listBucket({ bucket: RELEASE_BUCKET })).map((object) => object.key);
const recordKeys = ledgerKeys.filter((key) => key.startsWith('releases/') && key.endsWith('.json'));
const [records, sources, variants, pullLocks] = await Promise.all([
  Promise.all(recordKeys.map(async (key) => ({ key, variants: await readRelease(key) }))),
  listBucket({ bucket: SOURCE_BUCKET }),
  listBucket({ bucket: VARIANT_BUCKET }),
  openPullRequests().then((pulls) => Promise.all(pulls.map(pullRequestLock))),
]);
const releases = records.map((record) => record.variants);
const problems = ledgerProblems(ledgerKeys, records);

const plan = planCollection({
  sources,
  variants,
  releases,
  locks: [readRasterLock(), ...pullLocks],
  planNames,
  now: new Date(),
});
const missing = missingVariants(variants, releases);
const summary = (report: (typeof plan)['sources']) => ({
  ...report,
  candidateBytes: report.candidates.reduce((total, object) => total + object.bytes, 0),
});
console.log(
  JSON.stringify(
    {
      mode: 'dry-run',
      releases: releases.length,
      openPullRequests: pullLocks.length,
      sources: summary(plan.sources),
      variants: summary(plan.variants),
      ledgerProblems: problems,
      missingReleaseVariants: missing,
    },
    null,
    2
  )
);
if (problems.length > 0) {
  console.error(`The release ledger cannot vouch for stored media: ${problems.join('; ')}.`);
}
if (missing.length > 0) {
  console.error(
    `${missing.length} variant(s) a release record lists are missing from ${VARIANT_BUCKET} or stored at another size; see docs/technical/media-runbooks.md.`
  );
}
if (problems.length > 0 || missing.length > 0) {
  process.exit(1);
}
