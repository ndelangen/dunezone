import assert from 'node:assert/strict';

import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';

/** Real deck menus and shortcuts against the isolated authority, with distinct private recipients. */
export async function verifyDecks({ seated, focus, openTab, point, capture, until, passed }) {
  const { a, b, observer } = await seated();
  const deck = (who) => who.view().snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck');
  const hands = (who) => who.view().snapshot.hand ?? [];
  await focus(a, 'map');
  const original = deck(a).items.map((item) => item.id);
  const piece = deck(a);
  const hit = await point(a, [piece.position[0], piece.position[1] + stackTopHeight(piece), piece.position[2]], 'map');
  await a.page.mouse.click(hit.x, hit.y, { button: 'right' });
  const menu = a.page.getByRole('menu', { name: 'Deck actions' });
  await menu.waitFor();
  await menu.getByRole('menuitem', { name: 'Draw a card', exact: true }).click();
  await until(() => hands(a).length === 1 && deck(a).items.length === 3, 'Draw did not move exactly one card.');
  assert.equal(await menu.isVisible(), true);
  await menu.getByRole('menuitem', { name: 'Deal 1 to Atreides', exact: true }).click();
  await until(() => hands(b).length === 1 && deck(b).items.length === 2, 'Deal did not reach the recipient.');
  assert.equal(hands(a).length, 1);
  assert.equal(hands(observer).length, 0);
  assert.equal(await menu.isVisible(), true);
  passed('One-card draw and direct deal keep the same menu open and give each recipient a private hand');
  await capture(a, 'deck-menu-after-draw-and-deal');
  await a.page.keyboard.press('Escape');
  await a.page.mouse.move(hit.x, hit.y);
  await a.page.keyboard.press('r');
  await until(() => !!deck(a).shuffleRevision, 'Hover plus R did not commit a shuffle.');
  assert.ok(deck(a).items.every((item) => !original.includes(item.id)));
  await until(() => deck(b).shuffleRevision === deck(a).shuffleRevision, 'Shuffle did not reach the other player.');
  await openTab(a, 'Hand');
  await a.page.getByRole('button', { name: /^Drag .* from hand$/ }).waitFor();
  await capture(a, 'private-hand-after-draw');
  const handCard = hands(a)[0];
  const beforeDrop = new Set(a.view().snapshot.table.pieces.map((piece) => piece.id));
  const control = a.page.getByRole('button', { name: /^Drag .* from hand$/ });
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  assert.ok(bounds);
  const landing = await point(a, [0, 0.38, 0], 'map');
  await a.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
  await a.page.mouse.down();
  await a.page.mouse.move(landing.x, landing.y, { steps: 25 });
  await a.page.mouse.up();
  await until(() => hands(a).length === 0, 'The hand card did not reach the table.');
  const dropped = a.view().snapshot.table.pieces.find((piece) => !beforeDrop.has(piece.id));
  assert.ok(dropped);
  assert.notEqual(dropped.id, handCard.id);
  await until(
    () => observer.view().snapshot.table.pieces.some((piece) => piece.id === dropped.id),
    'The observer did not receive the face-down drop.'
  );
  const publicDrop = observer.view().snapshot.table.pieces.find((piece) => piece.id === dropped.id);
  assert.equal(publicDrop.items[0].faceUp, false);
  assert.equal(publicDrop.items[0].artwork?.front, undefined);
  await capture(a, 'hand-card-dropped-face-down');
  passed('Dragging a private hand card onto the table retires its handle and exposes only its back');
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await b.page.locator('[data-connection="authorized"]').waitFor();
  await until(() => hands(b).length === 1, 'The dealt hand did not survive reconnect.');
  passed('The shuffle retires old card handles and the recipient keeps its hand across reconnect');
}
