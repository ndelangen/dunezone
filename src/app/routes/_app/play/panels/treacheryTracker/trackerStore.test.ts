// @vitest-environment jsdom
import { expect, test } from 'vite-plus/test';

import { newTracker, trackerReducer } from './tracker';
import type { CardDef } from './tracker';
import { forgetTrackers, trackerStore } from './trackerStore';

const DECK: CardDef[] = [
  {
    key: 'lasgun',
    name: 'Lasgun',
    kind: 'weapon',
    detail: 'Weapon - Special',
    face: 'https://example.test/l.jpg',
    count: 1,
  },
];
const FACTIONS = ['atreides', 'emperor'];

test('a tracker saved before the table was followed opens as it was saved', () => {
  forgetTrackers();
  const saved = trackerReducer(newTracker(DECK, FACTIONS), { kind: 'add', faction: 'emperor', card: 'lasgun#1' });
  window.localStorage.setItem('old', JSON.stringify(saved));
  expect(trackerStore('old', DECK, FACTIONS).get().state.hands).toEqual(saved.hands);
});

test('a read that follows nothing saves nothing', () => {
  forgetTrackers();
  trackerStore('quiet', DECK, FACTIONS).follow({ turn: 1, peek: null });
  expect(window.localStorage.getItem('quiet')).toBeNull();
});
