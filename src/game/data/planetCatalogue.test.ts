import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PLANET } from '@shared/assetIds';
import { describe, expect, it } from 'vitest';

import { CURATED_PLANET_IMAGES } from './planetCatalogue';

describe('curated planet image catalogue', () => {
  it('exposes exactly the thirteen repository-owned illustrations', () => {
    expect(CURATED_PLANET_IMAGES).toHaveLength(13);
    expect(CURATED_PLANET_IMAGES.map(({ image }) => image)).toEqual(PLANET.options);
    expect(new Set(CURATED_PLANET_IMAGES.map(({ id }) => id)).size).toBe(13);
  });

  it('only references keys backed by media sources', () => {
    /* Keys are opaque asset ids; their ground truth is the media/ source tree. public/image is
       generated output and may not exist when tests run; fetchability of the generated files is
       verified by `bun run verify:images`. */
    for (const { image } of CURATED_PLANET_IMAGES) {
      expect(existsSync(join(import.meta.dirname, '../../..', 'media', image))).toBe(true);
    }
  });
});
