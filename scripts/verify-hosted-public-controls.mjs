import assert from 'node:assert/strict';

import sharp from 'sharp';

/** Real browser actions against the disposable Password backend and game Worker. */
export async function verifyPublicControls({
  peer,
  signIn,
  enter,
  focus,
  openTab,
  point,
  capture,
  until,
  passed,
  origin,
}) {
  const a = await peer('player-a');
  await signIn(a);
  await enter(a);
  const inventory = (who) => who.view().snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  const requests = (who) => who.view().snapshot.controls.requests;
  const button = (who, name) => who.page.getByRole('button', { name, exact: true });
  async function act(who, name) {
    await until(() => button(who, name).isEnabled(), `${name} did not become enabled.`, 20_000);
    /* Read after the control is enabled: the other player's commit that enabled it has then
       reached this view, so the next revision is this click's and not that one arriving late. */
    const before = who.view().snapshot.revision;
    await button(who, name).click();
    await until(() => who.view().snapshot.revision > before, `${name} did not commit.`);
  }
  async function facePixels(who, piece, face) {
    const center = await point(who, [piece.position[0], piece.position[1] + 0.05, piece.position[2]], 'map');
    const png = await who.page.screenshot();
    const { data, info } = await sharp(png)
      .extract({ left: Math.round(center.x) - 12, top: Math.round(center.y) - 12, width: 24, height: 24 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const expected =
      face === 'back'
        ? { channel: 2, contrastChannel: 0, ratio: 1.2, minimum: 40 }
        : { channel: 0, contrastChannel: 1, ratio: 1.5, minimum: 70 };
    let pixels = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      const channel = data[index + expected.channel];
      const contrast = data[index + expected.contrastChannel];
      if (channel > contrast * expected.ratio && channel > expected.minimum) {
        pixels++;
      }
    }
    return pixels > 3;
  }
  async function choose(who) {
    await openTab(who, 'Shared inventory');
    if (await button(who, 'Add from catalogue').count()) {
      await button(who, 'Add from catalogue').click();
    }
    await who.page.getByRole('combobox', { name: 'Catalogue asset' }).click();
    await who.page.getByRole('option', { name: 'Recovery token', exact: true }).click();
  }
  await verifySolePlayer();
  const { b, observer } = await verifyRequests();
  await verifyInventoryDrag();
  await verifyReadiness();

  async function verifySolePlayer() {
    assert.equal(a.view().viewer.viewerSeat, 'harkonnen');
    assert.equal(inventory(a).length, 0);
    const original = structuredClone(a.view().snapshot.table.pieces);
    await focus(a, 'map');
    await capture(a, 'after-hosted-map-1440x1000');
    await a.page.setViewportSize({ width: 900, height: 1000 });
    await focus(a, 'map');
    const phaseBounds = await a.page.locator('.seated-phase-status').boundingBox();
    const toolbarBounds = await a.page.locator('.seated-toolbar').boundingBox();
    assert.ok(
      phaseBounds.x + phaseBounds.width <= toolbarBounds.x || phaseBounds.y + phaseBounds.height <= toolbarBounds.y,
      'Header controls overlap the phase label.'
    );
    await capture(a, 'after-hosted-map-900x1000');
    await a.page.setViewportSize({ width: 1440, height: 1000 });
    await focus(a, 'map');
    await choose(a);
    await act(a, 'Spawn');
    assert.equal(inventory(a).length, 1);
    assert.equal(requests(a).length, 0);
    assert.deepEqual(
      a.view().snapshot.table.pieces.filter((piece) => !piece.inventory),
      original
    );
    await button(a, 'Close catalogue').click();
    await a.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
    await button(a, 'Drag Recovery token onto the table').scrollIntoViewIfNeeded();
    await capture(a, 'after-sole-player-inventory');
    passed(
      'Fresh Worker starts with an empty inventory and one seated player spawns directly without changing existing pieces'
    );
  }

  async function verifyRequests() {
    const b = await peer('player-b');
    await signIn(b);
    await enter(b);
    const observer = await peer('observer');
    await signIn(observer);
    await enter(observer);
    assert.equal(b.view().viewer.viewerSeat, 'atreides');
    assert.equal(observer.view().viewer.viewerSeat, 'neutral');
    assert.notEqual(a.view().viewer.userId, b.view().viewer.userId);
    await until(() => a.view().snapshot.controls.seats.length === 2, 'Joining did not update the roster.');
    await choose(a);
    await act(a, 'Request');
    await until(() => requests(b).length === 1 && requests(observer).length === 1, 'Pending request was not public.');
    assert.equal(inventory(a).length, 1);
    assert.equal(await button(a, 'Approve').isDisabled(), true);
    await openTab(observer, 'Shared inventory');
    for (const name of ['Approve', 'Dismiss', 'Add from catalogue', 'Previous phase', 'Next phase']) {
      assert.equal(await button(observer, name).isDisabled(), true);
    }
    assert.equal(await button(observer, 'Drag Recovery token onto the table').isDisabled(), true);
    await openTab(b, 'Shared inventory');
    await b.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
    await button(b, 'Approve').scrollIntoViewIfNeeded();
    await capture(b, 'after-pending-request');
    await a.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    await act(b, 'Approve');
    assert.equal(inventory(b).length, 2);
    await enter(a);
    await until(
      () => inventory(a).length === 2 && requests(a).length === 0,
      'Reconnect did not restore the approved inventory.'
    );
    passed(
      'Distinct players share a pending request; the requester cannot self-approve, an offline requester remains seated, and another player approves the captured contents'
    );
    await choose(a);
    await act(a, 'Request');
    await act(b, 'Dismiss');
    await until(() => requests(a).length === 0, 'Dismissal was not shared.');
    assert.equal(inventory(a).length, 2);
    await button(a, 'Close catalogue').click();
    passed('Any seated player can dismiss a request without spawning its contents');

    return { b, observer };
  }

  async function verifyInventoryDrag() {
    await focus(a, 'map');
    await openTab(a, 'Shared inventory');
    const token = inventory(a)[0];
    const thumbnail = button(a, 'Drag Recovery token onto the table').first();
    await thumbnail.scrollIntoViewIfNeeded();
    const bounds = await thumbnail.boundingBox();
    assert.ok(bounds);
    await a.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await a.page.mouse.down();
    await until(
      () => a.sent.some((message) => message.type === 'begin' && message.sourcePieceId === token.id),
      'Inventory drag did not begin.'
    );
    const destination = await point(a, [0, 0.38, 0], 'map');
    await a.page.mouse.move(destination.x, destination.y, { steps: 12 });
    await a.page.mouse.up();
    await until(
      () => a.view().snapshot.table.pieces.some((piece) => piece.id === token.id && !piece.inventory),
      'Inventory drop did not reach the board.'
    );
    const dropped = () => a.view().snapshot.table.pieces.find((piece) => piece.id === token.id);
    assert.ok(dropped().items.every((item) => item.faceUp === false));
    await until(
      () => b.view().snapshot.revision === a.view().snapshot.revision,
      'Drop did not reach the other player.'
    );
    await until(() => facePixels(a, dropped(), 'back'), 'The published blue back did not render on the board.');
    await a.page.keyboard.press('f');
    await until(
      () => dropped().items.every((item) => item.faceUp === true),
      'Ordinary flip did not turn the spawned piece face up.'
    );
    await until(() => facePixels(a, dropped(), 'front'), 'The published red front did not render after flipping.');
    await capture(a, 'after-inventory-drag-and-flip');
    passed(
      'Inventory drag uses the ordinary carry boundary, lands face down for both players, and can be flipped manually'
    );
  }

  async function verifyReadiness() {
    for (let phase = 1; phase <= 8; phase++) {
      await act(a, 'Next phase');
      assert.equal(a.view().snapshot.phase, phase);
      await until(() => b.view().snapshot.phase === phase, 'Phase did not reach the other player.');
      for (const who of [a, b, observer]) {
        /* A received frame can precede the render that disables the controls. */
        await until(
          async () =>
            (await button(who, 'Next phase').isDisabled()) && (await button(who, 'Previous phase').isDisabled()),
          `${who.label}'s phase controls did not render the cooldown.`,
          2500
        );
      }
    }
    await act(a, 'Ready');
    assert.equal(a.view().snapshot.phase, 8);
    assert.equal(await button(a, 'Next phase').isDisabled(), true);
    await act(a, 'Withdraw readiness');
    assert.deepEqual(a.view().snapshot.controls.ready, []);
    await act(a, 'Ready');
    const saved = structuredClone(a.view().snapshot);
    await a.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    await act(b, 'Ready');
    assert.equal(b.view().snapshot.phase, 8);
    await until(() => button(b, 'Next phase').isEnabled(), 'Last ready did not enable Next.', 20_000);
    await enter(a);
    assert.equal(a.view().snapshot.phase, 8);
    assert.ok(a.view().snapshot.controls.ready.includes('harkonnen'));
    assert.deepEqual(a.view().snapshot.table.pieces, saved.table.pieces);
    assert.equal(await button(observer, 'Ready').isDisabled(), true);
    await a.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
    await button(a, 'Withdraw readiness').scrollIntoViewIfNeeded();
    await capture(a, 'after-mentat-ready');
    await act(a, 'Withdraw readiness');
    await until(() => button(b, 'Next phase').isDisabled(), 'Withdrawal did not disable Next.');
    await act(a, 'Ready');
    assert.equal(a.view().snapshot.phase, 8);
    await act(b, 'Next phase');
    assert.equal(b.view().snapshot.phase, 9);
    await act(b, 'Previous phase');
    assert.equal(b.view().snapshot.phase, 8);
    assert.deepEqual(b.view().snapshot.controls.ready, []);
    assert.deepEqual(b.view().snapshot.table.pieces, saved.table.pieces);
    await until(() => a.view().snapshot.phase === 8, 'Revisit did not reach the other player.');
    await capture(a, 'after-mentat-revisit');
    passed(
      'Ready and withdrawal are separate from Next; readiness survives Mentat reconnect, last-ready enables explicit advance, and revisiting clears readiness without undoing pieces'
    );
    passed(
      'The eight-second phase cooldown disables both header buttons for every viewer; observers cannot Ready, request, approve, dismiss or drag inventory'
    );
  }
}
