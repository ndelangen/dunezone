import { expect, test } from 'vite-plus/test';

import { candidatesOf, fuzzy, rankSuggestions } from './suggestions';

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

const actions = (token: { faceUp: boolean; flip: () => void } | null, close = () => {}) => ({
  open: () => {},
  nextPhase: null,
  token,
  view: () => {},
  close,
});

test('the token commands appear only with a token, and Pass only while it shows its face', () => {
  const labels = (token: { faceUp: boolean; flip: () => void } | null) =>
    candidatesOf([], actions(token))
      .filter((entry) => entry.key.startsWith('cmd:token:'))
      .map((entry) => entry.label);
  expect(labels(null)).toEqual([]);
  expect(labels({ faceUp: true, flip: () => {} })).toEqual(['Flip faction token', 'Pass']);
  expect(labels({ faceUp: false, flip: () => {} })).toEqual(['Flip faction token']);
});

test('Pass closes the compass and turns the token over', () => {
  const calls: string[] = [];
  const all = candidatesOf(
    [],
    actions({ faceUp: true, flip: () => calls.push('flip') }, () => calls.push('close'))
  );
  rankSuggestions(all, 'pass')[0]!.run();
  expect(calls).toEqual(['close', 'flip']);
});

test('"top-down" finds the camera command, which closes the compass and turns the camera straight down', () => {
  const calls: string[] = [];
  const all = candidatesOf([], {
    ...actions(null, () => calls.push('close')),
    view: (view) => calls.push(`view:${view}`),
  });
  const [command] = rankSuggestions(all, 'top-down');
  expect(command?.label).toBe('Camera: top-down');
  command!.run();
  expect(calls).toEqual(['close', 'view:top']);
});
