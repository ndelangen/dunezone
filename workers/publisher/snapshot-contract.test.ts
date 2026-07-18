import { describe, expect, test } from 'vitest';

import { proofFaction } from '../../src/app/capture/proofFaction';
import { parsePublisherCaptureSnapshot } from '../../src/shared/asset-publishing/publisher-snapshot';

const productionEnvelope = {
  ok: true,
  payload: {
    factionId: 'k17faction',
    slug: 'test-faction',
    faction: proofFaction,
  },
  payloadHash: 'a'.repeat(64),
} as const;

describe('protected publisher snapshot contract', () => {
  test('retains strict unknown-key and slug validation', () => {
    expect(() =>
      parsePublisherCaptureSnapshot({ ...productionEnvelope, unexpected: true })
    ).toThrow();
    expect(() =>
      parsePublisherCaptureSnapshot({
        ...productionEnvelope,
        payload: { ...productionEnvelope.payload, slug: 'Not A URL Slug' },
      })
    ).toThrow();
  });
});
