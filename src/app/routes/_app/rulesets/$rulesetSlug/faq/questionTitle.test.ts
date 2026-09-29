import { describe, expect, test } from 'vitest';

import { questionTitle } from './questionTitle';

describe('questionTitle', () => {
  test('keeps the words of every mark and drops its delimiters', () => {
    expect(questionTitle('When does the *storm* move -after- _bidding_?')).toBe(
      'When does the storm move after bidding?'
    );
  });

  test('keeps nested marks as their words', () => {
    expect(questionTitle('Is *the _spice_ blow* shared?')).toBe('Is the spice blow shared?');
  });

  test('returns plain source unchanged', () => {
    expect(questionTitle('Who moves first?')).toBe('Who moves first?');
  });

  test('returns source that does not parse as it was written', () => {
    expect(questionTitle('An *unclosed mark?')).toBe('An *unclosed mark?');
  });
});
