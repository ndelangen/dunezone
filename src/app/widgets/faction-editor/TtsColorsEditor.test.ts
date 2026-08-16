import { TTSColor } from '@shared/factions/schema';
import { describe, expect, it } from 'vitest';

import type { Faction } from '@db/factions';

import { availableTtsColors, moveTtsColor, nextUnusedTtsColor, removeLastTtsColor } from './TtsColorsEditor';

describe('TtsColorsEditor model', () => {
  it('excludes colors used by other rows while retaining a legacy duplicate current value', () => {
    const value: Faction['colors'] = ['Green', 'Green', 'Teal'];

    const firstRowOptions = availableTtsColors(value, 0);

    expect(firstRowOptions).toContain('Green');
    expect(firstRowOptions).not.toContain('Teal');
    expect(firstRowOptions.filter((color) => color === 'Green')).toHaveLength(1);
    expect(value).toEqual(['Green', 'Green', 'Teal']);
  });

  it('appends the first unused color and disables addition after the catalogue is exhausted', () => {
    expect(nextUnusedTtsColor(['White', 'Brown'])).toBe('Red');
    expect(nextUnusedTtsColor([...TTSColor.options])).toBeUndefined();
  });

  it('removes only the bottom row', () => {
    expect(removeLastTtsColor(['Green', 'Teal', 'Blue'])).toEqual(['Green', 'Teal']);
    expect(removeLastTtsColor([])).toEqual([]);
  });

  it('uses the same stable reorder operation for pointer and keyboard drag completion', () => {
    const value: Faction['colors'] = ['Green', 'Teal', 'Blue'];

    expect(moveTtsColor(value, 0, 2)).toEqual(['Teal', 'Blue', 'Green']);
    expect(moveTtsColor(value, 2, 0)).toEqual(['Blue', 'Green', 'Teal']);
    expect(moveTtsColor(value, -1, 0)).toBe(value);
  });
});
