import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vite-plus/test';

import {
  componentEnvelopeKey,
  componentPublicationEnvelopeSchema,
} from '../../src/shared/asset-publishing/componentPublication';
import { publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import { TargetRenderError } from './browser';
import { putComponentEnvelope } from './component-r2';
import type { PublisherConfig } from './config';
import type { AssignedPublicationJob } from './convex';
import { executeItemList } from './executor';
import { putPublishedAsset } from './r2';
import { jpegBytes, memoryR2Bucket } from './test-helpers';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const config: PublisherConfig = {
  publicBaseUrl: 'https://dune.zone',
  captureBaseUrl: 'https://publisher.example.com',
  convexExecutorBaseUrl: 'https://convex.example.com/executor',
  workWindowMs: 240_000,
  browserCaptureTimeoutMs: 45_000,
  browserCleanupGraceMs: 15_000,
  pdfMaxBytes: 8_000_000,
};
const SOURCE_FACTION = 'aaaaaaaaaaaaaaaa';
const CHILD_FACTION = 'bbbbbbbbbbbbbbbb';
const TROOP = '7a70b096-6c26-4a75-b622-cefab9e987fa';
const SOURCE_TOKEN = '00000000-0000-4000-8000-000000000001';
const SOURCE_HASH = 'a'.repeat(64);
const CHILD_HASH = 'c'.repeat(64);
const image = jpegBytes({ widthPx: 600, heightPx: 600, progressive: false });
const geometry = {
  width: 600,
  height: 600,
  parts: [{ key: 'portrait' as const, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
};

function job(assetType: 'faction-troop' | 'faction-leader', cacheToken = SOURCE_TOKEN): AssignedPublicationJob {
  return {
    jobId: 'job-child',
    assetType,
    assetId: `${CHILD_FACTION}.${TROOP}`,
    expiresAt: NOW + 300_000,
    reuse: { assetId: `${SOURCE_FACTION}.${TROOP}`, cacheToken, payloadHash: CHILD_HASH },
  };
}

function run(bucket: ReturnType<typeof memoryR2Bucket>, item: AssignedPublicationJob) {
  const complete = vi.fn(async () => 'completed' as const);
  const capture = vi.fn(async () => {
    throw new TargetRenderError('rendered');
  });
  const execution = executeItemList(config, [item], {
    bucket,
    client: { complete, fail: vi.fn(async () => 'pending' as const) },
    openBrowser: async () => ({ capture, close: async () => undefined, sessionId: () => 'session' }),
    encodeJpeg: async () => image,
    now: () => NOW,
  });
  return { execution, complete, capture };
}

describe('Capture reuse in the publisher', () => {
  test('a troop face is copied from the named capture under the job’s own key, without rendering', async () => {
    const bucket = memoryR2Bucket();
    await putPublishedAsset(
      bucket,
      { ...job('faction-troop'), assetId: `${SOURCE_FACTION}.${TROOP}` },
      SOURCE_HASH,
      SOURCE_TOKEN,
      image
    );
    const { execution, complete, capture } = run(bucket, job('faction-troop'));

    await expect(execution).resolves.toMatchObject({ reused: 1, rendered: 0, completed: 1 });
    expect(capture).not.toHaveBeenCalled();
    const copy = bucket.objects.get(publishedR2Key('faction-troop', `${CHILD_FACTION}.${TROOP}`));
    expect(copy?.bytes).toEqual(image);
    expect(copy?.options.customMetadata).toMatchObject({
      assetId: `${CHILD_FACTION}.${TROOP}`,
      payloadHash: CHILD_HASH,
    });
    const [[jobId, cacheToken]] = complete.mock.calls as unknown as [[string, string]];
    expect(jobId).toBe('job-child');
    expect(copy?.options.customMetadata).toMatchObject({ publisherCacheToken: cacheToken });
  });

  test('a source overwritten since Convex recorded it is not copied; the job renders instead', async () => {
    const bucket = memoryR2Bucket();
    await putPublishedAsset(
      bucket,
      { ...job('faction-troop'), assetId: `${SOURCE_FACTION}.${TROOP}` },
      SOURCE_HASH,
      SOURCE_TOKEN,
      image
    );
    const { execution, capture } = run(bucket, job('faction-troop', 'an-older-token'));

    await expect(execution).resolves.toMatchObject({ reused: 0 });
    expect(capture).toHaveBeenCalledOnce();
  });

  test('a leader envelope is copied with the job’s identity and hash, and completes with its geometry', async () => {
    const bucket = memoryR2Bucket();
    await putComponentEnvelope(
      bucket,
      { ...job('faction-leader'), assetId: `${SOURCE_FACTION}.${TROOP}` },
      SOURCE_HASH,
      SOURCE_TOKEN,
      image,
      geometry
    );
    const { execution, complete, capture } = run(bucket, job('faction-leader'));

    await expect(execution).resolves.toMatchObject({ reused: 1, rendered: 0, completed: 1 });
    expect(capture).not.toHaveBeenCalled();
    const [[jobId, revision, , payloadHash, completedGeometry]] = complete.mock.calls as unknown as [
      [string, string, number, string, unknown],
    ];
    expect([jobId, payloadHash, completedGeometry]).toEqual(['job-child', CHILD_HASH, geometry]);
    const stored = bucket.objects.get(componentEnvelopeKey(`${CHILD_FACTION}.${TROOP}`, revision));
    const envelope = componentPublicationEnvelopeSchema.parse(JSON.parse(Buffer.from(stored!.bytes).toString()));
    expect(envelope).toMatchObject({
      assetId: `${CHILD_FACTION}.${TROOP}`,
      revision,
      payloadHash: CHILD_HASH,
      geometry,
    });
    expect(new Uint8Array(Buffer.from(envelope.image.base64, 'base64'))).toEqual(image);
  });

  test('a missing source envelope falls back to rendering', async () => {
    const { execution, capture } = run(memoryR2Bucket(), job('faction-leader'));
    await expect(execution).resolves.toMatchObject({ reused: 0 });
    expect(capture).toHaveBeenCalledOnce();
  });
});
