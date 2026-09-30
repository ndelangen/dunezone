import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PLANET } from '@shared/assetIds';
import stockAssetCollections from '@shared/stockAssetCollections.json';
import { describe, expect, it } from 'vitest';

import { CURATED_PLANET_IMAGES } from './planetCatalogue';

describe('curated planet image catalogue', () => {
  it('exposes the originals and fifty new illustrations', () => {
    expect(CURATED_PLANET_IMAGES).toHaveLength(63);
    expect(CURATED_PLANET_IMAGES.map(({ image }) => image)).toEqual(PLANET.options);
    expect(new Set(CURATED_PLANET_IMAGES.map(({ id }) => id)).size).toBe(63);
  });

  it('preserves original identifiers and groups every planet once', () => {
    expect(CURATED_PLANET_IMAGES.slice(0, 13)).toEqual(
      Array.from({ length: 13 }, (_, index) => {
        const number = String(index + 1).padStart(2, '0');
        return { id: `planet-${number}`, image: `/image/planet/${number}.png`, label: `Planet illustration ${number}` };
      })
    );
    const collections = stockAssetCollections.filter(({ assets }) =>
      assets.some((asset) => asset.startsWith('/image/planet/'))
    );
    expect(collections).toHaveLength(11);
    expect(collections.flatMap(({ assets }) => assets).sort()).toEqual([...PLANET.options].sort());
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
