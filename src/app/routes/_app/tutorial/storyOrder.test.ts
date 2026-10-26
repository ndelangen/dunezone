import { readFileSync } from 'node:fs';

import { getStorySortParameter } from 'storybook/internal/csf-tools';
import { describe, expect, test } from 'vite-plus/test';

import { TUTORIAL_CHAPTERS } from './chapters';

/* Storybook reads its sidebar order from the preview file without running it, so the test asks Storybook's own reader for it. */
type Order = readonly (string | Order)[];
const under = (order: Order, name: string): Order => {
  const at = order.indexOf(name);
  const list = order[at + 1];
  expect(at, `${name} in the sidebar order`).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(list), `${name} has an order of its own`).toBe(true);
  return list as Order;
};

describe('the tutorial in the Storybook sidebar', () => {
  test('lists the chapters in the order a player meets them', () => {
    const preview = readFileSync(new URL('../../../../../.storybook/preview.tsx', import.meta.url), 'utf8');
    const sort = getStorySortParameter(preview) as { order: Order } | undefined;
    expect(sort, 'the sort Storybook finds in the preview').toBeDefined();
    const tutorial = under(under(sort!.order, 'Pages'), 'Tutorial');
    expect(tutorial).toEqual(['Landing', ...TUTORIAL_CHAPTERS.map((chapter) => chapter.title), 'Chapter complete']);
  });
});
