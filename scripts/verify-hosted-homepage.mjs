import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const thumbnails = new Map([
  ['ns78nmym3qpth6sm9wsfj3ka9s8cw350', 'supplies'],
  ['ns7cgwf2xm2ppj3c5jtpnnehf98cxcbq', 'trishula'],
  ['ns74r72v6mdmnn8ahdmj27c8gs8cz5t6', 'arrakeen'],
]);

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
  const guest = await peer('unsigned');
  for (const who of [member, guest]) {
    await who.page.goto(origin, { waitUntil: 'domcontentloaded' });
    await who.page.getByRole('link', { name: 'Take a sneak peek', exact: true }).click();
    await who.page.getByText('Try moving one of the pieces!', { exact: true }).waitFor();
    await who.page.locator('[data-live-ready="true"]').waitFor();
    await tableLoaded(who);
    await until(() => who.view(), `${who.label} received no homepage table.`);
  }
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
  const start = await point(member, source.position);
  const finish = await point(member, target);
  await member.page.mouse.move(start.x, start.y);
  await until(
    () => guest.view().pointers.some((pointer) => pointer.connectionId === member.view().viewer.connectionId),
    'The unsigned visitor did not see the signed-in visitor pointer.'
  );
  await member.page.mouse.down();
  await member.page.mouse.move(finish.x, finish.y, { steps: carrySteps });
  await member.page.mouse.up();
  await until(
    () =>
      member.view().snapshot.table.pieces.find((piece) => piece.id === sourceId)?.items.length ===
      source.items.length - 1,
    'Dragging a troop did not remove it from its source stack.'
  );
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

  const guestStart = await point(guest, moved.position);
  const sentBefore = guest.sent.length;
  await guest.page.mouse.move(guestStart.x, guestStart.y);
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
}
