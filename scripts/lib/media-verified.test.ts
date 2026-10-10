import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { readVerified, selectChecks, verifiedIdentity, writeVerified } from './media-verified';
import type { VerifiableEntry } from './media-verified';

function entry(index: number, sha256 = 'a'.repeat(64)): VerifiableEntry {
  return {
    variant: {
      key: `/image/texture/${index}.jpg`,
      recipe: { tier: 'small' } as VerifiableEntry['variant']['recipe'],
      name: `${String(index).padStart(20, '0')}.0000000000.jpg`,
      legacyPath: `image/texture/${index}-small.jpg`,
    },
    record: { sha256, bytes: 10 },
  };
}

const ORIGIN = 'https://dune.zone';
const entries = Array.from({ length: 10 }, (_, index) => entry(index));

describe('media verification selection', () => {
  test('downloads every entry when nothing was proved', () => {
    const checks = selectChecks(entries, new Set(), 3);
    expect(checks.unproved).toEqual(entries);
    expect(checks.sampled).toEqual([]);
    expect(checks.skipped).toBe(0);
  });

  test('downloads unproved entries and samples the proved ones without repeats', () => {
    const proved = new Set(entries.slice(0, 8).map(verifiedIdentity));
    const checks = selectChecks(entries, proved, 3, () => 0.5);
    expect(checks.unproved).toEqual(entries.slice(8));
    expect(checks.sampled).toHaveLength(3);
    expect(new Set(checks.sampled).size).toBe(3);
    expect(checks.sampled.every((item) => proved.has(verifiedIdentity(item)))).toBe(true);
    expect(checks.skipped).toBe(5);
  });

  test('treats different bytes under a proved name as unproved', () => {
    const proved = new Set([verifiedIdentity(entry(1))]);
    const checks = selectChecks([entry(1, 'b'.repeat(64))], proved, 0);
    expect(checks.unproved).toHaveLength(1);
  });

  test('round-trips the record and ignores a missing, other-origin or malformed file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'media-verified-'));
    const file = path.join(directory, 'nested/verified.json');
    expect(readVerified(file, ORIGIN).size).toBe(0);
    writeVerified(file, ORIGIN, [
      verifiedIdentity(entries[1]),
      verifiedIdentity(entries[0]),
      verifiedIdentity(entries[1]),
    ]);
    expect([...readVerified(file, ORIGIN)]).toEqual([verifiedIdentity(entries[0]), verifiedIdentity(entries[1])]);
    expect(readVerified(file, 'https://staging.dune.zone').size).toBe(0);
    writeFileSync(file, '{not json');
    expect(readVerified(file, ORIGIN).size).toBe(0);
  });
});
