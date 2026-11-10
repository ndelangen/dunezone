import { expect, test } from 'vite-plus/test';

import { clipAtWord } from './social-card';

test('card text that is cut ends on a whole word', () => {
  expect(clipAtWord('Move a piece, carry a stack, then split it', 20)).toBe('Move a piece…');
});

test('card text that fits keeps an ellipsis its author wrote', () => {
  expect(clipAtWord('Wait for it…', 120)).toBe('Wait for it…');
  expect(clipAtWord('Short', 120)).toBe('Short');
});
