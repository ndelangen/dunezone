/**
 * Publishes the deployed variants as packs (`workers/publisher/media-pack.ts`), so a fresh checkout's `generate:images` fills its store in a few downloads.
 *
 * Bun run media:packs
 *
 * Run by the deploy after the release is marked deployed, from the store `generate:images` filled.
 * A pack R2 already holds is not uploaded again, and since new art changes only the pack its original's hash falls in, a deploy usually uploads one pack or none.
 * The index is written last, once every pack it names is stored.
 * It takes MEDIA_PUBLISH_TOKEN and MEDIA_RELEASE_ID, and MEDIA_ORIGIN picks the Worker (https://dune.zone by default).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import type { RasterLock } from '../src/shared/media/rasterLock';
import { fetchMedia } from './lib/media-fetch';
import { buildPacks } from './lib/media-packs';
import type { PackIndex } from './lib/media-packs';
import { mediaStoreRoot } from './lib/media-store';
import { matchesRecord, planVariants } from './media-variants';
import type { ChecksumRecord } from './media-variants';

const repoRoot = path.resolve(import.meta.dirname, '..');
const storeRoot = mediaStoreRoot(repoRoot);
const origin = (process.env.MEDIA_ORIGIN ?? 'https://dune.zone').replace(/\/$/, '');
const token = process.env.MEDIA_PUBLISH_TOKEN;
const release = process.env.MEDIA_RELEASE_ID;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

if (!token || !release || !/^[0-9a-f]{40}-[0-9]{1,20}$/.test(release)) {
  console.error('media:packs needs MEDIA_PUBLISH_TOKEN and a valid MEDIA_RELEASE_ID.');
  process.exit(1);
}

const lock = JSON.parse(readFileSync(path.join(repoRoot, 'media/raster.lock.json'), 'utf8')) as RasterLock;
const variants = Object.keys(lock).flatMap((key) =>
  planVariants(key, lock[key], sharp.versions).map((variant) => {
    const file = path.join(storeRoot, variant.name);
    const bytes = new Uint8Array(readFileSync(file));
    const record = JSON.parse(readFileSync(`${file}.sha256`, 'utf8')) as ChecksumRecord;
    if (!matchesRecord(bytes, record)) {
      throw new Error(`${variant.name}: the stored bytes do not match their record; run \`bun run generate:images\``);
    }
    return { name: variant.name, bytes };
  })
);
const packs = buildPacks(variants);
const headers = { Authorization: `Bearer ${token}` };

let uploaded = 0;
for (const { pack, body } of packs) {
  const url = `${origin}/__media/packs/${pack.sha256}.bin`;
  const subject = `pack ${pack.sha256}`;
  const head = await fetchMedia(url, { method: 'HEAD' }, { subject, delaysMs: RETRY_DELAYS_MS });
  if (head.status === 200 && head.headers.get('X-Media-SHA256') === pack.sha256) {
    continue;
  }
  const put = await fetchMedia(url, { method: 'PUT', body, headers }, { subject, delaysMs: RETRY_DELAYS_MS });
  if (put.status !== 201 && put.status !== 200) {
    throw new Error(`${subject}: PUT answered ${put.status} ${new TextDecoder().decode(put.bytes)}`);
  }
  uploaded += 1;
}

const index: PackIndex = { schemaVersion: 1, release, packs: packs.map(({ pack }) => pack) };
const written = await fetchMedia(
  `${origin}/__media/packs/latest.json`,
  { method: 'PUT', body: JSON.stringify(index), headers: { ...headers, 'Content-Type': 'application/json' } },
  { subject: 'pack index', delaysMs: RETRY_DELAYS_MS }
);
if (written.status !== 200) {
  throw new Error(`pack index: PUT answered ${written.status} ${new TextDecoder().decode(written.bytes)}`);
}
console.log(
  JSON.stringify({
    origin,
    release,
    packs: packs.length,
    uploaded,
    variants: variants.length,
    bytes: packs.reduce((total, { pack }) => total + pack.bytes, 0),
  })
);
