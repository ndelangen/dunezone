/**
 * The R2 media collection report (#1888 step 9): a dry run of the retention rules that lists what a collection could remove.
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
import { planCollection } from './lib/media-gc';
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
  result?: ListedObject[];
  result_info?: { cursor?: string; is_truncated?: boolean };
};

function storedObject(item: ListedObject, bucket: string): StoredObject {
  if (typeof item.key !== 'string' || typeof item.size !== 'number' || typeof item.last_modified !== 'string') {
    throw new Error(`${bucket} listed an object without a key, size or upload time`);
  }
  return { key: item.key, bytes: item.size, uploaded: item.last_modified };
}

/** Every object in a bucket, following the cursor until the listing says it is complete. */
async function listBucket(bucket: string, cursor = '', listed: StoredObject[] = []): Promise<StoredObject[]> {
  const query = new URLSearchParams({ per_page: '1000', ...(cursor ? { cursor } : {}) });
  const response = await cloudflareGet(`/${bucket}/objects?${query}`);
  const page = (await response.json()) as ListPage;
  if (!response.ok || page.success !== true || !Array.isArray(page.result)) {
    throw new Error(`Listing ${bucket} failed with HTTP ${response.status}`);
  }
  const objects = [...listed, ...page.result.map((item) => storedObject(item, bucket))];
  if (!page.result_info?.is_truncated) {
    return objects;
  }
  if (!page.result_info.cursor) {
    throw new Error(`Listing ${bucket} was truncated without a cursor`);
  }
  return listBucket(bucket, page.result_info.cursor, objects);
}

/** The variants one prepared release record lists. */
async function readRelease(key: string): Promise<ReleaseVariant[]> {
  const response = await cloudflareGet(
    `/${RELEASE_BUCKET}/objects/${key.split('/').map(encodeURIComponent).join('/')}`
  );
  if (!response.ok) {
    throw new Error(`Reading ${key} failed with HTTP ${response.status}`);
  }
  const record = (await response.json()) as { variants?: { name?: unknown; source?: unknown }[] };
  if (!Array.isArray(record.variants)) {
    throw new Error(`${key} has no variant list`);
  }
  return record.variants.map((variant) => {
    if (typeof variant.name !== 'string' || typeof variant.source !== 'string') {
      throw new Error(`${key} lists a variant without a name or source`);
    }
    return { name: variant.name, source: variant.source };
  });
}

function githubGet(pathname: string, accept = 'application/vnd.github+json'): Promise<Response> {
  return get(`${github}${pathname}`, { Authorization: `Bearer ${githubToken}`, Accept: accept });
}

/** Every open pull request number, page by page until a short page. */
async function openPullRequests(page = 1, numbers: number[] = []): Promise<number[]> {
  const response = await githubGet(`/pulls?state=open&per_page=100&page=${page}`);
  if (!response.ok) {
    throw new Error(`Listing open pull requests failed with HTTP ${response.status}`);
  }
  const pulls = (await response.json()) as { number: number }[];
  const all = [...numbers, ...pulls.map((pull) => pull.number)];
  return pulls.length < 100 ? all : openPullRequests(page + 1, all);
}

/** The lock at a pull request's head, or an empty lock when that branch predates it. */
async function pullRequestLock(pull: number): Promise<RasterLock> {
  const response = await githubGet(
    `/contents/media/raster.lock.json?ref=${encodeURIComponent(`refs/pull/${pull}/head`)}`,
    'application/vnd.github.raw+json'
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

const [sources, variants, ledger, pulls] = await Promise.all([
  listBucket(SOURCE_BUCKET),
  listBucket(VARIANT_BUCKET),
  listBucket(RELEASE_BUCKET),
  openPullRequests(),
]);
const recordKeys = ledger.map((object) => object.key).filter((key) => key.endsWith('.json'));
const [releases, pullLocks] = await Promise.all([
  Promise.all(recordKeys.map(readRelease)),
  Promise.all(pulls.map(pullRequestLock)),
]);

const plan = planCollection({
  sources,
  variants,
  releases,
  locks: [readRasterLock(), ...pullLocks],
  planNames,
  now: new Date(),
});
const summary = (report: (typeof plan)['sources']) => ({
  ...report,
  candidateBytes: report.candidates.reduce((total, object) => total + object.bytes, 0),
});
console.log(
  JSON.stringify(
    {
      mode: 'dry-run',
      releases: releases.length,
      openPullRequests: pulls.length,
      sources: summary(plan.sources),
      variants: summary(plan.variants),
    },
    null,
    2
  )
);
