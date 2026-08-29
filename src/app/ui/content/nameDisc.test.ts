import { describe, expect, it } from 'vitest';

import { nameDiscColor } from './nameDisc';

describe('nameDiscColor', () => {
  it('gives the same name the same colour every time', () => {
    expect(nameDiscColor('Arrakeen Rules Council')).toBe(nameDiscColor('Arrakeen Rules Council'));
  });

  it('reads the name the way a reader does, not the way a database does', () => {
    expect(nameDiscColor('  arrakeen rules council  ')).toBe(nameDiscColor('Arrakeen Rules Council'));
  });

  it('returns a colour a stylesheet can use', () => {
    expect(nameDiscColor('Spacing Guild')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('separates the names a reader would see side by side', () => {
    const colours = ['Arrakeen Rules Council', 'Spacing Guild', 'House Atreides', 'Fremen Council'].map(nameDiscColor);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
