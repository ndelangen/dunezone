import { describe, expect, test } from 'vitest';

import { shuffleStart } from './useDeckShuffleAnimation';

describe('shuffleStart', () => {
  test('a new shuffle starts the wobble only while it is allowed', () => {
    expect(shuffleStart(null, true, true, 100)).toBe(100);
    expect(shuffleStart(null, true, false, 100)).toBeNull();
  });

  test('turning Motion off mid-shuffle stops the wobble, and turning it back on does not restart it', () => {
    const running = shuffleStart(null, true, true, 100);
    const stopped = shuffleStart(running, false, false, 200);
    expect(stopped).toBeNull();
    expect(shuffleStart(stopped, false, true, 300)).toBeNull();
  });

  test('a running wobble keeps its start while nothing changes', () => {
    expect(shuffleStart(100, false, true, 200)).toBe(100);
  });
});
