import { describe, expect, it } from 'vitest';

import { isLight } from './contrast';

describe('isLight', () => {
  /*
   * Each pair flips its answer when two channels trade places.
   * Green and blue catch a green/blue mixup, #ff8000 and #0080ff a red/blue one.
   */
  it.each([
    { hex: '#00ff00', rgb: 'rgb(0, 255, 0)', rgba: 'rgba(0, 255, 0, 0.5)', light: true },
    { hex: '#0000ff', rgb: 'rgb(0, 0, 255)', rgba: 'rgba(0, 0, 255, 0.5)', light: false },
    { hex: '#ff8000', rgb: 'rgb(255, 128, 0)', rgba: 'rgba(255, 128, 0, 1)', light: true },
    { hex: '#0080ff', rgb: 'rgb(0, 128, 255)', rgba: 'rgba(0, 128, 255, 1)', light: false },
  ])('reads $hex the same as $rgb and $rgba', ({ hex, rgb, rgba, light }) => {
    expect(isLight(hex)).toBe(light);
    expect(isLight(rgb)).toBe(light);
    expect(isLight(rgba)).toBe(light);
  });

  /*
   * #949494 is a production sheet colour with white text at 3.03:1, and #959595 gives 2.99:1.
   * #ff4000 is a production background at 3.51:1 that Rec. 601 weights on linear light call light.
   */
  it.each([
    { color: '#949494', light: false },
    { color: '#959595', light: true },
    { color: '#ff4000', light: false },
  ])('reads $color as light only when white text on it falls below 3:1', ({ color, light }) => {
    expect(isLight(color)).toBe(light);
  });

  it('reads an rgb string it cannot parse as dark instead of throwing', () => {
    expect(isLight('rgb(')).toBe(false);
  });
});
