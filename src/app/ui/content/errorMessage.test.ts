import { expect, test } from 'vitest';

import { errorMessage } from './errorMessage';

test('loader errors keep their message across Error and serialized object shapes', () => {
  expect(errorMessage(new Error('The faction is unavailable.'))).toBe('The faction is unavailable.');
  expect(errorMessage({ message: 'The faction is unavailable.' })).toBe('The faction is unavailable.');
  expect(errorMessage('The faction is unavailable.')).toBe('The faction is unavailable.');
});

test('arbitrary thrown values have a readable fallback', () => {
  for (const error of [null, undefined, 42, {}, { message: 42 }]) {
    expect(errorMessage(error)).toBe('The page could not be loaded.');
  }
});
