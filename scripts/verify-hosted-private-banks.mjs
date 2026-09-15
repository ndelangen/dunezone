import assert from 'node:assert/strict';

import {
  SPICE_LAYER_HEIGHT,
  SPICE_LAYER_PITCH,
  SPICE_MAX_VISIBLE_LAYERS,
  isSpicePiece,
} from '../src/shared/play/spice.ts';
import { spiceSupplySlot } from '../src/shared/play/spiceSupply.ts';
import { TRACKER_DISC_TOP_Y } from '../src/shared/play/tableTrackers.ts';

/** Manual bank transfers through the isolated hosted app, with raw recipient frames retained as evidence. */
export async function verifyPrivateBanks({
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
  const b = await peer('player-b');
  await signIn(b);
  await enter(b);
  const observer = await peer('observer');
  await signIn(observer);
  await enter(observer);
  assert.notEqual(a.context.browser(), b.context.browser());
  assert.notEqual(a.view().viewer.userId, b.view().viewer.userId);
  assert.deepEqual(a.view().snapshot.bank, { factionId: 'harkonnen', balance: 0 });
  assert.deepEqual(b.view().snapshot.bank, { factionId: 'atreides', balance: 0 });
  assert.equal(Object.hasOwn(observer.view().snapshot, 'bank'), false);
  const button = (who, name) => who.page.getByRole('button', { name, exact: true });
  const spices = (who) => who.view().snapshot.table.pieces.filter(isSpicePiece);
  async function act(who, name) {
    await openTab(who, 'Spice');
    await until(() => button(who, name).isEnabled(), `${name} did not become enabled.`, 20_000);
    /* Read after the control is enabled, so a commit that enabled it is not mistaken for this click's. */
    const revision = who.view().snapshot.revision;
    await button(who, name).click();
    await until(() => who.view().snapshot.revision > revision, `${name} did not commit.`);
    await until(
      () => [a, b, observer].every((other) => other.view().snapshot.revision === who.view().snapshot.revision),
      'Recipient revisions diverged.'
    );
  }
  async function stackPoint(who, stack) {
    const y =
      stack.position[1] +
      SPICE_LAYER_HEIGHT +
      (Math.min(stack.items.length, SPICE_MAX_VISIBLE_LAYERS) - 1) * SPICE_LAYER_PITCH;
    return point(who, [stack.position[0], y, stack.position[2]], 'map');
  }
  async function collect(who, stack) {
    await focus(who, 'map');
    const position = await stackPoint(who, stack);
    await who.page.mouse.click(position.x, position.y);
    await act(who, 'Take into bank');
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
    assert.equal(await button(a, 'Withdraw spice').isDisabled(), true);
    assert.equal(await observer.page.getByRole('region', { name: 'Faction bank' }).count(), 0);
    const supply = await point(a, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]], 'map');
    await a.page.mouse.move(supply.x, supply.y);
    await a.page.keyboard.press('7');
    await until(() => spices(a).length === 1, 'Supply did not create spice.');
    await collect(a, spices(a)[0]);
    assert.equal(a.view().snapshot.bank.balance, 7);
    assert.equal(b.view().snapshot.bank.balance, 0);
    await withdraw(a, 7);
    assert.equal(a.view().snapshot.bank.balance, 0);
    assert.equal(spices(a)[0].items.length, 7);
    await collect(b, spices(b)[0]);
    assert.equal(b.view().snapshot.bank.balance, 7);
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
    for (let phase = 1; phase <= 8; phase++) {
      await act(a, 'Next phase');
      assert.equal(a.view().snapshot.phase, phase);
    }
    await act(a, 'Ready');
    await act(b, 'Ready');
    await act(a, 'Next phase');
    assert.equal(a.view().snapshot.phase, 9);
    assert.deepEqual(spices(a), physical);
    assert.equal(b.view().snapshot.bank.balance, 4);
    await act(b, 'Previous phase');
    assert.deepEqual(spices(b), physical);
    assert.equal(b.view().snapshot.bank.balance, 4);
    passed(
      'Two distinct accounts in two browser processes manually collect and withdraw full balances; turn end and revisit leave physical spice and both banks unchanged'
    );
  }

  async function verifyDisposal() {
    await focus(a, 'map');
    const start = await stackPoint(a, spices(a)[0]);
    const target = await point(a, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]], 'map');
    await a.page.mouse.move(start.x, start.y);
    await a.page.mouse.down();
    await a.page.waitForTimeout(350);
    await a.page.mouse.move(target.x, target.y, { steps: 12 });
    await a.page.mouse.up();
    await until(() => spices(a).length === 0, 'Dropping spice on the supply disc did not dispose of it.');
    assert.equal(a.view().snapshot.bank.balance, 0);
    assert.equal(b.view().snapshot.bank.balance, 4);
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
    assert.deepEqual(b.view().snapshot.bank, { factionId: 'atreides', balance: 4 });
    const tab = await peer('player-b-tab', b.context);
    await enter(tab);
    assert.deepEqual(tab.view().snapshot.bank, b.view().snapshot.bank);
    await openTab(tab, 'Table');
    await button(tab, 'Replay from start').click();
    await until(() => tab.rawMessages.some((message) => message.type === 'history'), 'Private history did not arrive.');
    await openTab(observer, 'Table');
    await button(observer, 'Replay from start').click();
    await until(
      () => observer.rawMessages.some((message) => message.type === 'history'),
      'Observer history did not arrive.'
    );
    for (const [who, factionId] of [
      [a, 'harkonnen'],
      [b, 'atreides'],
      [tab, 'atreides'],
      [observer, undefined],
    ]) {
      inspectFrames(who, factionId);
      const denied = await who.context.request.get(
        who.sockets
          .at(-1)
          .url.replace(/^ws/, 'http')
          .replace(/socket$/, 'private/atreides')
      );
      assert.equal(denied.status(), 403);
      assert.deepEqual(await denied.json(), { error: 'Request refused.' });
    }
    passed(
      'Raw snapshots, compact deltas and historical frames contain only the recipient faction bank; observer and guessed HTTP paths expose no bank; reconnect and a second tab restore the current bank'
    );
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
    const accountPage = await b.context.newPage();
    await accountPage.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
    await accountPage.getByRole('heading', { name: 'Game lobby' }).waitFor();
    await accountPage.locator('header button[aria-haspopup="menu"]').last().click();
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
    const supplyAgain = await point(a, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]], 'map');
    await a.page.mouse.move(supplyAgain.x, supplyAgain.y);
    await a.page.keyboard.press('2');
    await until(() => spices(a).length === 1, 'Post-sign-out supply did not commit.');
    assert.deepEqual([b.rawMessages.length, tab.rawMessages.length], counts);
    passed('Real sign-out removes the bank in every tab and fences subsequent private and public fanout');
  }
}
