import { describe, expect, test } from 'vitest';

import { parseAppDevMode } from './app-dev';

describe('app:dev command', () => {
  test('keeps online development as the default and local mode explicit', () => {
    expect(parseAppDevMode([])).toEqual({ kind: 'cloud' });
    expect(parseAppDevMode(['--help'])).toEqual({ kind: 'help' });
    expect(() => parseAppDevMode(['--source', 'prod'])).toThrow('Unknown app:dev argument');
  });

  test('starts local mode from fixtures, loads the snapshot only on request, and has no raw production clone', () => {
    expect(parseAppDevMode(['--local'])).toEqual({ kind: 'local', data: { kind: 'fixture' } });
    expect(parseAppDevMode(['--local', '--data=fixture'])).toEqual({ kind: 'local', data: { kind: 'fixture' } });
    expect(parseAppDevMode(['--local', '--data=snapshot'])).toEqual({
      kind: 'local',
      data: { kind: 'snapshot', file: null },
    });
    expect(parseAppDevMode(['--local', '--data=snapshot', '--snapshot-file', 'snapshot.zip'])).toEqual({
      kind: 'local',
      data: { kind: 'snapshot', file: 'snapshot.zip' },
    });
    for (const args of [
      ['--local', '--clone-prod'],
      ['--clone-prod'],
      ['--data=snapshot'],
      ['--local', '--data=prod'],
      ['--local', '--snapshot-file', 'snapshot.zip'],
      ['--local', '--data=snapshot', '--clone-prod'],
    ]) {
      expect(() => parseAppDevMode(args)).toThrow('Unknown app:dev argument');
    }
  });
});
