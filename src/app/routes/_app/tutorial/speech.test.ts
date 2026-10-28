import { expect, test } from 'vite-plus/test';

import { spokenText } from './speech';

test('key caps are read by their names, and a letter key as that key', () => {
  expect(spokenText('Press {Space}, then {←} twice.')).toBe('Press Space, then left arrow twice.');
  expect(spokenText('Press {H} to open your hand, or {]} to pin it.')).toBe(
    'Press the H key to open your hand, or right bracket to pin it.'
  );
  expect(spokenText('Hold {Alt} and press {Enter}.')).toBe('Hold Alt and press Enter.');
});
