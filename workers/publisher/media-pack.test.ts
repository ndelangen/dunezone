import { describe, expect, test } from 'vite-plus/test';

import { MEDIA_PACK_INDEX_KEY, handleMediaPackRequest, indexProblem, mediaPackKey } from './media-pack';
import type { MediaPackEnv, MediaPackIndex } from './media-pack';
import { sha256Hex } from './media-upload';
import { memoryR2Bucket } from './test-helpers';

const ORIGIN = 'https://dune.zone';
const TOKEN = 'publish-token';
const RELEASE = `${'a'.repeat(40)}-123456`;

function env(): MediaPackEnv {
  return { MEDIA_RELEASES_BUCKET: memoryR2Bucket(), MEDIA_PUBLISH_TOKEN: TOKEN };
}

async function answer(path: string, init: RequestInit, target: MediaPackEnv): Promise<Response> {
  const response = await handleMediaPackRequest(new Request(`${ORIGIN}${path}`, init), target);
  if (!response) {
    throw new Error(`${path} was not answered`);
  }
  return response;
}

function put(body: BodyInit, token: string | null = TOKEN): RequestInit {
  return { method: 'PUT', body, headers: token === null ? {} : { Authorization: `Bearer ${token}` } };
}

async function pack(): Promise<{ bytes: Uint8Array; sha256: string; index: MediaPackIndex }> {
  const first = new Uint8Array([1, 2, 3]);
  const second = new Uint8Array([4, 5]);
  const bytes = new Uint8Array([...first, ...second]);
  const sha256 = await sha256Hex(bytes);
  const index: MediaPackIndex = {
    schemaVersion: 1,
    release: RELEASE,
    packs: [
      {
        sha256,
        bytes: 5,
        entries: [
          { name: `${'0'.repeat(20)}.${'a'.repeat(10)}.webp`, sha256: await sha256Hex(first), bytes: 3, offset: 0 },
          { name: `${'0'.repeat(19)}1.${'a'.repeat(10)}.png`, sha256: await sha256Hex(second), bytes: 2, offset: 3 },
        ],
      },
    ],
  };
  return { bytes, sha256, index };
}

describe('media packs', () => {
  test('stores a pack once under its hash and serves it with integrity headers', async () => {
    const target = env();
    const { bytes, sha256 } = await pack();

    expect((await answer(`/__media/packs/${sha256}.bin`, put(bytes), target)).status).toBe(201);
    expect((await answer(`/__media/packs/${sha256}.bin`, put(bytes), target)).status).toBe(200);

    const served = await answer(`/__media/packs/${sha256}.bin`, { method: 'GET' }, target);
    expect(served.status).toBe(200);
    expect(served.headers.get('X-Media-SHA256')).toBe(sha256);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
  });

  test('refuses a pack that does not hash to its path, and any write without the token', async () => {
    const target = env();
    const { bytes, sha256 } = await pack();
    expect((await answer(`/__media/packs/${'f'.repeat(64)}.bin`, put(bytes), target)).status).toBe(422);
    expect((await answer(`/__media/packs/${sha256}.bin`, put(bytes, null), target)).status).toBe(401);
    expect((await answer(`/__media/packs/${sha256}.bin`, put(bytes, 'wrong'), target)).status).toBe(401);
    expect(await target.MEDIA_RELEASES_BUCKET.head(mediaPackKey(sha256))).toBeNull();
  });

  test('accepts an index only once every pack it names is stored', async () => {
    const target = env();
    const { bytes, sha256, index } = await pack();

    const early = await answer('/__media/packs/latest.json', put(JSON.stringify(index)), target);
    expect(early.status).toBe(409);
    expect(await target.MEDIA_RELEASES_BUCKET.head(MEDIA_PACK_INDEX_KEY)).toBeNull();

    await answer(`/__media/packs/${sha256}.bin`, put(bytes), target);
    expect((await answer('/__media/packs/latest.json', put(JSON.stringify(index)), target)).status).toBe(200);

    const served = await answer('/__media/packs/latest.json', { method: 'GET' }, target);
    expect(served.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await served.json()).toEqual(index);
  });

  test('refuses an index whose entries do not tile their pack', async () => {
    const { index } = await pack();
    expect(indexProblem(index)).toBeNull();
    const gap = structuredClone(index);
    gap.packs[0].entries[1].offset = 4;
    expect(indexProblem(gap)).toMatch(/tile it exactly/);
    const short = structuredClone(index);
    short.packs[0].bytes = 6;
    expect(indexProblem(short)).toMatch(/tile it exactly/);
    const twice = structuredClone(index);
    twice.packs.push(structuredClone(index.packs[0]));
    expect(indexProblem(twice)).toMatch(/twice/);
  });

  test('answers 404 for a pack or index R2 lacks, and HEAD without a body', async () => {
    const target = env();
    const { bytes, sha256 } = await pack();
    expect((await answer(`/__media/packs/${sha256}.bin`, { method: 'GET' }, target)).status).toBe(404);
    expect((await answer('/__media/packs/latest.json', { method: 'GET' }, target)).status).toBe(404);

    await answer(`/__media/packs/${sha256}.bin`, put(bytes), target);
    const head = await answer(`/__media/packs/${sha256}.bin`, { method: 'HEAD' }, target);
    expect(head.status).toBe(200);
    expect(head.headers.get('X-Media-Bytes')).toBe(String(bytes.byteLength));
    expect((await head.arrayBuffer()).byteLength).toBe(0);
  });

  test('refuses an index that is not JSON or not well formed', async () => {
    const target = env();
    expect((await answer('/__media/packs/latest.json', put('{'), target)).status).toBe(400);
    expect((await answer('/__media/packs/latest.json', put('{}'), target)).status).toBe(422);
    expect((await answer('/__media/packs/latest.json', put('{}', null), target)).status).toBe(401);
    expect(indexProblem(null)).toMatch(/schemaVersion/);
    expect(indexProblem({ schemaVersion: 1, release: RELEASE, packs: [] })).toMatch(/no packs/);
    expect(indexProblem({ schemaVersion: 1, release: RELEASE, packs: [null] })).toMatch(/malformed/);
  });

  test('leaves other paths alone and refuses unknown ones in its namespace', async () => {
    expect(await handleMediaPackRequest(new Request(`${ORIGIN}/__media/src/x`), env())).toBeNull();
    expect((await answer('/__media/packs/other', { method: 'GET' }, env())).status).toBe(404);
    expect((await answer('/__media/packs/latest.json', { method: 'DELETE' }, env())).status).toBe(405);
  });
});
