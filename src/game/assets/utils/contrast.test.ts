import { describe, expect, it } from 'vitest';

import { isLight } from './contrast';

describe('isLight', () => {
  /*
   * Each pair flips its answer when two channels trade places.
   * Green and blue catch a green/blue mixup, orange and azure a red/blue one.
   */
  it.each([
    { hex: '#00ff00', rgb: 'rgb(0, 255, 0)', rgba: 'rgba(0, 255, 0, 0.5)', light: true },
    { hex: '#0000ff', rgb: 'rgb(0, 0, 255)', rgba: 'rgba(0, 0, 255, 0.5)', light: false },
    { hex: '#ff9600', rgb: 'rgb(255, 150, 0)', rgba: 'rgba(255, 150, 0, 1)', light: true },
    { hex: '#0096ff', rgb: 'rgb(0, 150, 255)', rgba: 'rgba(0, 150, 255, 1)', light: false },
  ])('reads $hex the same as $rgb and $rgba', ({ hex, rgb, rgba, light }) => {
    expect(isLight(hex)).toBe(light);
    expect(isLight(rgb)).toBe(light);
    expect(isLight(rgba)).toBe(light);
  });

  it('reads an rgb string it cannot parse as dark instead of throwing', () => {
    expect(isLight('rgb(')).toBe(false);
  });
});
