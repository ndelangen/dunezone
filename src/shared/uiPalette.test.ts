import { describe, expect, it } from 'vite-plus/test';

import { coreColors, cssOpacity, cssPalette, playUiColors, themeRamps, withAlpha } from './uiPalette';

function contrast(first: string, second: string) {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('shared UI palette contract', () => {
  it('derives every theme and Play role from the canonical pigments', () => {
    const canonical = new Set<string>(Object.values(coreColors));
    expect(canonical.size).toBe(Object.keys(coreColors).length);
    expect(canonical.size).toBeLessThanOrEqual(25);
    const roles = [
      ...Object.values(playUiColors),
      ...Object.values(themeRamps).flat(),
      ...Object.values(cssPalette).flatMap(Object.values),
    ];
    expect(roles.filter((value) => !canonical.has(value))).toEqual([]);
  });
  it('keeps all pigments opaque, with alpha defined separately', () => {
    const pigments = [
      ...Object.values(coreColors),
      ...Object.values(playUiColors),
      ...Object.values(themeRamps).flat(),
      ...Object.values(cssPalette).flatMap(Object.values),
    ];
    for (const pigment of pigments) {
      expect(pigment).toMatch(/^#[a-f\d]{6}$/i);
    }
    for (const scope of Object.values(cssOpacity)) {
      for (const [role, alpha] of Object.entries(scope)) {
        expect(role).toMatch(/-alpha$/);
        expect(Number(alpha)).toBeGreaterThanOrEqual(0);
        expect(Number(alpha)).toBeLessThanOrEqual(1);
      }
    }
    expect(withAlpha(coreColors.ground, 0.42)).toBe('rgba(23, 21, 17, 0.42)');
  });
  it('keeps body text, hints and semantic signals readable on raised dark surfaces', () => {
    for (const foreground of [
      coreColors.text,
      coreColors.muted,
      coreColors.positive,
      coreColors.negative,
      coreColors.caution,
      coreColors.progress,
      coreColors.publish,
    ]) {
      expect(contrast(foreground, coreColors.raised), foreground).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps filled control labels readable in every semantic family', () => {
    for (const [family, ramp] of Object.entries(themeRamps)) {
      const ink = family === 'brand' || family === 'cta' ? coreColors.ink : coreColors.paper;
      expect(contrast(ink, ramp[8])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, ramp[9])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('separates primary actions and the active phase from surrounding dark surfaces', () => {
    for (const surface of [coreColors.ground, coreColors.raised, coreColors.selected]) {
      expect(contrast(themeRamps.brand[8], surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(themeRamps.cta[8], surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(playUiColors.activeTracker, surface)).toBeGreaterThanOrEqual(3);
    }
  });
  it('shares table furniture with the app while retaining paper and inverse inks', () => {
    expect(cssPalette.dark['--table-board-rim']).toBe(coreColors.ground);
    expect(cssPalette.dark['--table-top']).toBe(coreColors.umber);
    expect(cssPalette.dark['--table-slot-rim']).toBe(coreColors.edge);
    expect(cssPalette.base['--color-paper']).toBe('#fffdf8');
    expect(cssPalette.base['--color-ink']).toBe('#2e2927');
    expect(cssPalette.artwork['--color-link']).toBe(coreColors.white);
  });
});
