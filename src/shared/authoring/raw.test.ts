import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import {
  parseRawAsset,
  parseRawFaction,
  rawRulebookSchema,
  readRawAuthoringJson,
  RAW_AUTHORING_MAX_BYTES,
} from './raw';

describe('raw authoring input', () => {
  test('counts UTF-8 bytes before parsing', () => {
    expect(() => readRawAuthoringJson('"' + 'é'.repeat(RAW_AUTHORING_MAX_BYTES / 2) + '"')).toThrow('512 KiB');
    expect(readRawAuthoringJson('"' + 'x'.repeat(RAW_AUTHORING_MAX_BYTES - 2) + '"')).toHaveLength(
      RAW_AUTHORING_MAX_BYTES - 2
    );
  });
  test('bounds depth and node count before schema work', () => {
    expect(readRawAuthoringJson('['.repeat(64) + '0' + ']'.repeat(64))).toBeInstanceOf(Array);
    expect(() => readRawAuthoringJson('['.repeat(65) + '0' + ']'.repeat(65))).toThrow('64 levels');
    expect(() => readRawAuthoringJson(JSON.stringify(Array(50_000).fill(0)))).toThrow('50,000');
    expect(readRawAuthoringJson(JSON.stringify(Array(49_999).fill(0)))).toHaveLength(49_999);
  });
  test.each(['__proto__', 'prototype', 'constructor'])('rejects unsafe key %s at its path', (key) => {
    expect(() => readRawAuthoringJson(`{"nested":{"${key}":{}}}`)).toThrow(`$.nested.${key}`);
  });
  test('retains faction component identities and rejects absent identities', () => {
    expect(parseRawFaction(structuredClone(assetPublishingFaction))).toEqual(assetPublishingFaction);
    const value = structuredClone(assetPublishingFaction);
    Reflect.deleteProperty(value.factionLeader, 'memberId');
    expect(() => parseRawFaction(value)).toThrow('factionLeader.memberId');
  });
  test.each(['_id', '_creationTime', 'owner_id', 'group_id', 'members', 'publication', 'receipt'])(
    'refuses protected row field %s',
    (key) => {
      expect(() => parseRawFaction({ ...assetPublishingFaction, [key]: [] })).toThrow();
    }
  );
  test('does not accept the importer envelope as editor data', () => {
    expect(() => parseRawFaction({ format: 'dunezone-package', version: 1, items: [] })).toThrow();
  });
  test('accepts only strict settings and Contents for a book', () => {
    const contents = { schemaVersion: 1, pageOrder: [], pagesById: {} };
    expect(
      rawRulebookSchema.safeParse({ settings: { size: 'gf9-core', design: 'illustrated' }, contents }).success
    ).toBe(false);
    expect(
      rawRulebookSchema.safeParse({
        settings: { size: 'gf9-core', design: 'illustrated' },
        contents,
        name: 'No rename',
      }).success
    ).toBe(false);
  });
  test('rejects an unsupported asset route type', () => {
    expect(() => parseRawAsset('faction', {})).toThrow('cannot be written');
  });
});
