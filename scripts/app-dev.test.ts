import { describe, expect, test } from 'vitest';

import { parseAppDevMode } from './app-dev';

describe('app:dev command', () => {
  test('keeps online development as the default and local mode explicit', () => {
    expect(parseAppDevMode([])).toEqual({ kind: 'cloud' });
    expect(parseAppDevMode(['--help'])).toEqual({ kind: 'help' });
    expect(() => parseAppDevMode(['--source', 'prod'])).toThrow('Unknown app:dev argument');
  });

  test('starts local mode from fixtures, and loads the snapshot or clones production only on request', () => {
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
    expect(parseAppDevMode(['--local', '--clone-prod'])).toEqual({ kind: 'local', data: { kind: 'clone-prod' } });
    for (const args of [
      ['--clone-prod'],
      ['--clone-prod', '--local'],
      ['--data=snapshot'],
      ['--local', '--data=prod'],
      ['--local', '--snapshot-file', 'snapshot.zip'],
      ['--local', '--data=snapshot', '--clone-prod'],
    ]) {
      expect(() => parseAppDevMode(args)).toThrow('Unknown app:dev argument');
    }
  });
});
