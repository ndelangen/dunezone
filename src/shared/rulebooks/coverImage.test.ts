import { describe, expect, test } from 'vite-plus/test';

import { rulebookCoverImageSchema } from './coverImage';

const image = {
  url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
  sourceUrl: 'https://images.example/cover.png',
  width: 1560,
  height: 3000,
};

describe('Stored Rulebook cover metadata', () => {
  test('preserves historical dimensions within a finite positive integer bound', () => {
    expect(rulebookCoverImageSchema.parse(image)).toEqual(image);
    expect(rulebookCoverImageSchema.parse({ ...image, width: 3000, height: 1560 })).toEqual({
      ...image,
      width: 3000,
      height: 1560,
    });
    for (const dimension of [0, -1, 1.5, 3001, Infinity, NaN]) {
      for (const field of ['width', 'height']) {
        expect(rulebookCoverImageSchema.safeParse({ ...image, [field]: dimension }).success).toBe(false);
      }
    }
  });

  test('historical dimensions retain the delivery URL and source restrictions', () => {
    for (const url of [
      image.url.replace('dune.zone', 'elsewhere.example'),
      image.url.replace('https:', 'http:'),
      image.url.replace('dune.zone', 'user:secret@dune.zone'),
      image.url.replace('/user-images/', '/other/'),
      `${image.url}?token=secret`,
      `${image.url}#fragment`,
    ]) {
      expect(rulebookCoverImageSchema.safeParse({ ...image, url }).success).toBe(false);
    }
    expect(rulebookCoverImageSchema.safeParse({ ...image, sourceUrl: 'javascript:alert(1)' }).success).toBe(false);
  });
});
