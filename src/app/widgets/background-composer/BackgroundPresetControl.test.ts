import { describe, expect, it } from 'vitest';

import type { BackgroundData } from '@game/data/backgrounds';

import { sameBackground } from './BackgroundPresetControl';

const stops: [string, number][] = [
  ['#9A9256', 0],
  ['#EEECA6', 1],
];

const preset: BackgroundData = {
  image: '/image/texture/076.jpg',
  colors: [{ type: 'linear', angle: 90, stops }, '#101D65'],
  influence: 1,
  invert: true,
  definition: 0,
};

describe('sameBackground', () => {
  it('matches a gradient clone whatever key order it round-tripped into', () => {
    /* A schema re-emit orders keys by shape declaration, which need not match the preset literal. */
    const reordered = JSON.parse(
      JSON.stringify({ ...preset, colors: [{ stops, angle: 90, type: 'linear' }, '#101D65'] })
    ) as BackgroundData;
    expect(sameBackground(preset, reordered)).toBe(true);
  });

  it('rejects a gradient that actually differs', () => {
    const different: BackgroundData = {
      ...preset,
      colors: [{ type: 'linear', angle: 120, stops }, '#101D65'],
    };
    expect(sameBackground(preset, different)).toBe(false);
  });
});
