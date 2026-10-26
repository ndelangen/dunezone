import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vite-plus/test';

import { TUTORIAL_CHAPTERS } from './chapters';

/* Storybook reads its sidebar order from the preview file as written, so the tutorial's order there is a copy of the chapter list. */
describe('the tutorial in the Storybook sidebar', () => {
  test('lists the chapters in the order a player meets them', () => {
    const preview = readFileSync(new URL('../../../../../.storybook/preview.tsx', import.meta.url), 'utf8');
    const block = preview.match(/'Tutorial',\s*\[([^\]]*)\]/)?.[1] ?? '';
    const listed = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(listed).toEqual(['Landing', ...TUTORIAL_CHAPTERS.map((chapter) => chapter.title), 'Chapter complete']);
  });
});
