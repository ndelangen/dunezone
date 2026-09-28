import assert from 'node:assert/strict';

import sharp from 'sharp';

import { PHASE_CHANGE_COOLDOWN_MS, phaseAt, tableProgressFor } from '../src/shared/play/phases.ts';

/**
 * Runs in the page: from now on, keeps each turn and phase the header names while its Previous and Next phase buttons are both disabled.
 * The mutation observer reads the header at the end of the task whose render changed it, before the cooldown's tick can enable the buttons again.
 * So the record does not depend on how long the verifier's round trips to the page take.
 */
function recordPhaseCooldowns() {
  const shown = new Set();
  const note = () => {
    const status = document.querySelector('.seated-header .seated-phase-status__copy');
    const buttons = [...document.querySelectorAll('.seated-header [aria-label="Phase navigation"] button')];
    const disabled = (name) => buttons.some((button) => button.textContent === name && button.disabled);
    if (status && disabled('Previous phase') && disabled('Next phase')) {
      shown.add([...status.children].map((child) => child.textContent).join(' '));
    }
  };
  new MutationObserver(note).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  Object.assign(window, { hostedPlayCooldowns: shown });
}

/** Real browser actions against the disposable Password backend and game Worker. */
export async function verifyPublicControls({
  account,
  createGame,
  seatThrough,
  playReady,
  depart,
  spectator,
  enter,
  button,
  act,
  focus,
  openTab,
  point,
  carrySteps,
  capture,
  until,
  passed,
  origin,
}) {
  /* Player B plays to Turn 1 and then gives up the seat, so player A holds the table alone until B asks for it back. */
  const a = await account('player-a');
  await createGame(a);
  const b = await account('player-b');
  await enter(b);
  await seatThrough(a, b);
  await playReady([a, b], []);
  const departed = b.view().viewer.viewerSeat;
  await depart(b);
  const inventory = (who) => who.view().snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  const requests = (who) => who.view().snapshot.controls.requests;
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
  const { observer } = await verifyRequests();
  await verifyInventoryDrag();
  await verifyReadiness();

  async function verifySolePlayer() {
    assert.notEqual(a.view().viewer.viewerSeat, spectator);
    /* `depart` waits for B's own view; A's copy of the departure is another frame on another socket (#1481). */
    await until(
      () => !a.view().snapshot.controls.seats.includes(departed),
      "Player B's departure did not reach player A's roster."
    );
    assert.deepEqual(a.view().snapshot.controls.seats, [a.view().viewer.viewerSeat]);
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
      'A real game starts play with an empty inventory, and its one remaining seated player spawns directly without changing existing pieces'
    );
  }

  async function verifyRequests() {
    await seatThrough(a, b);
    const observer = await account('observer');
    await enter(observer);
    assert.notEqual(b.view().viewer.viewerSeat, spectator);
    assert.equal(observer.view().viewer.viewerSeat, spectator);
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

    return { observer };
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
    await a.page.mouse.move(destination.x, destination.y, { steps: carrySteps });
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
    const viewers = [a, b, observer];
    for (const who of viewers) {
      await who.page.evaluate(recordPhaseCooldowns);
    }
    while (a.view().snapshot.phase < 8) {
      await act(a, 'Next phase');
      /* The launcher provisions this flow's game with the real cooldown, which the change's frame states. */
      assert.ok(
        a.phaseCooldown.ms > PHASE_CHANGE_COOLDOWN_MS / 2,
        `The phase change stated a ${a.phaseCooldown.ms} ms cooldown instead of the real ${PHASE_CHANGE_COOLDOWN_MS} ms.`
      );
      const { phase, phases } = a.view().snapshot;
      await until(() => b.view().snapshot.phase === phase, 'Phase did not reach the other player.');
      /*
       * Each page notes the turn and phase its header named whenever both buttons were disabled.
       * From phase 1 on, a seated player's Previous is disabled only while the cooldown runs or while this page cannot act, as during a suspension, a re-admission or playback.
       * A note naming the new phase is therefore that phase's cooldown or a loss of interaction during that phase, and never the cooldown of the phase before it.
       */
      const shown = `Turn ${tableProgressFor(phase, phases).turn} ${phaseAt(phase, phases).label}`;
      for (const who of viewers) {
        await until(
          () => who.page.evaluate((key) => window.hostedPlayCooldowns.has(key), shown),
          `${who.label}'s phase controls did not render the cooldown.`
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
    assert.ok(a.view().snapshot.controls.ready.includes(a.view().viewer.viewerSeat));
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
      `The ${PHASE_CHANGE_COOLDOWN_MS / 1000}-second phase cooldown disables both header buttons for every viewer; observers cannot Ready, request, approve, dismiss or drag inventory`
    );
  }
}
