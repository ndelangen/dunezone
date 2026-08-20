import { describe, expect, it } from 'vitest';

import { clampInfluence, influenceToSliderPosition, sliderPositionToInfluence } from './influenceScale';

describe('faction influence perceptual scale', () => {
  it('preserves the exact endpoints', () => {
    expect(influenceToSliderPosition(0)).toBe(0);
    expect(influenceToSliderPosition(1)).toBe(100);
    expect(sliderPositionToInfluence(0)).toBe(0);
    expect(sliderPositionToInfluence(100)).toBe(1);
  });

  it.each([0, 0.1, 0.44, 0.58, 0.67, 0.72, 0.82, 0.95, 1])(
    'round-trips the existing stored value %s',
    (storedValue) => {
      expect(sliderPositionToInfluence(influenceToSliderPosition(storedValue))).toBe(storedValue);
    }
  );

  it('maps perceptual travel with v = 1 - (1 - p)^2', () => {
    expect(sliderPositionToInfluence(25)).toBe(0.4375);
    expect(sliderPositionToInfluence(50)).toBe(0.75);
    expect(sliderPositionToInfluence(75)).toBe(0.9375);
  });

  it('clamps values to the stored contract', () => {
    expect(clampInfluence(-1)).toBe(0);
    expect(clampInfluence(2)).toBe(1);
    expect(sliderPositionToInfluence(-10)).toBe(0);
    expect(sliderPositionToInfluence(110)).toBe(1);
  });
});
