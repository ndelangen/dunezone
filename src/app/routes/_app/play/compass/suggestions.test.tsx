import { expect, test } from 'vite-plus/test';

import { fuzzy, rankSuggestions } from './suggestions';

const candidate = (label: string, weight = 0) => ({
  key: label,
  label,
  hint: '',
  icon: null,
  run: () => {},
  text: label,
  weight,
});

test('letters in order anywhere in the text match, and adjacent or word-starting letters score higher', () => {
  expect(fuzzy('Shared inventory', 'shinv')).not.toBeNull();
  expect(fuzzy('Shared inventory', 'vni')).toBeNull();
  expect(fuzzy('Hand & spice', 'hand')!).toBeGreaterThan(fuzzy('Hidden zone and more', 'hand')!);
  expect(fuzzy('Table chat', 'tc')!).toBeGreaterThan(fuzzy('Battle act', 'tc')!);
});

test('with nothing typed the heaviest lead, six at most; typed, the best eight matches', () => {
  const all = [
    candidate('Phase', 5),
    candidate('Table chat', 10),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((letter) => candidate(`Window ${letter}`)),
  ];
  expect(rankSuggestions(all, '  ').map((entry) => entry.label)).toEqual([
    'Table chat',
    'Phase',
    'Window a',
    'Window b',
    'Window c',
    'Window d',
  ]);
  expect(rankSuggestions(all, 'win')).toHaveLength(7);
  expect(rankSuggestions(all, 'w').map((entry) => entry.label)).toHaveLength(7);
  expect(rankSuggestions(all, 'tab').map((entry) => entry.label)).toEqual(['Table chat']);
  expect(rankSuggestions(all, 'zz')).toEqual([]);
});
