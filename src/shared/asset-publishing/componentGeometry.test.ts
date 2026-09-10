import { describe, expect, it } from 'vitest';

import { componentGeometrySchema } from './componentGeometry';
import { componentEnvelopeKey, componentPublicationEnvelopeSchema } from './componentPublication';

const geometry = { width: 900, height: 1263, parts: [{ key: 'body', x: 0.1, y: 0.4, width: 0.8, height: 0.5 }] };
const revision = '7a70b096-6c26-4a75-b622-cefab9e987fa';

describe('component publication geometry', () => {
  it('accepts maintained component vocabularies and refuses bounds outside the image', () => {
    expect(componentGeometrySchema.parse(geometry)).toEqual(geometry);
    expect(
      componentGeometrySchema.safeParse({ ...geometry, parts: [{ ...geometry.parts[0], width: 1 }] }).success
    ).toBe(false);
    expect(componentGeometrySchema.safeParse({ ...geometry, width: Infinity }).success).toBe(false);
  });

  it('refuses executable SVG text and arbitrary transform expressions in highlights', () => {
    for (const highlight of [
      { paths: [{ d: 'M0 0L1 1" onload="alert(1)' }] },
      { paths: [{ d: 'M0 0L1 1', transform: 'url(https://example.com)' }] },
      { paths: [{ d: 'M0 0L1 1', transform: [1, 0, 0, 1, 0, Infinity] }] },
    ]) {
      expect(
        componentGeometrySchema.safeParse({ ...geometry, parts: [{ ...geometry.parts[0], highlight }] }).success
      ).toBe(false);
    }
  });

  it('keeps each Card and token face in a separate immutable envelope namespace', () => {
    expect(componentEnvelopeKey('aaaaaaaaaaaaaaaa', revision, 'card-treachery')).toBe(
      `components/card-treachery/aaaaaaaaaaaaaaaa/revisions/${revision}.json`
    );
    expect(componentEnvelopeKey('aaaaaaaaaaaaaaaa.back', revision, 'token-tech')).toBe(
      `components/token-tech/aaaaaaaaaaaaaaaa.back/revisions/${revision}.json`
    );
    expect(() => componentEnvelopeKey('aaaaaaaaaaaaaaaa.back', revision, 'card-treachery')).toThrow();
    expect(() => componentEnvelopeKey('../aaaaaaaaaaaaa', revision, 'token-tech')).toThrow();
    expect(
      componentPublicationEnvelopeSchema.parse({
        schemaVersion: 1,
        assetType: 'card-treachery',
        assetId: 'aaaaaaaaaaaaaaaa',
        revision,
        payloadHash: 'a'.repeat(64),
        geometry,
        image: { contentType: 'image/jpeg', base64: 'YWJj' },
      }).geometry
    ).toEqual(geometry);
  });
});
