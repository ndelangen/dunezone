import { describe, expect, test } from 'vitest';

import { publisherSnapshotSchema } from '../../src/shared/asset-publishing/publisher-snapshot';

const faction = {
  name: 'Test faction',
  logo: '/vector/logo/atreides.svg',
  colors: ['Green'],
  background: {
    image: '/image/texture/021.jpg',
    colors: ['#4b4c0d', '#d9c979'],
    opacity: 1,
    strength: 0.55,
  },
  themeColor: '#4b4c0d',
  hero: { name: 'Lady Jessica', image: '/image/leader/official/jessica.png' },
  leaders: [],
  decals: [],
  troops: [],
  rules: {
    startText: 'Start text',
    revivalText: 'Revival text',
    spiceCount: 1,
    advantages: [],
    alliance: { text: 'Alliance text' },
    fate: { title: 'Fate', text: 'Fate text' },
  },
};

const productionEnvelope = {
  ok: true,
  targetId: 'k17assetTarget',
  factionId: 'k17faction',
  assetType: 'faction_sheet',
  generation: 4,
  rendererVersion: 'faction-sheet-v3',
  leaseExpiresAt: Date.parse('2026-07-18T12:00:00.000Z'),
  payload: {
    factionId: 'k17faction',
    slug: 'test-faction',
    faction,
  },
  payloadHash: 'a'.repeat(64),
} as const;

describe('protected publisher snapshot contract', () => {
  test('accepts the complete production item-render envelope', () => {
    expect(publisherSnapshotSchema.parse(productionEnvelope)).toMatchObject({
      targetId: productionEnvelope.targetId,
      factionId: productionEnvelope.factionId,
      generation: productionEnvelope.generation,
      payload: { faction },
    });
  });

  test('retains strict unknown-key and cross-field identity validation', () => {
    expect(() =>
      publisherSnapshotSchema.parse({ ...productionEnvelope, unexpected: true })
    ).toThrow();
    expect(() =>
      publisherSnapshotSchema.parse({
        ...productionEnvelope,
        payload: { ...productionEnvelope.payload, factionId: 'different-faction' },
      })
    ).toThrow(/Snapshot faction identity/);
  });
});
