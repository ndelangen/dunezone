import { describe, expect, test } from 'vitest';

import rasterLock from '../../../../media/raster.lock.json';
import { assetColorStyle } from './assetColor';

describe('assetColorStyle', () => {
  test('paints the locked dominant colour behind a raster key', () => {
    expect(assetColorStyle('/image/texture/021.jpg')).toEqual({
      backgroundColor: rasterLock['/image/texture/021.jpg'].color,
    });
  });

  test('leaves keys without a raster source unstyled', () => {
    expect(assetColorStyle('/vector/icon/spice.svg')).toBeUndefined();
  });
});
