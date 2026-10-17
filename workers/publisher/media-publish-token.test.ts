import { afterEach, expect, test, vi } from 'vite-plus/test';

import { fetchMedia } from '../../scripts/lib/media-fetch';
import { fetchMediaAfterTokenRotation, waitForMediaPublishToken } from '../../scripts/media-publish-token';
import { handleMediaReleaseRequest } from './media-release';
import { memoryR2Bucket } from './test-helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Fakes only the clock and setTimeout, so bearer checks that hash on a real macrotask still finish between sleeps.
 */
function useFakeSleeps() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}

/**
 * Settles a request by jumping the fake clock to each sleep the code reaches, and never past one it has not reached yet.
 * The retry loop is sequential, so a pending timer means the code is sleeping and no real work is outstanding.
 */
async function settleWithFakeSleeps<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  while (!settled) {
    await new Promise((resolve) => setImmediate(resolve));
    if (!settled && vi.getTimerCount() > 0) {
      await vi.advanceTimersToNextTimerAsync();
    }
  }
  return await promise;
}

const settings = { origin: 'https://dune.zone', token: 'installed-token', release: `${'a'.repeat(40)}-123456` };

test('a permanently wrong bearer reaches the deadline without writing to the bucket or exposing the token', async () => {
  const bucket = memoryR2Bucket();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    return await handleMediaReleaseRequest(new Request(url, init), {
      MEDIA_RELEASES_BUCKET: bucket,
      MEDIA_PUBLISH_TOKEN: 'another-token',
    });
  });
  await expect(waitForMediaPublishToken(settings, { timeoutMs: 40, intervalMs: 5 })).rejects.toThrow(
    'did not become ready within 0.04s; last: HTTP 401'
  );
  expect(bucket.objects.size).toBe(0);
});

test.each([
  ['a different validation refusal', () => Response.json({ error: 'Another validation error' }, { status: 400 })],
  ['a malformed validation response', () => new Response('invalid JSON', { status: 400 })],
])('%s fails without waiting for propagation', async (_, refusal) => {
  const bucket = memoryR2Bucket();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const response = await handleMediaReleaseRequest(new Request(url, init), {
      MEDIA_RELEASES_BUCKET: bucket,
      MEDIA_PUBLISH_TOKEN: settings.token,
    });
    return response?.status === 400 ? refusal() : (response ?? new Response('', { status: 404 }));
  });
  await expect(waitForMediaPublishToken(settings)).rejects.toThrow('readiness refused: HTTP 400');
  expect(bucket.objects.size).toBe(0);
});

test('temporary service failures wait for authenticated validation', async () => {
  let available = false;
  const bucket = memoryR2Bucket();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (!available) {
      available = true;
      return new Response('', { status: 503 });
    }
    return await handleMediaReleaseRequest(new Request(url, init), {
      MEDIA_RELEASES_BUCKET: bucket,
      MEDIA_PUBLISH_TOKEN: settings.token,
    });
  });
  await expect(waitForMediaPublishToken(settings, { timeoutMs: 1000, intervalMs: 5 })).resolves.toBeUndefined();
  expect(bucket.objects.size).toBe(0);
});

test('a later write recovers when it reaches a stale bearer after successful readiness', async () => {
  useFakeSleeps();
  const bucket = memoryR2Bucket();
  const source = 'a'.repeat(64);
  const record = {
    schemaVersion: 1,
    release: settings.release,
    state: 'prepared',
    variants: [
      {
        name: `${source.slice(0, 20)}.${'b'.repeat(10)}.webp`,
        key: '/image/example.png',
        source,
        sha256: 'c'.repeat(64),
        bytes: 123,
      },
    ],
  };
  let attempts = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    attempts += 1;
    return await handleMediaReleaseRequest(new Request(url, init), {
      MEDIA_RELEASES_BUCKET: bucket,
      MEDIA_PUBLISH_TOKEN: [1, 3].includes(attempts) ? 'previous-token' : settings.token,
    });
  });
  const publishing = fetchMediaAfterTokenRotation(
    { ...settings, deadline: Date.now() + 5000 },
    `${settings.origin}/__media/releases/${settings.release}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${settings.token}` }, body: JSON.stringify(record) },
    { subject: 'test release', delaysMs: [] }
  );
  const response = await settleWithFakeSleeps(publishing);
  expect(response.status).toBe(201);
  expect(attempts).toBe(5);
  expect(bucket.objects.size).toBe(1);
});

test('successful probes do not cause rapid retries while writes keep reaching stale instances', async () => {
  useFakeSleeps();
  const bucket = memoryR2Bucket();
  const attempts: number[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (init.body !== '{') {
      attempts.push(Date.now());
    }
    return await handleMediaReleaseRequest(new Request(url, init), {
      MEDIA_RELEASES_BUCKET: bucket,
      MEDIA_PUBLISH_TOKEN: init.body === '{' ? settings.token : 'previous-token',
    });
  });
  const started = Date.now();
  const publishing = fetchMediaAfterTokenRotation(
    { ...settings, deadline: started + 1250 },
    `${settings.origin}/__media/releases/${settings.release}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${settings.token}` }, body: '{}' },
    { subject: 'test release', delaysMs: [] }
  );
  const response = await settleWithFakeSleeps(publishing);
  expect(response.status).toBe(401);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]! - attempts[0]!).toBeGreaterThanOrEqual(1000);
  expect(attempts[1]! - started).toBeLessThan(1250);
  expect(Date.now() - started).toBeGreaterThanOrEqual(1250);
  expect(bucket.objects.size).toBe(0);
});

test('ordinary media requests still refuse unauthorized publishing immediately', async () => {
  const bucket = memoryR2Bucket();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    return await handleMediaReleaseRequest(new Request(url, init), {
      MEDIA_RELEASES_BUCKET: bucket,
      MEDIA_PUBLISH_TOKEN: 'another-token',
    });
  });
  const response = await fetchMedia(
    `${settings.origin}/__media/releases/${settings.release}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${settings.token}` }, body: '{' },
    { subject: 'test release', delaysMs: [] }
  );
  expect(response.status).toBe(401);
  expect(bucket.objects.size).toBe(0);
});
