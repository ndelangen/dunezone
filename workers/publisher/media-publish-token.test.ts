import { afterEach, expect, test, vi } from 'vitest';

import { waitForMediaPublishToken } from '../../scripts/media-publish-token';
import { handleMediaReleaseRequest } from './media-release';
import { memoryR2Bucket } from './test-helpers';

afterEach(() => vi.unstubAllGlobals());

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

test('a different validation refusal does not count as authenticated readiness', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ error: 'Another validation error' }, { status: 400 }));
  await expect(waitForMediaPublishToken(settings)).rejects.toThrow('readiness refused: HTTP 400');
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
