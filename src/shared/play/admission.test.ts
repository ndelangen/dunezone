import { describe, expect, test } from 'vite-plus/test';

import { playStageSchema, tableHandlingOpen } from './admission';

const HANDLING_BY_STAGE = [
  ['drafting', false],
  ['swapping', false],
  ['setup', true],
  ['play', true],
  ['finished', false],
  ['discarded', false],
  [undefined, true],
] as const;

describe('tableHandlingOpen', () => {
  test.each(HANDLING_BY_STAGE)('a table at the %s stage is open to handling: %s', (stage, open) => {
    expect(tableHandlingOpen(stage)).toBe(open);
  });

  test('every stage is covered', () => {
    expect(HANDLING_BY_STAGE.flatMap(([stage]) => (stage ? [stage] : []))).toEqual(playStageSchema.options);
  });
});
