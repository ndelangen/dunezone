import { describe, expect, it } from 'vite-plus/test';

import { stripComments } from './jsonc.ts';

describe('stripComments', () => {
  it('drops line and block comments', () => {
    expect(JSON.parse(stripComments('{\n  // line\n  "a": 1, /* block */ "b": [2]\n}'))).toEqual({ a: 1, b: [2] });
  });

  it('keeps comment markers and escaped quotes inside strings', () => {
    const source = String.raw`{"url": "https://x/*y*/", "quote": "say \"// hi\""}`;
    expect(JSON.parse(stripComments(source))).toEqual({ url: 'https://x/*y*/', quote: 'say "// hi"' });
  });
});
