import assert from 'node:assert/strict';

import { isSpicePiece } from '../src/shared/play/spice.ts';
import { spiceBankSlot } from '../src/shared/play/spiceBank.ts';
import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';
import { TRACKER_DISC_TOP_Y } from '../src/shared/play/tableTrackers.ts';
import type { HostedToolkit } from './verify-hosted-play-browser.ts';
import { required, requireView } from './verify-hosted-types.ts';
import type { HostedPeer, TablePiece } from './verify-hosted-types.ts';

/** Manual spice reserve transfers through the isolated hosted app, with raw recipient frames retained as evidence. */
export async function verifyPrivateSpiceReserves(toolkit: HostedToolkit) {
  const {
    peer,
    enter,
    seated,
    factionOf,
    button,
    converged,
    focus,
    openTab,
    windowOf,
    pinWindow,
    growSlot,
    uncover,
    point,
    spiceBankShortcut,
    carrySteps,
    capture,
    until,
    passed,
    origin,
  } = toolkit;
  const { a, b, observer } = await seated();
  assert.notEqual(a.context.browser(), b.context.browser());
  assert.notEqual(requireView(a).viewer.userId, requireView(b).viewer.userId);
  /* Setup credits each faction's authored starting spice; every balance below counts from it. */
  const [factionA, factionB] = [factionOf(a).id, factionOf(b).id];
  const startingSpice = required(requireView(a).snapshot.bank, 'bank').balance;
  assert.ok(startingSpice > 0);
  assert.deepEqual(requireView(a).snapshot.bank, {
    factionId: factionA,
    balance: startingSpice,
  });
  assert.deepEqual(requireView(b).snapshot.bank, {
    factionId: factionB,
    balance: startingSpice,
  });
  assert.equal(Object.hasOwn(requireView(observer).snapshot, 'bank'), false);
  const spices = (who: HostedPeer) => requireView(who).snapshot.table.pieces.filter(isSpicePiece);
  async function act(who: HostedPeer, name: string) {
    await openTab(who, 'Spice');
    await toolkit.act(who, name);
    await converged([a, b, observer]);
  }
  async function stackPoint(who: HostedPeer, stack: TablePiece) {
    return point(who, [stack.position[0], stack.position[1] + stackTopHeight(stack), stack.position[2]]);
  }
  async function collect(who: HostedPeer, stack: TablePiece) {
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
    const action = who.page.getByRole('menuitem', { name: 'Take into spice reserve', exact: true });
    await until(() => action.isEnabled(), 'The stack collection action did not become enabled.');
    const revision = requireView(who).snapshot.revision;
    await action.click();
    await until(() => requireView(who).snapshot.revision > revision, 'Stack collection did not commit.');
    await converged([a, b, observer]);
  }
  async function withdraw(who: HostedPeer, amount: number) {
    await openTab(who, 'Spice');
    await who.page.getByRole('textbox', { name: 'Spice to withdraw' }).fill(String(amount));
    await act(who, 'Withdraw spice');
  }
  const slot = spiceBankSlot();
  await verifyTransfers();
  await verifyTurnBoundaries();
  await verifyDisposal();
  const tab = await verifyReconnect();
  await verifySignOut(tab);

  async function verifyTransfers() {
    await focus(a, 'map');
    await capture(a, 'after-hosted-map-1440x1000');
    await openTab(a, 'Spice');
    await openTab(observer, 'Spice transfers');
    /* No more than the spice reserve holds can be withdrawn. */
    await a.page.getByRole('textbox', { name: 'Spice to withdraw' }).fill(String(startingSpice + 1));
    assert.equal(await button(a, 'Withdraw spice').isDisabled(), true);
    assert.equal(await observer.page.getByRole('region', { name: 'Spice reserve' }).count(), 0);
    await spiceBankShortcut(a, '7');
    await until(() => spices(a).length === 1, 'The Spice Bank did not create spice.');
    await collect(a, spices(a)[0]);
    assert.equal(required(requireView(a).snapshot.bank, 'bank').balance, startingSpice + 7);
    assert.equal(required(requireView(b).snapshot.bank, 'bank').balance, startingSpice);
    await withdraw(a, 7);
    assert.equal(required(requireView(a).snapshot.bank, 'bank').balance, startingSpice);
    assert.equal(spices(a)[0].items.length, 7);
    await collect(b, spices(b)[0]);
    assert.equal(required(requireView(b).snapshot.bank, 'bank').balance, startingSpice + 7);
    await pinWindow(b, 'Spice', 'left');
    await growSlot(b, 'left');
    await b.page.getByRole('region', { name: 'Spice reserve' }).scrollIntoViewIfNeeded();
    await capture(b, 'after-own-spice-reserve-and-public-transfers');
    await b.page.setViewportSize({ width: 900, height: 1000 });
    await b.page.getByRole('region', { name: 'Spice reserve' }).scrollIntoViewIfNeeded();
    await capture(b, 'after-spice-reserve-900x1000');
    await b.page.emulateMedia({ colorScheme: 'light' });
    await capture(b, 'after-spice-reserve-light-900x1000');
    await b.page.emulateMedia({ colorScheme: 'dark' });
    await b.page.setViewportSize({ width: 1440, height: 1000 });
    await withdraw(b, 3);
  }

  async function verifyTurnBoundaries() {
    const physical = structuredClone(spices(b));
    while (requireView(a).snapshot.phase < 8) {
      const phase = requireView(a).snapshot.phase;
      await act(a, 'Next phase');
      assert.equal(requireView(a).snapshot.phase, phase + 1);
    }
    await act(a, 'Ready');
    await act(b, 'Ready');
    await act(a, 'Next phase');
    assert.equal(requireView(a).snapshot.phase, 9);
    assert.deepEqual(spices(a), physical);
    assert.equal(required(requireView(b).snapshot.bank, 'bank').balance, startingSpice + 4);
    await act(b, 'Previous phase');
    assert.deepEqual(spices(b), physical);
    assert.equal(required(requireView(b).snapshot.bank, 'bank').balance, startingSpice + 4);
    passed(
      'Two distinct accounts in two browser processes manually collect and withdraw spice from their starting balances; turn end and revisit leave physical spice and both spice reserves unchanged'
    );
  }

  async function verifyDisposal() {
    await focus(a, 'map');
    const start = await stackPoint(a, spices(a)[0]);
    const target = await point(a, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    await uncover(a, start);
    await uncover(a, target);
    await a.page.mouse.move(start.x, start.y);
    await a.page.mouse.down();
    await a.page.waitForTimeout(350);
    await a.page.mouse.move(target.x, target.y, { steps: carrySteps });
    await a.page.mouse.up();
    await until(
      () => spices(a).length === 0,
      'Dropping spice on the Spice Bank disc did not return it to the Spice Bank.'
    );
    /* B's unchanged spice reserve counts only once B's view holds the disposal (#1481). */
    await converged([a, b, observer]);
    assert.equal(required(requireView(a).snapshot.bank, 'bank').balance, startingSpice);
    assert.equal(required(requireView(b).snapshot.bank, 'bank').balance, startingSpice + 4);
    await until(
      () => required(requireView(observer).snapshot.spiceTransfers, 'spiceTransfers')[0].kind === 'disposal',
      'Disposal was not public.'
    );
    assert.equal(required(requireView(observer).snapshot.spiceTransfers, 'spiceTransfers')[0].amount, 3);
    await pinWindow(observer, 'Spice transfers', 'left');
    await growSlot(observer, 'left');
    await observer.page.getByRole('region', { name: 'Public spice transfers' }).scrollIntoViewIfNeeded();
    await capture(observer, 'after-observer-public-transfers');
    passed(
      'Dragging spice onto the Spice Bank disc destroys it without credit; observers see transfer amounts and no spice reserve control'
    );
  }

  async function verifyReconnect() {
    const previousDocumentSocket = b.sockets.at(-1);
    await b.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    /* Playwright does not report every socket close after its owning document is replaced. */
    required(previousDocumentSocket, 'previous socket').documentReplaced = true;
    await enter(b);
    assert.deepEqual(requireView(b).snapshot.bank, {
      factionId: factionB,
      balance: startingSpice + 4,
    });
    const tab = await peer('player-b-tab', b.context);
    await enter(tab);
    assert.deepEqual(requireView(tab).snapshot.bank, requireView(b).snapshot.bank);
    await openTab(tab, 'Replay');
    await button(tab, 'Replay from start').click();
    await until(() => tab.rawMessages.some((message) => message.type === 'history'), 'Private history did not arrive.');
    await openTab(observer, 'Replay');
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
    ] as const) {
      inspectFrames(who, factionId);
      const denied = await who.context.request.get(
        who.sockets
          .at(-1)!
          .url.replace(/^ws/, 'http')
          .replace(/socket$/, `private/${factionB}`)
      );
      assert.equal(denied.status(), 403);
      assert.deepEqual(await denied.json(), { error: 'Request refused.' });
    }
    passed(
      'Raw snapshots, compact deltas and historical frames contain only the spice reserve of the recipient faction; observer and guessed HTTP paths expose no spice reserve; reconnect and a second tab restore the current spice reserve'
    );
    /* A real game's history starts at drafting, which has no Spice window; its playback bar returns a viewer to the live table.
       The sign-out step opens the Spice window on both viewers that replayed here, so both go back. */
    for (const who of [tab, observer]) {
      await who.page.getByRole('button', { name: 'Return to live' }).click();
      await openTab(who, who === observer ? 'Spice transfers' : 'Spice');
    }
    return tab;
  }

  function inspectFrames(who: HostedPeer, factionId: string | undefined) {
    for (const frame of who.rawMessages) {
      const snapshot = 'snapshot' in frame ? frame.snapshot : undefined;
      assert.equal(JSON.stringify(frame).includes('factionBanks'), false);
      if (snapshot?.bank) {
        assert.equal(required(snapshot.bank, 'bank').factionId, factionId);
        assert.deepEqual(
          Object.keys(snapshot.bank).sort((left, right) => left.localeCompare(right)),
          ['balance', 'factionId']
        );
      }
      if (!factionId && snapshot) {
        assert.equal(Object.hasOwn(snapshot, 'bank'), false);
      }
      for (const transfer of snapshot?.spiceTransfers ?? ('entries' in frame ? frame.entries : []) ?? []) {
        assert.equal(Object.hasOwn(transfer, 'balance'), false);
        assert.equal(Object.hasOwn(transfer, 'userId'), false);
      }
    }
  }

  async function verifySignOut(tab: HostedPeer) {
    /* Both tabs show the spice reserve first, so its disappearance below is the sign-out's doing, not a hidden tab's. */
    await openTab(b, 'Spice');
    await openTab(tab, 'Spice');
    await b.page.getByRole('region', { name: 'Spice reserve' }).waitFor();
    await tab.page.getByRole('region', { name: 'Spice reserve' }).waitFor();
    /* The other two leave the camera and the panel where a freshly mounted table would not put them: Spice is never the first tab (#1418). */
    const others = [a, observer];
    for (const who of others) {
      await focus(who, 'bottom');
      await openTab(who, who === observer ? 'Spice transfers' : 'Spice');
    }
    const tables = await Promise.all(
      others.map((who: HostedPeer) => who.page.locator('.dune-play-shell canvas').elementHandle())
    );
    const signedOutFrom = [b.rawMessages.length, tab.rawMessages.length];
    const othersFrom = others.map((who: HostedPeer) => who.rawMessages.length);
    const accountPage = await b.context.newPage();
    await accountPage.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    await accountPage.getByRole('heading', { name: 'Play Dune!' }).waitFor();
    await accountPage.locator('[data-app-band] button[aria-haspopup="menu"]').last().click();
    await accountPage.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await until(
      () =>
        [b, tab].every((who: HostedPeer) => who.sockets.every((socket) => socket.closed || socket.documentReplaced)),
      'Sign-out did not close both sockets.'
    );
    await until(
      async () =>
        (await b.page.getByRole('region', { name: 'Spice reserve' }).count()) === 0 &&
        (await tab.page.getByRole('region', { name: 'Spice reserve' }).count()) === 0,
      'Signed-out spice reserve remained visible.'
    );
    const counts = [b.rawMessages.length, tab.rawMessages.length];
    await focus(a, 'map');
    await spiceBankShortcut(a, '2');
    await until(() => spices(a).length === 1, 'Post-sign-out Spice Bank spawn did not commit.');
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
        await windowOf(who, who === observer ? 'Spice transfers' : 'Spice').count(),
        1,
        `${who.label} lost the Spice window.`
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
      'Real sign-out removes the spice reserve in every tab and fences subsequent private and public fanout; the other players keep their table, camera and panel',
      { workerRefusedSignOut }
    );
  }
}
