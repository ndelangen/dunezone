import { describe, expect, test } from 'vite-plus/test';

import type { RasterLock, RasterLockEntry } from '../../src/shared/media/rasterLock';
import { ledgerProblems, missingVariants, planCollection } from './media-gc';
import type { GcInputs, StoredObject } from './media-gc';

const NOW = new Date('2026-10-09T00:00:00Z');
const OLD = '2026-08-01T00:00:00Z';
const RECENT = '2026-10-01T00:00:00Z';

const hash = (digit: string) => digit.repeat(64);

function entry(sha256: string): RasterLockEntry {
  return { sha256, bytes: 1, width: 1, height: 1, format: 'png', isOpaque: true, color: '#000000' };
}

function source(digit: string, uploaded = OLD): StoredObject {
  return { key: `sha256/${hash(digit)}`, bytes: 10, uploaded };
}

function variant(name: string, uploaded = OLD): StoredObject {
  return { key: `v/${name}`, bytes: 5, uploaded };
}

/** Each lock plans one variant per original, named after its hash. */
function inputs(overrides: Partial<GcInputs>): GcInputs {
  return {
    sources: [],
    variants: [],
    releases: [],
    locks: [],
    planNames: (lock: RasterLock) => Object.values(lock).map((item) => `${item.sha256.slice(0, 4)}.webp`),
    now: NOW,
    ...overrides,
  };
}

describe('media collection plan', () => {
  test('keeps whatever any release record lists, prepared or deployed', () => {
    const plan = planCollection(
      inputs({
        sources: [source('a')],
        variants: [variant('released.webp')],
        releases: [[{ name: 'released.webp', source: hash('a'), bytes: 5 }]],
      })
    );

    expect(plan.sources).toMatchObject({ inRelease: 1, candidates: [] });
    expect(plan.variants).toMatchObject({ inRelease: 1, candidates: [] });
  });

  test('keeps what the lock on main or on an open pull request references', () => {
    const plan = planCollection(
      inputs({
        sources: [source('b'), source('c')],
        variants: [variant('bbbb.webp'), variant('cccc.webp')],
        locks: [{ '/image/a.png': entry(hash('b')) }, { '/image/b.png': entry(hash('c')) }],
      })
    );

    expect(plan.sources).toMatchObject({ inLock: 2, candidates: [] });
    expect(plan.variants).toMatchObject({ inLock: 2, candidates: [] });
  });

  test('keeps an unreferenced upload until it is older than thirty days', () => {
    const plan = planCollection(inputs({ sources: [source('d', RECENT), source('e')] }));

    expect(plan.sources.young).toBe(1);
    expect(plan.sources.candidates).toEqual([source('e')]);
  });

  test('never collects an object with an unreadable upload time', () => {
    const plan = planCollection(inputs({ variants: [variant('x.webp', 'not a date')] }));

    expect(plan.variants).toMatchObject({ young: 1, candidates: [] });
  });

  test('reports keys outside the known layout without collecting them', () => {
    const plan = planCollection(inputs({ sources: [{ key: 'stray.png', bytes: 1, uploaded: OLD }] }));

    expect(plan.sources).toMatchObject({ unrecognised: ['stray.png'], candidates: [] });
  });
});

describe('stored release variants', () => {
  const release = [
    { name: 'kept.webp', source: hash('a'), bytes: 5 },
    { name: 'gone.webp', source: hash('b'), bytes: 5 },
    { name: 'resized.webp', source: hash('c'), bytes: 9 },
  ];

  test('passes when every listed variant is stored at its published size', () => {
    expect(missingVariants([variant('kept.webp')], [[release[0]]])).toEqual([]);
  });

  test('reports a variant the bucket lacks or stores at another size, once per name', () => {
    const stored = [variant('kept.webp'), variant('resized.webp'), source('a')];
    /* An earlier record shares one variant with the latest and names one only it lists. */
    const earlier = [release[1], { name: 'older.webp', source: hash('d'), bytes: 3 }];
    expect(missingVariants(stored, [earlier, release])).toEqual([
      { name: 'gone.webp', bytes: 5, stored: null },
      { name: 'older.webp', bytes: 3, stored: null },
      { name: 'resized.webp', bytes: 9, stored: 5 },
    ]);
  });
});

describe('the release ledger behind the stored-variant check', () => {
  const variants = [{ name: 'kept.webp', source: hash('a'), bytes: 5 }];

  test('vouches when every deployed release still has a record that lists variants', () => {
    const keys = ['releases/a-1.json', 'releases/a-1.deployed', 'releases/b-2.json'];
    const records = [
      { key: 'releases/a-1.json', variants },
      { key: 'releases/b-2.json', variants },
    ];
    expect(ledgerProblems(keys, records)).toEqual([]);
  });

  test('refuses an empty ledger, an empty record and a deployed marker without its record', () => {
    expect(ledgerProblems([], [])).toEqual(['the release ledger holds no release record']);
    const keys = ['releases/a-1.json', 'releases/gone-2.deployed'];
    expect(ledgerProblems(keys, [{ key: 'releases/a-1.json', variants: [] }])).toEqual([
      'releases/a-1.json lists no variants',
      'releases/gone-2.deployed marks a release deployed whose record releases/gone-2.json is gone',
    ]);
  });
});
