import assert from 'node:assert/strict';

import { isSpicePiece } from '../src/shared/play/spice.ts';
import { spiceSupplySlot } from '../src/shared/play/spiceSupply.ts';
import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';
import { TRACKER_DISC_TOP_Y } from '../src/shared/play/tableTrackers.ts';

/** Manual bank transfers through the isolated hosted app, with raw recipient frames retained as evidence. */
export async function verifyPrivateBanks(toolkit) {
  const {
    peer,
    enter,
    seated,
    factionOf,
    button,
    converged,
    focus,
    openTab,
    point,
    supplyShortcut,
    carrySteps,
    capture,
    until,
    passed,
    origin,
  } = toolkit;
  const { a, b, observer } = await seated();
  assert.notEqual(a.context.browser(), b.context.browser());
  assert.notEqual(a.view().viewer.userId, b.view().viewer.userId);
  /* Setup credits each faction's authored starting spice; every balance below counts from it. */
  const [factionA, factionB] = [factionOf(a).id, factionOf(b).id];
  const startingSpice = a.view().snapshot.bank.balance;
  assert.ok(startingSpice > 0);
  assert.deepEqual(a.view().snapshot.bank, { factionId: factionA, balance: startingSpice });
  assert.deepEqual(b.view().snapshot.bank, { factionId: factionB, balance: startingSpice });
  assert.equal(Object.hasOwn(observer.view().snapshot, 'bank'), false);
  const spices = (who) => who.view().snapshot.table.pieces.filter(isSpicePiece);
  async function act(who, name) {
    await openTab(who, 'Spice');
    await toolkit.act(who, name);
    await converged([a, b, observer]);
  }
  async function stackPoint(who, stack) {
    return point(who, [stack.position[0], stack.position[1] + stackTopHeight(stack), stack.position[2]]);
  }
  async function collect(who, stack) {
    await focus(who, 'map');
    const position = await stackPoint(who, stack);
    if (who === b) {
      await who.page.mouse.click(position.x, position.y);
      const keyboardActions = button(who, 'Selected piece actions');
      await keyboardActions.focus();
      await keyboardActions.press('Enter');
    } else {
      await who.page.mouse.click(position.x, position.y, { button: 'right' });
    }
    const action = who.page.getByRole('menuitem', { name: 'Take into bank', exact: true });
    await until(() => action.isEnabled(), 'The stack collection action did not become enabled.');
    const revision = who.view().snapshot.revision;
    await action.click();
    await until(() => who.view().snapshot.revision > revision, 'Stack collection did not commit.');
    await converged([a, b, observer]);
  }
  async function withdraw(who, amount) {
    await openTab(who, 'Spice');
    await who.page.getByRole('textbox', { name: 'Spice to withdraw' }).fill(String(amount));
    await act(who, 'Withdraw spice');
  }
  const slot = spiceSupplySlot();
  await verifyTransfers();
  await verifyTurnBoundaries();
  await verifyDisposal();
  const tab = await verifyReconnect();
  await verifySignOut(tab);

  async function verifyTransfers() {
    await focus(a, 'map');
    await capture(a, 'after-hosted-map-1440x1000');
    await openTab(a, 'Spice');
    await openTab(observer, 'Spice');
    /* No more than the bank holds can be withdrawn. */
    await a.page.getByRole('textbox', { name: 'Spice to withdraw' }).fill(String(startingSpice + 1));
    assert.equal(await button(a, 'Withdraw spice').isDisabled(), true);
    assert.equal(await observer.page.getByRole('region', { name: 'Faction bank' }).count(), 0);
    await supplyShortcut(a, '7');
    await until(() => spices(a).length === 1, 'Supply did not create spice.');
    await collect(a, spices(a)[0]);
    assert.equal(a.view().snapshot.bank.balance, startingSpice + 7);
    assert.equal(b.view().snapshot.bank.balance, startingSpice);
    await withdraw(a, 7);
    assert.equal(a.view().snapshot.bank.balance, startingSpice);
    assert.equal(spices(a)[0].items.length, 7);
    await collect(b, spices(b)[0]);
    assert.equal(b.view().snapshot.bank.balance, startingSpice + 7);
    await openTab(b, 'Spice');
    await b.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
    await b.page.getByRole('region', { name: 'Faction bank' }).scrollIntoViewIfNeeded();
    await capture(b, 'after-own-bank-and-public-transfers');
    await b.page.setViewportSize({ width: 900, height: 1000 });
    await b.page.getByRole('region', { name: 'Faction bank' }).scrollIntoViewIfNeeded();
    await capture(b, 'after-bank-900x1000');
    await b.page.emulateMedia({ colorScheme: 'light' });
    await capture(b, 'after-bank-light-900x1000');
    await b.page.emulateMedia({ colorScheme: 'dark' });
    await b.page.setViewportSize({ width: 1440, height: 1000 });
    await withdraw(b, 3);
  }

  async function verifyTurnBoundaries() {
    const physical = structuredClone(spices(b));
    while (a.view().snapshot.phase < 8) {
      const phase = a.view().snapshot.phase;
      await act(a, 'Next phase');
      assert.equal(a.view().snapshot.phase, phase + 1);
    }
    await act(a, 'Ready');
    await act(b, 'Ready');
    await act(a, 'Next phase');
    assert.equal(a.view().snapshot.phase, 9);
    assert.deepEqual(spices(a), physical);
    assert.equal(b.view().snapshot.bank.balance, startingSpice + 4);
    await act(b, 'Previous phase');
    assert.deepEqual(spices(b), physical);
    assert.equal(b.view().snapshot.bank.balance, startingSpice + 4);
    passed(
      'Two distinct accounts in two browser processes manually collect and withdraw spice from their starting balances; turn end and revisit leave physical spice and both banks unchanged'
    );
  }

  async function verifyDisposal() {
    await focus(a, 'map');
    const start = await stackPoint(a, spices(a)[0]);
    const target = await point(a, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    await a.page.mouse.move(start.x, start.y);
    await a.page.mouse.down();
    await a.page.waitForTimeout(350);
    await a.page.mouse.move(target.x, target.y, { steps: carrySteps });
    await a.page.mouse.up();
    await until(() => spices(a).length === 0, 'Dropping spice on the supply disc did not dispose of it.');
    /* B's unchanged bank counts only once B's view holds the disposal (#1481). */
    await converged([a, b, observer]);
    assert.equal(a.view().snapshot.bank.balance, startingSpice);
    assert.equal(b.view().snapshot.bank.balance, startingSpice + 4);
    await until(() => observer.view().snapshot.spiceTransfers[0].kind === 'disposal', 'Disposal was not public.');
    assert.equal(observer.view().snapshot.spiceTransfers[0].amount, 3);
    await openTab(observer, 'Spice');
    await observer.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
    await observer.page.getByRole('region', { name: 'Public spice transfers' }).scrollIntoViewIfNeeded();
    await capture(observer, 'after-observer-public-transfers');
    passed(
      'Dragging spice onto the supply disc destroys it without credit; observers see transfer amounts and no bank control'
    );
  }

  async function verifyReconnect() {
    const previousDocumentSocket = b.sockets.at(-1);
    await b.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    /* Playwright does not report every socket close after its owning document is replaced. */
    previousDocumentSocket.documentReplaced = true;
    await enter(b);
    assert.deepEqual(b.view().snapshot.bank, { factionId: factionB, balance: startingSpice + 4 });
    const tab = await peer('player-b-tab', b.context);
    await enter(tab);
    assert.deepEqual(tab.view().snapshot.bank, b.view().snapshot.bank);
    await openTab(tab, 'Phase');
    await button(tab, 'Replay from start').click();
    await until(() => tab.rawMessages.some((message) => message.type === 'history'), 'Private history did not arrive.');
    await openTab(observer, 'Phase');
    await button(observer, 'Replay from start').click();
    await until(
      () => observer.rawMessages.some((message) => message.type === 'history'),
      'Observer history did not arrive.'
    );
    for (const [who, factionId] of [
      [a, factionA],
      [b, factionB],
      [tab, factionB],
      [observer, undefined],
    ]) {
      inspectFrames(who, factionId);
      const denied = await who.context.request.get(
        who.sockets
          .at(-1)
          .url.replace(/^ws/, 'http')
          .replace(/socket$/, `private/${factionB}`)
      );
      assert.equal(denied.status(), 403);
      assert.deepEqual(await denied.json(), { error: 'Request refused.' });
    }
    passed(
      'Raw snapshots, compact deltas and historical frames contain only the recipient faction bank; observer and guessed HTTP paths expose no bank; reconnect and a second tab restore the current bank'
    );
    /* A real game's history starts at drafting, which has no Spice tab; its playback bar returns a viewer to the live table.
       The sign-out step opens the Spice tab on both viewers that replayed here, so both go back. */
    for (const who of [tab, observer]) {
      await who.page.getByRole('button', { name: 'Return to live' }).click();
      await who.page.getByRole('tab', { name: 'Spice', exact: true }).waitFor({ state: 'attached' });
    }
    return tab;
  }

  function inspectFrames(who, factionId) {
    for (const frame of who.rawMessages) {
      assert.equal(JSON.stringify(frame).includes('factionBanks'), false);
      if (frame.snapshot?.bank) {
        assert.equal(frame.snapshot.bank.factionId, factionId);
        assert.deepEqual(
          Object.keys(frame.snapshot.bank).sort((left, right) => left.localeCompare(right)),
          ['balance', 'factionId']
        );
      }
      if (!factionId && frame.snapshot) {
        assert.equal(Object.hasOwn(frame.snapshot, 'bank'), false);
      }
      for (const transfer of frame.snapshot?.spiceTransfers ?? frame.entries ?? []) {
        assert.equal(Object.hasOwn(transfer, 'balance'), false);
        assert.equal(Object.hasOwn(transfer, 'userId'), false);
      }
    }
  }

  async function verifySignOut(tab) {
    /* Both tabs show the bank first, so its disappearance below is the sign-out's doing, not a hidden tab's. */
    await openTab(b, 'Spice');
    await openTab(tab, 'Spice');
    await b.page.getByRole('region', { name: 'Faction bank' }).waitFor();
    await tab.page.getByRole('region', { name: 'Faction bank' }).waitFor();
    /* The other two leave the camera and the panel where a freshly mounted table would not put them: Spice is never the first tab (#1418). */
    const others = [a, observer];
    for (const who of others) {
      await focus(who, 'bottom');
      await openTab(who, 'Spice');
    }
    const tables = await Promise.all(others.map((who) => who.page.locator('.dune-play-shell canvas').elementHandle()));
    const signedOutFrom = [b.rawMessages.length, tab.rawMessages.length];
    const othersFrom = others.map((who) => who.rawMessages.length);
    const accountPage = await b.context.newPage();
    await accountPage.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    await accountPage.getByRole('heading', { name: 'Game lobby' }).waitFor();
    await accountPage.locator('[data-app-band] button[aria-haspopup="menu"]').last().click();
    await accountPage.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await until(
      () => [b, tab].every((who) => who.sockets.every((socket) => socket.closed || socket.documentReplaced)),
      'Sign-out did not close both sockets.'
    );
    await until(
      async () =>
        (await b.page.getByRole('region', { name: 'Faction bank' }).count()) === 0 &&
        (await tab.page.getByRole('region', { name: 'Faction bank' }).count()) === 0,
      'Signed-out bank remained visible.'
    );
    const counts = [b.rawMessages.length, tab.rawMessages.length];
    await focus(a, 'map');
    await supplyShortcut(a, '2');
    await until(() => spices(a).length === 1, 'Post-sign-out supply did not commit.');
    assert.deepEqual([b.rawMessages.length, tab.rawMessages.length], counts);
    await converged([a, observer]);
    for (const [index, who] of others.entries()) {
      const paused = who.rawMessages.slice(othersFrom[index]).filter((message) => message.type === 'admission');
      assert.deepEqual(paused, [], `The sign-out paused ${who.label}.`);
      assert.equal(
        await tables[index].evaluate((canvas) => canvas.isConnected),
        true,
        `${who.label}'s table remounted.`
      );
      assert.equal(
        await who.page.locator('[role="tab"][aria-label="Spice"][aria-selected="true"]').count(),
        1,
        `${who.label} lost the Spice tab.`
      );
    }
    /* Player A's own press above moved A's camera; the observer's stays where it was put. */
    assert.equal(
      await observer.page.locator('.dune-play-shell').evaluate((shell) => shell.dataset.tableView),
      'bottom'
    );
    /* When B's pages close their own sockets before the Worker refuses them, the room never checks accounts and this run proves less. */
    const workerRefusedSignOut = [b, tab].some((who, index) =>
      who.rawMessages
        .slice(signedOutFrom[index])
        .some((message) => message.type === 'admission' && message.status === 'denied')
    );
    passed(
      'Real sign-out removes the bank in every tab and fences subsequent private and public fanout; the other players keep their table, camera and panel',
      { workerRefusedSignOut }
    );
  }
}
