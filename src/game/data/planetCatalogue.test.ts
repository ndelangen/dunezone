import { PLANET } from '@shared/assetIds';
import stockAssetCollections from '@shared/stockAssetCollections.json';
import { describe, expect, it } from 'vitest';

import rasterLock from '../../../media/raster.lock.json';
import { CURATED_PLANET_IMAGES } from './planetCatalogue';

describe('curated planet image catalogue', () => {
  it('exposes all ninety-eight planet illustrations', () => {
    expect(CURATED_PLANET_IMAGES).toHaveLength(98);
    expect(CURATED_PLANET_IMAGES.map(({ image }) => image)).toEqual(PLANET.options);
    expect(new Set(CURATED_PLANET_IMAGES.map(({ id }) => id)).size).toBe(98);
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
    /* Keys are opaque asset ids; their ground truth is the raster lock, which the lock test ties to the
       source bytes. public/image is generated output and may not exist when tests run; fetchability
       of the generated files is verified by `bun run verify:images`. */
    for (const { image } of CURATED_PLANET_IMAGES) {
      expect(Object.hasOwn(rasterLock, image), image).toBe(true);
    }
  });
});
