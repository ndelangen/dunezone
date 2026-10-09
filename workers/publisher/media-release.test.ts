import { describe, expect, test } from 'vitest';

import { handleMediaReleaseRequest, mediaReleaseKey, mediaReleaseMarkerKey } from './media-release';
import type { MediaReleaseEnv, MediaReleaseRecord } from './media-release';
import { memoryR2Bucket } from './test-helpers';

const ORIGIN = 'https://dune.zone';
const TOKEN = 'publish-token';
const RELEASE = `${'a'.repeat(40)}-123456`;
const SOURCE = '0123456789abcdef0123'.padEnd(64, '4');

function record(overrides: Partial<MediaReleaseRecord> = {}): MediaReleaseRecord {
  return {
    schemaVersion: 1,
    release: RELEASE,
    state: 'prepared',
    variants: [
      {
        name: '0123456789abcdef0123.abcdef0123.webp',
        key: '/image/texture/021.jpg',
        source: SOURCE,
        sha256: 'f'.repeat(64),
        bytes: 1234,
      },
    ],
    ...overrides,
  };
}

function empty() {
  return { MEDIA_RELEASES_BUCKET: memoryR2Bucket(), MEDIA_PUBLISH_TOKEN: TOKEN };
}

function put(body: unknown, token: string | null = TOKEN): RequestInit {
  return {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  };
}

async function answer(path: string, init: RequestInit, env: MediaReleaseEnv): Promise<Response> {
  const response = await handleMediaReleaseRequest(new Request(`${ORIGIN}${path}`, init), env);
  if (!response) {
    throw new Error(`${path} was not answered`);
  }
  return response;
}

describe('media release ledger', () => {
  test('creates the prepared record once and answers an identical repeat with 200', async () => {
    const env = empty();

    const created = await answer(`/__media/releases/${RELEASE}`, put(record()), env);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ release: RELEASE, object: mediaReleaseKey(RELEASE), created: true });

    const repeated = await answer(`/__media/releases/${RELEASE}`, put(record()), env);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ created: false });
  });

  test('never overwrites a prepared record with different contents', async () => {
    const env = empty();
    await answer(`/__media/releases/${RELEASE}`, put(record()), env);
    const original = env.MEDIA_RELEASES_BUCKET.objects.get(mediaReleaseKey(RELEASE))?.bytes;

    const changed = record();
    changed.variants[0].bytes = 999;
    const conflict = await answer(`/__media/releases/${RELEASE}`, put(changed), env);

    expect(conflict.status).toBe(409);
    expect(env.MEDIA_RELEASES_BUCKET.objects.get(mediaReleaseKey(RELEASE))?.bytes).toEqual(original);
  });

  test('marks a prepared release deployed, naming the record it confirms', async () => {
    const env = empty();
    const prepared = (await (await answer(`/__media/releases/${RELEASE}`, put(record()), env)).json()) as {
      sha256: string;
    };

    const marked = await answer(`/__media/releases/${RELEASE}/deployed`, put(''), env);
    expect(marked.status).toBe(201);
    const marker = env.MEDIA_RELEASES_BUCKET.objects.get(mediaReleaseMarkerKey(RELEASE))?.bytes;
    expect(JSON.parse(new TextDecoder().decode(marker))).toEqual({
      schemaVersion: 1,
      release: RELEASE,
      state: 'deployed',
      record: prepared.sha256,
    });

    expect((await answer(`/__media/releases/${RELEASE}/deployed`, put(''), env)).status).toBe(200);
  });

  test('refuses a deployed marker for a release that was never prepared', async () => {
    const env = empty();

    const response = await answer(`/__media/releases/${RELEASE}/deployed`, put(''), env);

    expect(response.status).toBe(409);
    expect(env.MEDIA_RELEASES_BUCKET.objects.size).toBe(0);
  });

  test.each([
    ['no bearer', put(record(), null), 401],
    ['a wrong bearer', put(record(), 'wrong'), 401],
    ['invalid JSON', put('{'), 400],
    ['another release', put(record({ release: `${'b'.repeat(40)}-1` })), 422],
    ['no variants', put(record({ variants: [] })), 422],
    ['a deployed state', put({ ...record(), state: 'deployed' }), 422],
    [
      'a variant from another source',
      put(record({ variants: [{ ...record().variants[0], source: 'e'.repeat(64) }] })),
      422,
    ],
    ['a malformed variant name', put(record({ variants: [{ ...record().variants[0], name: '../x.webp' }] })), 422],
  ])('refuses a record with %s', async (_, init, status) => {
    const env = empty();

    const response = await answer(`/__media/releases/${RELEASE}`, init, env);

    expect(response.status).toBe(status);
    expect(env.MEDIA_RELEASES_BUCKET.objects.size).toBe(0);
  });

  test('answers 503 while the publish token is unset', async () => {
    const response = await answer(`/__media/releases/${RELEASE}`, put(record()), {
      MEDIA_RELEASES_BUCKET: memoryR2Bucket(),
    });

    expect(response.status).toBe(503);
  });

  test('has no read route and rejects malformed release ids', async () => {
    const env = empty();
    await answer(`/__media/releases/${RELEASE}`, put(record()), env);

    expect((await answer(`/__media/releases/${RELEASE}`, {}, env)).status).toBe(405);
    expect((await answer('/__media/releases/main-1', put(record()), env)).status).toBe(404);
    expect((await answer('/__media/releases', {}, env)).status).toBe(404);
  });

  test('leaves other paths to the next handler', async () => {
    expect(await handleMediaReleaseRequest(new Request(`${ORIGIN}/__media/src/x`), empty())).toBeNull();
  });
});
