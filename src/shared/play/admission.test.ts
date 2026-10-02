import { describe, expect, test } from 'vitest';

import { playStageSchema, tableHandlingOpen } from './admission';

describe('tableHandlingOpen', () => {
  test.each([
    ['drafting', false],
    ['swapping', false],
    ['setup', true],
    ['play', true],
    ['finished', false],
    ['discarded', false],
    [undefined, true],
  ] as const)('a table at the %s stage is open to handling: %s', (stage, open) => {
    expect(tableHandlingOpen(stage)).toBe(open);
  });

  test('every stage is covered', () => {
    expect(playStageSchema.options).toEqual(['drafting', 'swapping', 'setup', 'play', 'finished', 'discarded']);
  });
});
