import { describe, expect, test } from 'vite-plus/test';

import { parseReaderSearch } from './readerSearch';

/*
 * The reader's search is merged over its parent match's, so a rejected value must come back as an explicit undefined rather than a missing key.
 * The Rejected Edition story shows the page this produces; these pin the parsing itself.
 */
describe('the rulebook reader search', () => {
  test('an edition that is not a positive whole number reads as no edition, with the key still present', () => {
    for (const edition of ['abc', '0', '-2', '1.5', '', 'Infinity', 0, -1, 2.5, Number.NaN, null, true]) {
      const search = parseReaderSearch({ edition });
      expect(search).toHaveProperty('edition', undefined);
      expect(search).toHaveProperty('loc', undefined);
    }
  });

  test('an edition number, written or already parsed, is kept as a number', () => {
    expect(parseReaderSearch({ edition: '2' })).toEqual({ edition: 2, loc: undefined });
    expect(parseReaderSearch({ edition: 3 })).toEqual({ edition: 3, loc: undefined });
  });

  test('a text locator is kept as written, and anything else in its place is dropped', () => {
    expect(parseReaderSearch({ loc: 'abc' })).toEqual({ edition: undefined, loc: 'abc' });
    expect(parseReaderSearch({ loc: 7 })).toHaveProperty('loc', undefined);
  });
});
