import { describe, expect, test } from 'vitest';

import { parseAppDevMode } from './app-dev';

describe('app:dev command', () => {
  test('keeps online development as the default and local mode explicit', () => {
    expect(parseAppDevMode([])).toBe('cloud');
    expect(parseAppDevMode(['--local'])).toBe('local');
    expect(parseAppDevMode(['--help'])).toBe('help');
    expect(() => parseAppDevMode(['--source', 'prod'])).toThrow('Unknown app:dev argument');
  });
});
