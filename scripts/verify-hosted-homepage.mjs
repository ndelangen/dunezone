import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { CARRIED_BASE_Y, stackPreviewPositionFor } from '../src/shared/play/tableGeometry.ts';

const thumbnails = new Map([
  ['ns78nmym3qpth6sm9wsfj3ka9s8cw350', 'supplies'],
  ['ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq', 'trishula'],
  ['ns74r72v6mdmnn8ahdmj27c8gs8cz5t6', 'arrakeen'],
]);

async function artworkPixels(who, clip) {
  const image = await who.page.screenshot({
    clip,
    style: '#play-preview * { animation: none !important; }',
  });
  return sharp(image).removeAlpha().raw().toBuffer();
}

function changedArtworkRatio(before, after) {
  assert.equal(after.length, before.length);
  let changed = 0;
  for (let offset = 0; offset < before.length; offset += 3) {
    const difference = Math.max(
      Math.abs(before[offset] - after[offset]),
      Math.abs(before[offset + 1] - after[offset + 1]),
      Math.abs(before[offset + 2] - after[offset + 2])
    );
    changed += Number(difference > 20);
  }
  return changed / (before.length / 3);
}

async function verifyArtworkMotionPreference(who, center) {
  const clip = { x: Math.round(center.x) - 32, y: Math.round(center.y) - 32, width: 64, height: 64 };
  try {
    await who.page.emulateMedia({ reducedMotion: 'reduce' });
    await who.page.waitForFunction(() => document.querySelector('[data-homepage-motion="off"]'));
    const before = await artworkPixels(who, clip);
    await who.page.emulateMedia({ reducedMotion: 'no-preference' });
    await who.page.waitForFunction(() => document.querySelector('[data-homepage-motion="on"]'));
    const after = await artworkPixels(who, clip);
    const changed = changedArtworkRatio(before, after);
    assert.ok(
      changed < 0.01,
      `Changing motion preferences changed ${(changed * 100).toFixed(1)}% of settled troop artwork.`
    );
  } finally {
    await who.page.emulateMedia({ reducedMotion: null });
  }
}

/** An already-published local image, stored on the synthetic profile before authentication. */
export function homepageAvatar(origin) {
  const url = `${origin}/homepage-table/house-atreides-token.webp`;
  return { url, source_url: url, width: 512, height: 512 };
}

async function loadedAvatarBelowHand(who, kind, expectedUrl, until) {
  const hand = who.page.locator(`[data-table-hand="${kind}"]`);
  const image = hand.locator('img');
  await image.waitFor();
  await until(
    () => image.evaluate((element) => element.complete && element.naturalWidth > 0),
    `${who.label}'s ${kind} avatar did not load.`
  );
  assert.equal(await image.getAttribute('src'), expectedUrl);
  /* The remote hand eases toward its pointer, so both bounds must come from the same browser frame. */
  const bounds = await hand.evaluate((element) => {
    const avatar = element.querySelector('img')?.getBoundingClientRect();
    const glyph =
      element.dataset.tableHand === 'local'
        ? element.getBoundingClientRect()
        : element.querySelector(':scope > svg')?.getBoundingClientRect();
    return avatar && glyph ? { avatar: avatar.toJSON(), glyph: glyph.toJSON() } : null;
  });
  assert.ok(bounds, `${who.label}'s ${kind} hand and avatar need visible bounds.`);
  const { avatar, glyph } = bounds;
  assert.ok(avatar.y >= glyph.y + glyph.height, `${who.label}'s ${kind} avatar overlaps the hand.`);
  assert.ok(Math.abs(avatar.x + avatar.width / 2 - glyph.x - glyph.width / 2) < 3);
}

async function assertLocalHandAtPointer(who, position, until) {
  const hand = who.page.locator('[data-table-hand="local"]');
  await hand.waitFor();
  assert.match(
    await who.page.locator('#play-preview canvas').evaluate((canvas) => getComputedStyle(canvas).cursor),
    /data:image\/svg\+xml/,
    'The viewer needs a native browser cursor, independent of scene frames.'
  );
  let bounds;
  try {
    await until(async () => {
      bounds = await hand.boundingBox();
      return bounds && Math.hypot(bounds.x + 8 - position.x, bounds.y + 2 - position.y) < 3;
    }, 'The local hand did not reach the stationary pointer.');
  } catch (cause) {
    const viewport = await who.page.evaluate(() => ({
      scrollY: window.scrollY,
      clientLeft: document.documentElement.clientLeft,
      clientTop: document.documentElement.clientTop,
      gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    }));
    throw new Error(`Local hand position: ${JSON.stringify({ pointer: position, bounds, viewport })}`, { cause });
  }
}

async function scrollUnderPointer(who, position, until) {
  await who.page.mouse.move(position.x, position.y);
  await assertLocalHandAtPointer(who, position, until);
  const scrollTop = await who.page.evaluate(() => window.scrollY);
  await who.page.mouse.wheel(0, 50);
  await until(() => who.page.evaluate((top) => window.scrollY >= top + 45, scrollTop), 'The board did not scroll.');
  await assertLocalHandAtPointer(who, position, until);
  assert.equal(await who.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, position), 'CANVAS');
  await who.page.mouse.wheel(0, 1600);
  await until(
    () => who.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName !== 'CANVAS', position),
    'The board did not scroll out from beneath the pointer.'
  );
  await who.page.locator('[data-table-hand="local"]').waitFor({ state: 'hidden' });
}

function gestureActions(who, sentBefore) {
  return who.sent
    .slice(sentBefore)
    .filter((message) => message.type === 'act')
    .map((message) => message.message)
    .filter((action) => action.type !== 'pointer' && action.type !== 'renew')
    .slice(-8);
}

async function dragTroop({ member, source, start, finish, carrySteps, point, until }) {
  const sentBeforeDrag = member.sent.length;
  await member.page.mouse.down();
  await member.page.mouse.move(finish.x, finish.y, { steps: carrySteps });
  await member.page.mouse.up();
  try {
    await until(
      () =>
        member.view().snapshot.table.pieces.find((piece) => piece.id === source.id)?.items.length ===
        source.items.length - 1,
      'Dragging a troop did not remove it from its source stack.'
    );
  } catch (cause) {
    throw new Error(
      JSON.stringify({
        source: source.id,
        start,
        finish,
        current: await point(member, stackPreviewPositionFor(source)),
        shown: await member.page.evaluate(() =>
          window.__duneTable.pieces().filter((piece) => piece.selected || piece.localCarried)
        ),
        actions: gestureActions(member, sentBeforeDrag),
      }),
      { cause }
    );
  }
}

async function verifyReserveGesture({
  member,
  guest,
  source,
  start,
  target,
  destination,
  revision,
  wholeStack,
  until,
}) {
  const sentBefore = member.sent.length;
  await member.page.mouse.move(start.x, start.y);
  await member.page.mouse.down();
  if (wholeStack) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await member.page.mouse.move(target.x, target.y, { steps: 2 });
  try {
    await until(
      () =>
        member.page.evaluate(
          ({ destination: [x, z], expectedCount, sourceItems }) => {
            const held = window.__duneTable.pieces().find((piece) => piece.localCarried);
            return (
              held &&
              held.itemIds.every((id) => sourceItems.includes(id)) &&
              (expectedCount === null || held.count === expectedCount) &&
              Math.hypot(held.position[0] - x, held.position[2] - z) < 0.02
            );
          },
          {
            destination,
            expectedCount: wholeStack ? source.items.length : null,
            sourceItems: source.items.map((item) => item.id),
          }
        ),
      `The ${wholeStack ? 'whole-stack' : 'quick'} reserve drag did not carry the expected troops to the pointer.`
    );
  } catch (cause) {
    const shown = await member.page.evaluate(() =>
      window.__duneTable.pieces().filter((piece) => piece.selected || piece.localCarried)
    );
    throw new Error(
      JSON.stringify({
        wholeStack,
        source: source.id,
        start,
        target,
        shown,
        actions: gestureActions(member, sentBefore),
      }),
      { cause }
    );
  }
  await member.page.keyboard.press('Escape');
  await member.page.mouse.up();
  await until(
    () => member.page.evaluate(() => window.__duneTable.pieces().every((piece) => !piece.localCarried)),
    'Cancelling the reserve drag left a carried troop in the scene.'
  );
  assert.equal(member.view().snapshot.revision, revision);
  assert.equal(guest.view().snapshot.revision, revision);
  assert.deepEqual(
    member.view().snapshot.table.pieces.find((piece) => piece.id === source.id),
    source
  );
}

async function verifyReservePickup(member, guest, point, until, passed) {
  const reserves = member
    .view()
    .snapshot.table.pieces.filter((piece) => piece.id.startsWith('reserve-') && piece.items.length > 1);
  let source;
  let start;
  for (const reserve of reserves) {
    const position = await point(member, stackPreviewPositionFor(reserve));
    const visible = await member.page.evaluate(
      ({ x, y }) => y > 100 && y < innerHeight - 100 && document.elementFromPoint(x, y)?.tagName === 'CANVAS',
      position
    );
    if (visible) {
      source = reserve;
      start = position;
      break;
    }
  }
  assert.ok(source && start, 'A reserve stack needs to be available in the homepage viewport.');
  const target = await point(member, [source.position[0] * 0.8, CARRIED_BASE_Y, source.position[2] * 0.8]);
  const destination = [source.position[0] * 0.8, source.position[2] * 0.8];
  const revision = member.view().snapshot.revision;
  for (const wholeStack of [false, false, true]) {
    await verifyReserveGesture({ member, guest, source, start, target, destination, revision, wholeStack, until });
  }
  passed(
    'Repeated quick pickups and a whole-stack pickup follow the pointer and cancel without changing the shared table'
  );
}

/** Keeps the homepage's published marketing thumbnails local without opening the runner to external traffic. */
export async function installHomepageArtwork(context) {
  for (const [id, name] of thumbnails) {
    await context.route(`https://dune.zone/published/cards/${id}/card.jpg`, (route) =>
      route.fulfill({
        path: fileURLToPath(new URL(`../public/homepage-table/${name}.webp`, import.meta.url)),
        contentType: 'image/webp',
      })
    );
  }
}

/** A real signed-in visitor moves the public table while a separate unsigned visitor watches. */
export async function verifyHomepage({
  account,
  peer,
  origin,
  spectator,
  point,
  tableLoaded,
  recordRenderer,
  carrySteps,
  until,
  capture,
  passed,
}) {
  const member = await account('player-a');
  const guest = await peer('homepage-observer');
  /* Picking must work after the animated entrance as well as with reduced motion. */
  await member.page.emulateMedia({ reducedMotion: 'no-preference' });
  let artworkRequested = false;
  const releaseArtwork = Promise.withResolvers();
  /* Hold a scene image until the driver has checked the still-loading preview. */
  await member.context.route('**/homepage-table/snooper.webp', async (route) => {
    artworkRequested = true;
    await releaseArtwork.promise;
    await route.continue();
  });
  let releaseSnapshot;
  let snapshotReleased = false;
  let disconnectGuestSocket;
  await guest.context.routeWebSocket('**/__play/homepage/socket', (socket) => {
    const server = socket.connectToServer();
    const waiting = [];
    disconnectGuestSocket = () => socket.close({ code: 1012, reason: 'Verify preview reconnect' });
    server.onMessage((message) => {
      if (snapshotReleased) {
        socket.send(message);
      } else {
        waiting.push(message);
      }
    });
    releaseSnapshot = () => {
      snapshotReleased = true;
      for (const message of waiting) {
        socket.send(message);
      }
      waiting.length = 0;
    };
  });
  let initialCanvas;
  for (const who of [member, guest]) {
    await who.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await who.page.getByRole('link', { name: 'Take a sneak peek', exact: true }).click();
    await who.page.getByText('Try moving one of the pieces!', { exact: true }).waitFor();
    if (who === member) {
      await until(() => artworkRequested, 'The homepage did not request its scene artwork.');
      await who.page.locator('#play-preview [data-live-ready="true"]').waitFor();
      await who.page.locator('[data-table-connected="true"]').waitFor();
      /* Hand portraits are HTML overlays; the board itself must stay on the canvas. */
      assert.equal(await who.page.locator('#play-preview img:not([data-table-hand] img)').count(), 0);
      initialCanvas = await who.page.locator('#play-preview canvas').elementHandle();
      assert.ok(initialCanvas);
      await capture(member, 'homepage-board-before-slow-artwork');
      releaseArtwork.resolve();
    } else {
      await who.page.locator('#play-preview [data-live-ready="true"]').waitFor();
      assert.equal(await who.page.locator('[data-table-connected="true"]').count(), 0);
      initialCanvas = await who.page.locator('#play-preview canvas').elementHandle();
      assert.ok(initialCanvas);
      assert.ok(releaseSnapshot);
      await capture(guest, 'homepage-board-before-live-snapshot');
      releaseSnapshot();
      await who.page.locator('[data-table-connected="true"]').waitFor();
    }
    await who.page.locator('[data-live-ready="true"]').waitFor();
    await tableLoaded(who);
    await until(() => who.view(), `${who.label} received no homepage table.`);
    assert.equal(
      await initialCanvas.evaluate((canvas) => canvas === document.querySelector('#play-preview canvas')),
      true
    );
    if (who === member) {
      await capture(member, 'homepage-member-ready-after-slow-artwork');
    } else {
      const connectionId = guest.view().viewer.connectionId;
      await disconnectGuestSocket();
      await until(() => {
        const view = guest.view();
        return view && view.viewer.connectionId !== connectionId;
      }, 'The unsigned visitor did not receive a fresh snapshot after reconnecting.');
      assert.equal(
        await initialCanvas.evaluate((canvas) => canvas === document.querySelector('#play-preview canvas')),
        true
      );
    }
  }
  passed(
    'The homepage shows its board before delayed artwork, which finishes in place, and keeps one canvas through a reconnect'
  );
  await recordRenderer(member, '#play-preview canvas');
  await until(() => member.view().viewer.viewerSeat !== spectator, 'Signing in did not grant table handling.');
  assert.equal(guest.view().viewer.viewerSeat, spectator);
  assert.ok(member.sent.some((message) => message.type === 'authenticate' && message.ticketLength === 64));
  assert.equal(await member.page.getByRole('link', { name: 'Sign in to join in.' }).count(), 0);
  await guest.page.getByRole('link', { name: 'Sign in to join in.' }).waitFor();
  for (const who of [member, guest]) {
    assert.equal(await who.page.locator('.scene-piece-name, .scene-piece-count').count(), 0);
  }
  passed('The sneak peek invites signed-in handling and lets unsigned visitors watch without names or counts');

  const sourceId = 'starting-1-carthag';
  const source = member.view().snapshot.table.pieces.find((piece) => piece.id === sourceId);
  assert.ok(source, 'The prepared Carthag troops are missing.');
  const target = [source.position[0] + 0.6, source.position[1], source.position[2] + 0.6];
  const start = await point(member, stackPreviewPositionFor(source));
  const finish = await point(member, target);
  await member.page.mouse.click(start.x, start.y);
  await until(
    () =>
      member.page.evaluate((id) => window.__duneTable.pieces().find((piece) => piece.id === id)?.selected, sourceId),
    'Clicking a troop did not select it.'
  );
  const emptyBoard = await point(member, [1.7, 0.132, -0.5]);
  await member.page.mouse.click(emptyBoard.x, emptyBoard.y);
  await until(
    () =>
      member.page.evaluate((id) => !window.__duneTable.pieces().find((piece) => piece.id === id)?.selected, sourceId),
    'Clicking empty board space did not clear the troop selection.'
  );
  await member.page.evaluate(() => {
    document.addEventListener(
      'contextmenu',
      (event) => {
        window.__homepageContextMenuPrevented = event.defaultPrevented;
      },
      { once: true }
    );
  });
  await member.page.mouse.click(emptyBoard.x, emptyBoard.y, { button: 'right' });
  assert.equal(await member.page.evaluate(() => window.__homepageContextMenuPrevented), true);
  passed('Empty board clicks clear selection and the preview keeps its context-menu handling');
  const polarTroop = member.view().snapshot.table.pieces.find((piece) => piece.id === 'starting-5-polar');
  assert.ok(polarTroop, 'The prepared Polar Sink troop is missing.');
  await verifyArtworkMotionPreference(member, await point(member, polarTroop.position));
  passed('Settled troop artwork stays visible when reduced motion is turned off');
  await member.page.mouse.move(start.x, start.y);
  await until(
    () => guest.view().pointers.some((pointer) => pointer.connectionId === member.view().viewer.connectionId),
    'The unsigned visitor did not see the signed-in visitor pointer.'
  );
  await member.page.locator('[data-table-hand="local"]').waitFor();
  await guest.page.locator('[data-table-hand="remote"]').waitFor();
  await loadedAvatarBelowHand(member, 'local', homepageAvatar(origin).url, until);
  await loadedAvatarBelowHand(guest, 'remote', homepageAvatar(origin).url, until);
  passed('Authenticated avatars load below the local and remote hands');
  await dragTroop({ member, source, start, finish, carrySteps, point, until });
  const revision = member.view().snapshot.revision;
  await until(() => guest.view().snapshot.revision === revision, 'The unsigned visitor did not receive the drop.');
  const moved = member
    .view()
    .snapshot.table.pieces.find(
      (piece) => source.items.some((item) => item.id === piece.items[0]?.id) && piece.id !== sourceId
    );
  assert.ok(moved, 'The dropped troop is missing from the shared table.');
  await until(async () => {
    const shown = await guest.page.evaluate(
      (id) => window.__duneTable?.pieces().find((piece) => piece.id === id),
      moved.id
    );
    return shown && Math.hypot(shown.position[0] - moved.position[0], shown.position[2] - moved.position[2]) < 0.02;
  }, 'The unsigned visitor did not render the dropped troop at its shared position.');
  passed('A signed-in visitor moves a troop and the unsigned visitor sees its final position');
  const repick = await point(member, stackPreviewPositionFor(moved));
  await member.page.mouse.move(repick.x, repick.y);
  await member.page.mouse.down();
  await member.page.mouse.move(repick.x + 35, repick.y + 20, { steps: 2 });
  await until(
    () => member.page.evaluate(() => window.__duneTable.pieces().some((piece) => piece.localCarried)),
    'The dropped troop could not be picked up again.'
  );
  await member.page.keyboard.press('Escape');
  await member.page.mouse.up();
  await until(
    () => member.page.evaluate(() => window.__duneTable.pieces().every((piece) => !piece.localCarried)),
    'Cancelling the second pickup left a troop held.'
  );
  assert.equal(member.view().snapshot.revision, revision);
  passed('A dropped troop can be picked up again immediately and cancelled');

  await verifyReservePickup(member, guest, point, until, passed);

  const guestStart = await point(guest, moved.position);
  const sentBefore = guest.sent.length;
  await guest.page.mouse.move(guestStart.x, guestStart.y);
  await guest.page.locator('[data-table-hand="local"]').waitFor();
  await guest.page.mouse.down();
  await guest.page.mouse.move(guestStart.x + 50, guestStart.y + 25, { steps: carrySteps });
  await guest.page.mouse.up();
  await guest.page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  assert.equal(
    guest.sent.slice(sentBefore).some((message) => message.type === 'act'),
    false
  );
  assert.equal(member.view().snapshot.revision, revision);
  assert.equal(guest.view().snapshot.revision, revision);
  await capture(guest, 'homepage-observer-after-shared-drag');
  passed('Dragging as an unsigned visitor sends no handling command and leaves the table unchanged');
  await scrollUnderPointer(guest, guestStart, until);
  passed('A stationary pointer keeps its local hand while scrolling and loses it when the board leaves');
}
