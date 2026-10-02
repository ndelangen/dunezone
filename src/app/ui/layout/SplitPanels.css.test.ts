import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync(new URL('./SplitPanels.module.css', import.meta.url), 'utf8');

function coarseBlock() {
  const start = css.indexOf('@media (pointer: coarse)');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    depth += css[index] === '{' ? 1 : css[index] === '}' ? -1 : 0;
    if (depth === 0) {
      return css.slice(start, index + 1);
    }
  }
  throw new Error('Unclosed coarse-pointer block.');
}

/* The track is only --space-sm thick, too thin for a finger; a coarse pointer gets an invisible hit area at least 24px across. */
test.each([
  ['horizontal', 'height'],
  ['vertical', 'width'],
])('a %s separator gives a finger at least 24px to grab, and draws nothing there', (orientation, size) => {
  const block = coarseBlock();
  const rule = block.match(
    new RegExp(`\\[data-orientation="${orientation}"\\] > \\.separator::after \\{([^}]*)\\}`)
  )?.[1];
  expect(rule).toMatch(new RegExp(`(^|\\s)${size}: max\\(24px, 100%\\);`));
  expect(block).not.toMatch(/::after[^{]*\{[^}]*(background|border|box-shadow|outline)/);
});
