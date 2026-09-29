import { describe, expect, test } from 'vitest';

import { boardFurnitureFor } from './boardFurniture';

describe('boardFurnitureFor', () => {
  test.each([
    ['drafting', { storm: false, trackers: 'none' }],
    ['swapping', { storm: false, trackers: 'none' }],
    ['discarded', { storm: false, trackers: 'none' }],
    ['setup', { storm: false, trackers: 'spice' }],
    ['play', { storm: true, trackers: 'all' }],
    ['finished', { storm: true, trackers: 'all' }],
    [undefined, { storm: true, trackers: 'all' }],
  ] as const)('%s', (stage, furniture) => {
    expect(boardFurnitureFor(stage)).toEqual(furniture);
  });
});
