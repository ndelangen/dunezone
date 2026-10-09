import { describe, expect, test } from 'vitest';

import { changedRendererAssetTypes, publicationActivationHeader } from './publication-revisions';

describe('Publication activation credential output', () => {
  const credential = 'synthetic-credential-canary';

  test('accepts the CLI line ending and produces a valid HTTP header', () => {
    const header = publicationActivationHeader(`${credential}\n`);
    expect(new Headers({ Authorization: header }).get('Authorization')).toBe(`Bearer ${credential}`);
  });

  test.each([
    `Connection closed with code 1006\nAttempting reconnect\n${credential}`,
    `${credential}\nConnection closed with code 1006`,
    `${credential}\tunexpected`,
    `${credential}\u007f`,
    `${credential}\u0100`,
    '',
  ])('rejects contaminated output without exposing its credential', (output) => {
    try {
      publicationActivationHeader(output);
      expect.fail('Contaminated credential output was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/unexpected output/);
      expect((error as Error).message).not.toContain(credential);
    }
  });
});

describe('Publication Renderer revision comparison', () => {
  test('treats equal maps as a no-op regardless of key order', () => {
    expect(
      changedRendererAssetTypes({ faction_token: 2, faction_sheet: 4 }, { faction_sheet: 4, faction_token: 2 })
    ).toEqual([]);
  });

  test('returns every asset type whose checked-in revision is higher', () => {
    expect(
      changedRendererAssetTypes({ faction_sheet: 4, faction_token: 2 }, { faction_sheet: 5, faction_token: 3 })
    ).toEqual(['faction_sheet', 'faction_token']);
  });

  test('rejects checked-in revisions behind stored production state', () => {
    expect(() => changedRendererAssetTypes({ faction_sheet: 5 }, { faction_sheet: 4 })).toThrow(/behind production/);
  });
});
