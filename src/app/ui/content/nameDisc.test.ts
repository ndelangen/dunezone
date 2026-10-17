import { describe, expect, it } from 'vite-plus/test';

import { nameDiscColor } from './nameDisc';

describe('nameDiscColor', () => {
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

  it('mixes blue with a little red between 240 and 300 degrees', () => {
    /* The Landsraad hashes to hue 245, where red rises from the floor while green stays on it. */
    expect(nameDiscColor('The Landsraad')).toBe('#474280');
  });
});
