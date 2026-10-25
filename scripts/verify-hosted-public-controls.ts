import assert from 'node:assert/strict';

import sharp from 'sharp';

import { lastTurnOf, turnCaption } from '../src/shared/play/lastTurn.ts';
import { PHASE_CHANGE_COOLDOWN_MS, phaseAt, tableProgressFor } from '../src/shared/play/phases.ts';
import type { HostedToolkit } from './verify-hosted-play-browser.ts';
import { required, requireView } from './verify-hosted-types.ts';
import type { HostedPeer, TablePiece } from './verify-hosted-types.ts';

/**
 * Runs in the page: from now on, keeps each turn and phase the header names while its Next phase button is disabled.
 * The mutation observer reads the header at the end of the task whose render changed it, before the cooldown's tick can enable the button again.
 * So the record does not depend on how long the verifier's round trips to the page take.
 */
function recordPhaseCooldowns() {
  const shown = new Set<string>();
  const note = () => {
    const status = document.querySelector('.seated-header .seated-phase-status__copy');
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('.seated-header [aria-label="Phase navigation"] button'),
    ];
    const disabled = (name: string) => buttons.some((button) => button.textContent === name && button.disabled);
    if (status && disabled('Next phase')) {
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
  previousPhaseDisabled,
  act,
  focus,
  openTab,
  pinWindow,
  growSlot,
  pickCatalogueAsset,
  point,
  carrySteps,
  capture,
  until,
  passed,
  origin,
}: HostedToolkit) {
  /*
   * Player B takes the other seat and gives it up at Turn 1, so player A holds the table alone until B asks for it back.
   * A game provisioned at Turn 1 (#1594) offers that seat open by name.
   * Any other game seats B in drafting and is played to Turn 1 by hand.
   */
  const a = await account('player-a');
  await createGame(a);
  const b = await account('player-b');
  await enter(b);
  await seatThrough(a, b);
  await playReady([a, b], []);
  const departed = requireView(b).viewer.viewerSeat;
  await depart(b);
  const inventory = (who: HostedPeer) =>
    requireView(who).snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  const requests = (who: HostedPeer) => required(requireView(who).snapshot.controls, 'controls').requests;
  async function facePixels(who: HostedPeer, piece: TablePiece, face: 'front' | 'back') {
    const center = await point(who, [piece.position[0], piece.position[1] + 0.05, piece.position[2]]);
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
  const choose = (who: HostedPeer) => pickCatalogueAsset(who, 'Recovery token');
  await verifySolePlayer();
  const { observer } = await verifyRequests();
  await verifyInventoryDrag();
  await verifyReadiness();

  async function verifySolePlayer() {
    assert.notEqual(requireView(a).viewer.viewerSeat, spectator);
    /* `depart` waits for B's own view; A's copy of the departure is another frame on another socket (#1481). */
    await until(
      () => !required(requireView(a).snapshot.controls, 'controls').seats.includes(departed),
      "Player B's departure did not reach player A's roster."
    );
    assert.deepEqual(required(requireView(a).snapshot.controls, 'controls').seats, [requireView(a).viewer.viewerSeat]);
    assert.equal(inventory(a).length, 0);
    const original = structuredClone(requireView(a).snapshot.table.pieces);
    await focus(a, 'map');
    await capture(a, 'after-hosted-map-1440x1000');
    await a.page.setViewportSize({ width: 900, height: 1000 });
    await focus(a, 'map');
    const phaseBounds = required(await a.page.locator('.seated-phase-status').boundingBox(), 'header bounds');
    const toolbarBounds = required(await a.page.locator('.seated-toolbar').boundingBox(), 'header bounds');
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
      requireView(a).snapshot.table.pieces.filter((piece) => !piece.inventory),
      original
    );
    await button(a, 'Close catalogue').click();
    await pinWindow(a, 'Shared inventory', 'left');
    await growSlot(a, 'left');
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
    assert.notEqual(requireView(b).viewer.viewerSeat, spectator);
    assert.equal(requireView(observer).viewer.viewerSeat, spectator);
    assert.notEqual(requireView(a).viewer.userId, requireView(b).viewer.userId);
    await until(
      () => required(requireView(a).snapshot.controls, 'controls').seats.length === 2,
      'Joining did not update the roster.'
    );
    await choose(a);
    await act(a, 'Request');
    await until(() => requests(b).length === 1 && requests(observer).length === 1, 'Pending request was not public.');
    assert.equal(inventory(a).length, 1);
    assert.equal(await button(a, 'Approve').isDisabled(), true);
    await openTab(observer, 'Shared inventory');
    for (const name of ['Approve', 'Dismiss', 'Add from catalogue', 'Next phase']) {
      assert.equal(await button(observer, name).isDisabled(), true);
    }
    assert.equal(await previousPhaseDisabled(observer), true);
    assert.equal(await button(observer, 'Drag Recovery token onto the table').isDisabled(), true);
    await pinWindow(b, 'Shared inventory', 'left');
    await growSlot(b, 'left');
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
    const token = required(inventory(a)[0], 'token');
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
    const destination = await point(a, [0, 0.38, 0]);
    await a.page.mouse.move(destination.x, destination.y, { steps: carrySteps });
    await a.page.mouse.up();
    await until(
      () => requireView(a).snapshot.table.pieces.some((piece) => piece.id === token.id && !piece.inventory),
      'Inventory drop did not reach the board.'
    );
    const dropped = () =>
      required(
        requireView(a).snapshot.table.pieces.find((piece) => piece.id === token.id),
        'dropped inventory token'
      );
    assert.ok(dropped().items.every((item: { faceUp: boolean }) => item.faceUp === false));
    await until(
      () => requireView(b).snapshot.revision === requireView(a).snapshot.revision,
      'Drop did not reach the other player.'
    );
    await until(() => facePixels(a, dropped(), 'back'), 'The published blue back did not render on the board.');
    await a.page.keyboard.press('f');
    await until(
      () => dropped().items.every((item: { faceUp: boolean }) => item.faceUp === true),
      'Ordinary flip did not turn the spawned piece face up.'
    );
    await until(() => facePixels(a, dropped(), 'front'), 'The published red front did not render after flipping.');
    await capture(a, 'after-inventory-drag-and-flip');
    passed(
      'Inventory drag uses the ordinary carry boundary, lands face down for both players, and can be flipped manually'
    );
  }

  async function verifyReadiness() {
    const viewers: HostedPeer[] = [a, b, observer];
    for (const who of viewers) {
      await who.page.evaluate(recordPhaseCooldowns);
    }
    while (requireView(a).snapshot.phase < 8) {
      await act(a, 'Next phase');
      /* The launcher provisions this flow's game with the real cooldown, which the change's frame states. */
      assert.ok(
        a.phaseCooldown.ms > PHASE_CHANGE_COOLDOWN_MS / 2,
        `The phase change stated a ${a.phaseCooldown.ms} ms cooldown instead of the real ${PHASE_CHANGE_COOLDOWN_MS} ms.`
      );
      const { snapshot } = requireView(a);
      const { phase, phases } = snapshot;
      await until(() => requireView(b).snapshot.phase === phase, 'Phase did not reach the other player.');
      /*
       * Each page notes the turn and phase its header named whenever both buttons were disabled.
       * From phase 1 on, a seated player's Previous is disabled only while the cooldown runs or while this page cannot act, as during a suspension, a re-admission or playback.
       * A note naming the new phase is therefore that phase's cooldown or a loss of interaction during that phase, and never the cooldown of the phase before it.
       */
      const shown = `${turnCaption(tableProgressFor(phase, phases).turn, lastTurnOf(snapshot))} ${phaseAt(phase, phases).label}`;
      for (const who of viewers) {
        await until(
          () => who.page.evaluate((key) => window.hostedPlayCooldowns?.has(key), shown),
          `${who.label}'s phase controls did not render the cooldown.`
        );
      }
    }
    await act(a, 'Ready');
    assert.equal(requireView(a).snapshot.phase, 8);
    assert.equal(await button(a, 'Next phase').isDisabled(), true);
    await act(a, 'Withdraw readiness');
    assert.deepEqual(required(requireView(a).snapshot.controls, 'controls').ready, []);
    await act(a, 'Ready');
    const saved = structuredClone(requireView(a).snapshot);
    await a.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    await act(b, 'Ready');
    assert.equal(requireView(b).snapshot.phase, 8);
    await until(() => button(b, 'Next phase').isEnabled(), 'Last ready did not enable Next.', 20_000);
    await enter(a);
    assert.equal(requireView(a).snapshot.phase, 8);
    assert.ok(required(requireView(a).snapshot.controls, 'controls').ready.includes(requireView(a).viewer.viewerSeat));
    assert.deepEqual(requireView(a).snapshot.table.pieces, saved.table.pieces);
    assert.equal(await button(observer, 'Ready').isDisabled(), true);
    await pinWindow(a, 'Phase', 'left');
    await growSlot(a, 'left');
    await button(a, 'Withdraw readiness').scrollIntoViewIfNeeded();
    await capture(a, 'after-mentat-ready');
    await act(a, 'Withdraw readiness');
    await until(() => button(b, 'Next phase').isDisabled(), 'Withdrawal did not disable Next.');
    await act(a, 'Ready');
    assert.equal(requireView(a).snapshot.phase, 8);
    await act(b, 'Next phase');
    assert.equal(requireView(b).snapshot.phase, 9);
    await act(b, 'Previous phase');
    assert.equal(requireView(b).snapshot.phase, 8);
    assert.deepEqual(required(requireView(b).snapshot.controls, 'controls').ready, []);
    assert.deepEqual(requireView(b).snapshot.table.pieces, saved.table.pieces);
    await until(() => requireView(a).snapshot.phase === 8, 'Revisit did not reach the other player.');
    await capture(a, 'after-mentat-revisit');
    passed(
      'Ready and withdrawal are separate from Next; readiness survives Mentat reconnect, last-ready enables explicit advance, and revisiting clears readiness without undoing pieces'
    );
    passed(
      `The ${PHASE_CHANGE_COOLDOWN_MS / 1000}-second phase cooldown disables Next phase for every viewer; observers cannot Ready, request, approve, dismiss or drag inventory`
    );
  }
}
