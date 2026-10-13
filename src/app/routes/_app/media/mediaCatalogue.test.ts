import { describe, expect, test } from 'vitest';

import { mediaEntries } from './mediaCatalogue';
import { validateMediaSearch } from './mediaSearchParams';
const first = mediaEntries[0]!;

describe('media catalogue deep links', () => {
  test('keeps valid filters and a known selected asset', () => {
    expect(
      validateMediaSearch({ source: 'media', kind: first.kind, group: '  Weapons  ', q: 'sword ', item: first.value })
    ).toEqual({ source: 'media', kind: first.kind, group: 'Weapons', q: 'sword ', item: first.value });
  });

  test('discards malformed filters and selections without throwing', () => {
    expect(validateMediaSearch(null)).toEqual({ source: 'media', kind: 'all', group: '', q: '' });
    expect(validateMediaSearch({ source: [], kind: 'unknown', group: {}, q: 12, item: 'missing.svg' })).toEqual({
      source: 'media',
      kind: 'all',
      group: '',
      q: '',
    });
    expect(validateMediaSearch({ item: ['/a.svg'] }).item).toBeUndefined();
    expect(validateMediaSearch({ source: 'lucide', item: first.value }).item).toBeUndefined();
  });

  test('every catalogue asset is a selection the search keeps', () => {
    expect(mediaEntries.filter((entry) => validateMediaSearch({ item: entry.value }).item !== entry.value)).toEqual([]);
  });
});
