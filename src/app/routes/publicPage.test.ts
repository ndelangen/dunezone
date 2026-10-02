import { describe, expect, test } from 'vitest';

import { publicDescription } from './publicPage';

describe('public metadata excerpts', () => {
  test('reads marked prose and lists as plain text', () => {
    expect(publicDescription('*Important* -words- with _emphasis_.\n\n- First item\n- Second item')).toBe(
      'Important words with emphasis. First item Second item'
    );
  });

  test('keeps empty excerpts empty and bounds Unicode text without splitting a character', () => {
    expect(publicDescription(undefined)).toBe('');
    expect(publicDescription('  ')).toBe('');
    expect(publicDescription('A'.repeat(199) + '🌕tail')).toBe('A'.repeat(199) + '🌕');
  });
});
