import assert from 'node:assert/strict';

import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';

/** Real deck menus and shortcuts against the isolated authority, with distinct private recipients. */
export async function verifyDecks({
  seated,
  factionOf,
  treacheryDeck,
  converged,
  focus,
  openTab,
  point,
  capture,
  until,
  passed,
  origin,
}) {
  const { a, b, observer } = await seated();
  const deckId = treacheryDeck(a);
  const deck = (who) => who.view().snapshot.table.pieces.find((piece) => piece.id === deckId);
  /* Setup dealt each player's leaders into the same private inventory; only cards count here. */
  const hands = (who) => (who.view().snapshot.hand ?? []).filter((piece) => piece.kind === 'card');
  await focus(a, 'map');
  const original = deck(a).items.map((item) => item.id);
  const size = original.length;
  const piece = deck(a);
  const hit = await point(a, [piece.position[0], piece.position[1] + stackTopHeight(piece), piece.position[2]]);
  await a.page.mouse.click(hit.x, hit.y, { button: 'right' });
  const menu = a.page.getByRole('menu', { name: 'Deck actions' });
  await menu.waitFor();
  await menu.getByRole('menuitem', { name: 'Draw a card', exact: true }).click();
  await until(() => hands(a).length === 1 && deck(a).items.length === size - 1, 'Draw did not move exactly one card.');
  assert.equal(await menu.isVisible(), true);
  await menu.getByRole('menuitem', { name: `Deal 1 to ${factionOf(b).name}`, exact: true }).click();
  await until(() => hands(b).length === 1 && deck(b).items.length === size - 2, 'Deal did not reach the recipient.');
  /* The observer's empty hand counts only once its view holds the deal (#1481). */
  await converged([a, b, observer]);
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
  const handCard = hands(a)[0];
  const control = a.page.getByRole('button', { name: `Drag ${handCard.items[0].artwork.name} from hand`, exact: true });
  await control.waitFor();
  await capture(a, 'private-hand-after-draw');
  const beforeDrop = new Set(a.view().snapshot.table.pieces.map((piece) => piece.id));
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  assert.ok(bounds);
  const landing = await point(a, [0, 0.38, 0]);
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
  /* B reloads into a publisher outage for the deck's back and the dealt card's front, until both have failed once (#1232). */
  const dealt = hands(b)[0].items[0].artwork;
  const backPath = publishedPath(deck(b).items[0].artwork.back, origin);
  const frontPath = publishedPath(dealt.front, origin);
  const outage = { on: true, failed: new Set() };
  await b.context.addInitScript(observeScenes);
  await b.context.route(
    (url) => url.origin === origin && (url.pathname === backPath || url.pathname === frontPath),
    async (route) => {
      if (outage.on) {
        outage.failed.add(new URL(route.request().url()).pathname);
        await route.fulfill({ status: 503, body: '' });
        return;
      }
      await route.fallback();
    }
  );
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await b.page.locator('[data-connection="authorized"]').waitFor();
  await until(() => hands(b).length === 1, 'The dealt hand did not survive reconnect.');
  passed('The shuffle retires old card handles and the recipient keeps its hand across reconnect');
  await openTab(b, 'Hand');
  const dealtControl = b.page.getByRole('button', { name: `Drag ${dealt.name} from hand`, exact: true });
  await dealtControl.locator('[data-phase="missing"]').waitFor();
  await until(
    () => outage.failed.has(backPath) && outage.failed.has(frontPath),
    'The outage did not reach both the deck back and the dealt card.'
  );
  assert.ok(await b.page.evaluate(() => window.hostedPlayScenes?.length > 0), 'No three.js scene was observed.');
  assert.equal(await b.page.evaluate(texturedFaces, backPath), 0);
  /* Lifted before any capture, so both first retries, 5 s after their failures, find the publisher answering. */
  outage.on = false;
  await capture(b, 'published-images-during-outage');
  await until(
    async () => (await b.page.evaluate(texturedFaces, backPath)) > 0,
    'The deck back texture did not recover after the outage.'
  );
  await dealtControl.locator('[data-phase="shown"] img').waitFor();
  await capture(b, 'published-images-after-outage');
  passed('A table texture and a hand image that failed to load recover once the publisher answers again');
}

function publishedPath(href, origin) {
  return new URL(href, origin).pathname;
}

/** Runs in the page before its scripts: keeps each three.js scene the page creates, through the devtools hook the renderer observer installed. */
function observeScenes() {
  const scenes = [];
  window.__THREE_DEVTOOLS__?.addEventListener('observe', (event) => {
    if (event.detail?.isScene) {
      scenes.push(new WeakRef(event.detail));
    }
  });
  Object.assign(window, { hostedPlayScenes: scenes });
}

/** Counts the page's meshes whose material draws the published image at `path`. */
function texturedFaces(path) {
  let count = 0;
  for (const scene of window.hostedPlayScenes ?? []) {
    scene.deref()?.traverse((object) => {
      const source = object.material?.map?.image?.src;
      if (source && new URL(source).pathname === path) {
        count += 1;
      }
    });
  }
  return count;
}
