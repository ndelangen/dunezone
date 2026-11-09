// @vitest-environment jsdom
import { afterEach, expect, test } from 'vite-plus/test';

import type { CardDef } from '@app/widgets/treachery-tracker/tracker';

import { playGame, savedGame, startGame } from './standaloneGame';

const DECK: CardDef[] = [
  {
    key: 'lasgun',
    name: 'Lasgun',
    kind: 'weapon',
    detail: 'Weapon - Special',
    face: 'https://example.test/lasgun.jpg',
    count: 1,
  },
];
const FACTIONS = [
  { id: 'atreides', name: 'Atreides' },
  { id: 'harkonnen', name: 'Harkonnen' },
];
const STORAGE_KEY = 'dune-zone:standalone-treachery-tracker';

afterEach(() => savedGame.set(null));

test('two changes from one tap both land, the second on top of the first', () => {
  savedGame.set(startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK));
  savedGame.update((game) => playGame(game, { kind: 'add', faction: 'harkonnen', card: null }));
  const slot = savedGame.get()!.state.hands.harkonnen![0]!.id;
  const card = savedGame.get()!.state.copies[0]!.id;
  /* "Discarded as…" names the unknown card, then discards it. */
  savedGame.update((game) => playGame(game, { kind: 'identify', faction: 'harkonnen', slot, card }));
  savedGame.update((game) => playGame(game, { kind: 'discard', faction: 'harkonnen', slot }));
  expect(savedGame.get()!.state.discard).toEqual([card]);
  expect(savedGame.get()!.state.hands.harkonnen).toEqual([]);
});

test('a saved game with one slot id in two hands does not open', () => {
  const game = startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK);
  const slot = { id: 's1', card: null };
  const stop = savedGame.subscribe(() => {});
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...game, state: { ...game.state, hands: { atreides: [slot], harkonnen: [slot] } } })
  );
  /* Another tab wrote it, so this one reads it afresh. */
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  expect(savedGame.get()).toBeNull();
  stop();
});

test('a page that mounts again reads what another tab saved while it was away', () => {
  const game = startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK);
  savedGame.set(game);
  const moved = playGame(game, { kind: 'add', faction: 'harkonnen', card: null });
  /* Another tab saves while nothing here listens, so no storage event reaches this one. */
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(moved));
  const stop = savedGame.subscribe(() => {});
  expect(savedGame.get()!.state.hands.harkonnen).toHaveLength(1);
  stop();
});

test('a saved card whose origin names a hand outside the game does not open', () => {
  const game = startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK);
  const card = game.state.copies[0]!.id;
  const slot = { id: 's1', card, from: { at: 'hand', faction: 'fremen', slot: 's0' } };
  const stop = savedGame.subscribe(() => {});
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...game, state: { ...game.state, hands: { ...game.state.hands, harkonnen: [slot] } } })
  );
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  expect(savedGame.get()).toBeNull();
  stop();
});

test('another tab clearing storage clears the game here too', () => {
  const stop = savedGame.subscribe(() => {});
  savedGame.set(startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK));
  window.localStorage.clear();
  /* A clear reaches other tabs as a storage event with no key. */
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  expect(savedGame.get()).toBeNull();
  stop();
});

test('a game the browser will not save says so until a save works', () => {
  const game = startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK);
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new DOMException('Full', 'QuotaExceededError');
  };
  try {
    savedGame.set(game);
    expect(savedGame.unsaved()).toBe(true);
    expect(savedGame.get()).toEqual(game);
  } finally {
    Storage.prototype.setItem = setItem;
  }
  savedGame.set(game);
  expect(savedGame.unsaved()).toBe(false);
});

test('a saved card whose origin names an extra hand no faction at the table holds does not open', () => {
  const game = startGame({ id: 'dreamrules', name: 'Dreamrules' }, FACTIONS, DECK);
  const card = game.state.copies[0]!.id;
  const slot = { id: 's1', card, from: { at: 'hand', faction: 'fremen', slot: 's0' } };
  const stop = savedGame.subscribe(() => {});
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...game, state: { ...game.state, hands: { ...game.state.hands, harkonnen: [slot], fremen: [] } } })
  );
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  expect(savedGame.get()).toBeNull();
  stop();
});
