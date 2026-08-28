import { describe, expect, it } from 'vitest';

import type { BackgroundData } from '@game/data/backgrounds';

import { CUSTOM_PRESET, hasWorkToLose, presetKeyFor, presetSelection, sameBackground } from './presetChoice';

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

describe('the two halves of stock-or-custom', () => {
  const presets = [
    { key: 'weapon', label: 'Weapon', background: preset },
    { key: 'other', label: 'Other', background: { ...preset, invert: !preset.invert } },
  ];

  it('derives which preset a value equals, with no flag involved', () => {
    expect(presetKeyFor(presets, preset)).toBe('weapon');
  });

  it('derives null for a value equal to none of them', () => {
    expect(presetKeyFor(presets, { ...preset, definition: preset.definition + 0.25 })).toBeNull();
  });

  it('shows Custom for a value matching nothing, whether or not the author ever said so', () => {
    expect(presetSelection(null, false)).toBe(CUSTOM_PRESET);
  });

  it('shows Custom for a value that does match, once the author has said so', () => {
    expect(presetSelection('weapon', true)).toBe(CUSTOM_PRESET);
    expect(presetSelection('weapon', false)).toBe('weapon');
  });

  it('counts a diverged value as work to lose, which was the whole test before D5', () => {
    expect(hasWorkToLose({ stillWearsExpected: false, declaredCustom: false })).toBe(true);
  });

  it('counts a declared intent as work to lose even while the value still matches, which is what D5 added', () => {
    expect(hasWorkToLose({ stillWearsExpected: true, declaredCustom: true })).toBe(true);
  });

  it('leaves the substitution free only when neither half objects', () => {
    expect(hasWorkToLose({ stillWearsExpected: true, declaredCustom: false })).toBe(false);
  });
});
