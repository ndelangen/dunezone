import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLANET } from './generated';
import { CURATED_PLANET_IMAGES } from './planetCatalogue';

describe('curated planet image catalogue', () => {
  it('exposes exactly the thirteen repository-owned illustrations', () => {
    expect(CURATED_PLANET_IMAGES).toHaveLength(13);
    expect(CURATED_PLANET_IMAGES.map(({ image }) => image)).toEqual(PLANET.options);
    expect(new Set(CURATED_PLANET_IMAGES.map(({ id }) => id)).size).toBe(13);
  });

  it('only references files that exist under public', () => {
    for (const { image } of CURATED_PLANET_IMAGES) {
      expect(existsSync(join(import.meta.dirname, '../../..', 'public', image))).toBe(true);
    }
  });
});
