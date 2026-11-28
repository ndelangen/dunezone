import { alliesOf, hasOffer } from '@shared/play/alliances';
/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import { alliancesAndTalking, suitorOffers } from './alliancesAndTalking';
import { chapterTable } from './chapterTable.test.fixture';

let game: ReturnType<typeof chapterTable>;
const seatOf = (name: string) => game.snapshot().roster!.seats.find((seat) => seat.faction?.name === name)!;
const fremen = () => seatOf('Fremen');
const mine = () => game.snapshot().bank!.factionId;
const offered = () => hasOffer(game.snapshot().alliances, fremen().faction!.id, mine());
const allied = () => alliesOf(game.snapshot().alliances, mine()).includes(fremen().faction!.id);

beforeEach(() => {
  game = chapterTable(alliancesAndTalking);
});
afterEach(() => {
  game.dispose();
  document.body.innerHTML = '';
});

test('Fremen offers the learner an alliance, once', () => {
  suitorOffers(game.snapshot, game.players, fremen);
  suitorOffers(game.snapshot, game.players, fremen);
  expect(offered()).toBe(true);
  expect(game.snapshot().alliances!.offers.filter((offer) => offer.to === mine())).toHaveLength(1);
});

test('a learner who offered Fremen first gets that offer accepted rather than a refused counter-offer', () => {
  game.act({ kind: 'alliance-offer', factionId: fremen().faction!.id });
  suitorOffers(game.snapshot, game.players, fremen);
  expect(allied()).toBe(true);
});

test('a chapter opened at Switch sides still has the offer to accept', () => {
  game.step('accept');
  expect(offered()).toBe(true);
  game.act({
    kind: 'alliance-accept',
    factionId: fremen().faction!.id,
    offer: game.snapshot().alliances!.offers[0]!.id,
  });
  expect(allied()).toBe(true);
});

test('opening Alliances without a standing offer does not finish Read an alliance offer', () => {
  const alliances = document.createElement('div');
  alliances.dataset['panel'] = 'alliances';
  const step = game.step('incoming');
  /* The offer was made as the step began; take it back to stand for one the table refused. */
  const standing = game.snapshot().alliances!.offers.find((offer) => offer.to === mine())!;
  game.players.act(fremen().id, { kind: 'alliance-withdraw', factionId: mine(), offer: standing.id });
  expect(offered()).toBe(false);
  document.body.append(alliances);
  expect(step.done()).toBe(false);
});
