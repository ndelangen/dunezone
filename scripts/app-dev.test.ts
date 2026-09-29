import { describe, expect, test } from 'vitest';

import { parseAppDevMode } from './app-dev';

describe('app:dev command', () => {
  test('keeps online development as the default and local mode explicit', () => {
    expect(parseAppDevMode([])).toEqual({ kind: 'cloud' });
    expect(parseAppDevMode(['--help'])).toEqual({ kind: 'help' });
    expect(() => parseAppDevMode(['--source', 'prod'])).toThrow('Unknown app:dev argument');
  });

  test('starts local mode from fixtures and clones production only on request', () => {
    expect(parseAppDevMode(['--local'])).toEqual({ kind: 'local', data: 'fixture' });
    expect(parseAppDevMode(['--local', '--clone-prod'])).toEqual({ kind: 'local', data: 'clone-prod' });
    expect(() => parseAppDevMode(['--clone-prod'])).toThrow('Unknown app:dev argument');
    expect(() => parseAppDevMode(['--clone-prod', '--local'])).toThrow('Unknown app:dev argument');
  });
});
