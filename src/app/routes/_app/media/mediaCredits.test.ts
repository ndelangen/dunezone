import {
  creditDefinitions as credits,
  creditMethods,
  creditText,
  isCreditId,
  mediaCreditText,
} from '@shared/media/credits';
import creditIndex from '@shared/media/credits.generated.json';
import { describe, expect, test } from 'vite-plus/test';

import mediaIndex from './media-index.json';

const records: Record<string, { credit: string; creditDetail?: string }> = mediaIndex;

describe('media credits', () => {
  test('every indexed file names a defined credit', () => {
    expect(Object.entries(records).filter(([, { credit }]) => !isCreditId(credit))).toEqual([]);
  });

  test('every credit is used by at least one file', () => {
    const used = new Set(Object.values(records).map(({ credit }) => credit));
    expect(Object.keys(credits).filter((id) => !used.has(id))).toEqual([]);
  });

  test('the picker index matches the reviewed media index', () => {
    for (const [path, { credit, creditDetail }] of Object.entries(records)) {
      expect(mediaCreditText(path), path).toBe(creditText(credits[credit]!, creditDetail));
    }
  });

  test('the picker index holds no files that left the media index', () => {
    const indexed = Object.entries(creditIndex.files).flatMap(([, folders]) =>
      Object.entries(folders).flatMap(([folder, names]) => names.map((name) => `${folder}${name}`))
    );
    expect(indexed.filter((path) => !Object.hasOwn(records, path))).toEqual([]);
    expect(Object.keys(creditIndex.details).filter((path) => !Object.hasOwn(records, path))).toEqual([]);
  });

  test('credits use only the known fields and roles', () => {
    const fields = new Set(['method', 'artist', 'artistRole', 'source', 'style', 'by']);
    for (const [id, credit] of Object.entries(credits)) {
      expect(
        Object.keys(credit).filter((field) => !fields.has(field)),
        id
      ).toEqual([]);
      expect([undefined, 'art', 'design'], id).toContain(credit.artistRole);
    }
  });

  test('every credit detail is a complete sentence', () => {
    for (const [path, { creditDetail }] of Object.entries(records)) {
      if (creditDetail) {
        expect(creditDetail, path).toMatch(/^[A-Z].*\.$/);
      }
    }
  });

  test('every credit reads as complete sentences', () => {
    for (const [id, credit] of Object.entries(credits)) {
      expect(creditMethods, id).toContain(credit.method);
      const text = creditText(credit);
      expect(text, id).not.toMatch(/undefined|\.\.|\s,/);
      expect(text, id).toMatch(/^[A-Z].*\.$/);
    }
  });

  test('credits name the artist, the source and who prepared the copy', () => {
    expect(mediaCreditText('/image/leader/official/paul.jpg')).toBe(
      'Art by Ilya Baranovsky for Dune (Gale Force Nine, 2019), cleaned up by Central419.'
    );
    expect(mediaCreditText('/vector/icon/spice.svg')).toBe(
      'Traced by Central419 from Dune (Gale Force Nine, 2019), design by Casey Davies and Victor Pesch.'
    );
    expect(mediaCreditText('/image/planet/familiar-worlds/mars.png')).toBe(
      'Made with AI image tools, based on NASA mission imagery, in the style of the GF9 Dune planets. Reference image: NASA.'
    );
    expect(mediaCreditText('/not/stock.png')).toBeUndefined();
  });
});
