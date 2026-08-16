import { describe, expect, test } from 'vitest';

import { publisherCaptureSnapshotSchema } from '../../src/shared/asset-publishing/publisher-snapshot';
import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';

const productionEnvelope = {
  ok: true,
  payload: {
    factionId: 'k17faction',
    slug: 'test-faction',
    faction: assetPublishingFaction,
  },
  payloadHash: 'a'.repeat(64),
} as const;

describe('protected publisher snapshot contract', () => {
  test('retains strict unknown-key and slug validation', () => {
    expect(() => publisherCaptureSnapshotSchema.parse({ ...productionEnvelope, unexpected: true })).toThrow();
    expect(() =>
      publisherCaptureSnapshotSchema.parse({
        ...productionEnvelope,
        payload: { ...productionEnvelope.payload, slug: 'Not A URL Slug' },
      })
    ).toThrow();
  });
});
