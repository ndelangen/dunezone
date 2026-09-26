import assert from 'node:assert/strict';

import { isSpicePiece } from '../src/shared/play/spice.ts';
import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';

/** Two signed-in players exercise the real battle controls on a disposable Worker. */
export async function verifyBattles(toolkit) {
  const { seated, button, converged, focus, openTab, point, capture, until, passed } = toolkit;
  const { a, b, observer } = await seated();
  assert.notEqual(a.view().viewer.userId, b.view().viewer.userId);
  assert.notEqual(a.context.browser(), b.context.browser());
  async function act(who, name) {
    await toolkit.act(who, name);
    await converged([a, b, observer]);
  }
  await openTab(a, 'Shared inventory');
  await button(a, 'Add from catalogue').click();
  await a.page.getByRole('combobox', { name: 'Catalogue asset' }).click();
  await a.page.getByRole('option', { name: 'Recovery token', exact: true }).click();
  await act(a, 'Request');
  await openTab(b, 'Shared inventory');
  await act(b, 'Approve');
  await button(a, 'Close catalogue').click();
  const token = a.view().snapshot.table.pieces.find((piece) => piece.inventory);
  async function drag(who, locator, destination) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert.ok(box);
    const end = await point(who, destination, 'map');
    /* The card fan leaves the upper edge exposed above its wheel. */
    await who.page.mouse.move(box.x + box.width / 2, box.y + Math.min(12, box.height / 2));
    const nativeDrag = (await locator.getAttribute('draggable')) === 'true';
    const frameIndex = who.rawMessages.length;
    await who.page.mouse.down();
    if (!nativeDrag) {
      await until(
        () => who.rawMessages.slice(frameIndex).some((frame) => frame.type === 'carry'),
        'Piece carry did not start.'
      );
    }
    await who.page.mouse.move(end.x, end.y, { steps: 25 });
    await who.page.mouse.up();
  }
  await drag(a, button(a, 'Drag Recovery token onto the table'), [-1.5, 0.38, 1.5]);
  await until(
    () => a.view().snapshot.table.pieces.some((piece) => piece.id === token.id && !piece.inventory),
    'Leader token did not leave shared inventory.'
  );
  await openTab(a, 'Table');
  await act(a, 'Spawn 7 spice');
  await until(() => a.view().snapshot.table.pieces.some(isSpicePiece), 'Spice did not spawn.');
  const spice = a.view().snapshot.table.pieces.find(isSpicePiece);
  const at = await point(a, [spice.position[0], spice.position[1] + stackTopHeight(spice), spice.position[2]], 'map');
  await a.page.mouse.click(at.x, at.y, { button: 'right' });
  await a.page.getByRole('menuitem', { name: 'Take into bank', exact: true }).click();
  await until(() => a.view().snapshot.bank.balance === 7, 'Manual collection did not fund the bank.');
  while (a.view().snapshot.phase !== 6) {
    await act(a, 'Next phase');
  }
  await openTab(a, 'Battle');
  await openTab(b, 'Battle');
  await openTab(observer, 'Battle');
  await capture(a, 'before-battle');
  async function take(who, id) {
    await focus(who, 'map');
    const piece = who.view().snapshot.table.pieces.find((piece) => piece.id === id);
    const at = await point(who, [piece.position[0], piece.position[1] + 0.05, piece.position[2]], 'map');
    await who.page.mouse.click(at.x, at.y);
    await openTab(who, 'Battle');
    const previousHand = new Set(who.view().snapshot.hand.map((entry) => entry.id));
    await act(who, 'Take selected piece into hand');
    await until(
      () => who.view().snapshot.hand.length === previousHand.size + 1,
      'Private inventory did not receive the piece.'
    );
    const received = who.view().snapshot.hand.find((entry) => !previousHand.has(entry.id));
    assert.ok(received);
    assert.equal(received.kind, piece.kind);
    assert.equal(received.items.length, piece.items.length);
    if (piece.items[0].artwork?.front) {
      assert.equal(received.items[0].artwork.front, piece.items[0].artwork.front);
    }
    return received;
  }
  await take(a, token.id);
  const battleCard = await take(a, 'treachery-card-loose');
  const target = await point(a, [0.95, 0.18, -3.05], 'map');
  const marker = button(a, 'Drag battle marker onto territory');
  const bounds = await marker.boundingBox();
  assert.ok(bounds);
  await a.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(target.x, target.y, { steps: 25 });
  await a.page.mouse.up();
  await until(() => a.view().snapshot.battle, 'Marker drop did not start a battle.');
  await act(a, 'Claim left side');
  await act(b, 'Claim right side');
  await until(
    () => a.view().snapshot.battlePlan && b.view().snapshot.battlePlan,
    'Combatants did not receive private plans.'
  );
  assert.equal(observer.view().snapshot.battlePlan, null);
  await verifyFunding({ a, b, observer, token, until, capture });
  await act(a, 'Ready for battle');
  await act(b, 'Ready for battle');
  await until(() => a.view().snapshot.battle.stage === 'countdown', 'Both Ready did not start countdown.');
  await act(a, 'Undo Ready');
  assert.equal(a.view().snapshot.battle.sides[1].ready, true);
  await act(a, 'Ready for battle');
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await b.page.locator('[data-connection="authorized"]').waitFor();
  await until(
    () => a.view().snapshot.battle.stage === 'revealed' && b.view().snapshot.battle.stage === 'revealed',
    'Countdown did not reveal after reconnect.',
    15_000
  );
  await capture(a, 'after-battle-reveal');
  assert.equal(a.view().snapshot.bank.balance, 4);
  await drag(
    a,
    a.page
      .locator('[data-battle-stage="revealed"]')
      .getByRole('button', { name: 'Drag Recovery token onto table', exact: true }),
    [-2, 0.38, 2]
  );
  await until(
    () => a.view().snapshot.table.pieces.some((piece) => piece.id === token.id && !piece.battleOverlay),
    'Revealed leader did not reach the real table.'
  );
  await drag(
    a,
    a.page
      .locator('[data-battle-stage="revealed"]')
      .getByRole('button', { name: 'Drag Treachery card onto table', exact: true }),
    [1.6, 0.38, 1.8]
  );
  await until(
    () => a.view().snapshot.table.pieces.some((piece) => piece.id === battleCard.id && !piece.battleOverlay),
    'Revealed card did not reach the real table.'
  );
  const returnedCard = await take(a, battleCard.id);
  await act(a, 'Left side won');
  await act(b, 'Right side won');
  assert.deepEqual(
    a.view().snapshot.battle.sides.map((side) => side.choice),
    ['left', 'right']
  );
  assert.equal(await button(observer, 'No winner').isDisabled(), true);
  await capture(a, 'after-battle-opposing-outcomes');
  await act(b, 'Left side won');
  await until(() => !a.view().snapshot.battle, 'Matching choices did not resolve.');
  await capture(a, 'after-battle-resolved');
  assert.equal(a.view().snapshot.battleResults[0].outcome, 'left');
  passed(
    'Distinct signed-in players place the marker, claim sides, privately plan, withdraw Ready, reconnect during countdown and agree a public outcome; observer controls remain disabled'
  );
  inspectPrivateCollections([b, observer]);
  await verifyReverseBattle({ a, b, openTab, drag, button, until, act, passed });
  await openTab(a, 'Battle');
  await drag(a, button(a, 'Drag battle marker onto territory'), [0, 0.18, 0]);
  await until(() => a.view().snapshot.battle, 'Cancellation example did not start.');
  await act(a, 'Claim left side');
  await commitCard({ who: a, name: 'Treachery card', until });
  await act(a, 'Ready for battle');
  await act(b, 'Cancel battle');
  await until(
    () =>
      a
        .view()
        .snapshot.hand.some((piece) => piece.id === returnedCard.id && piece.items[0].id === returnedCard.items[0].id),
    'Cancellation did not restore the card.'
  );
  assert.equal(a.view().snapshot.bank.balance, 4);
  await capture(a, 'after-battle-cancellation');
  passed('A seated noncombatant cancels preparation and restores the private card without a public result');
  await focus(a, 'map');
}

async function verifyFunding({ a, b, observer, token, until, capture }) {
  /* One physical troop type renders as the single Troops field since the accepted workbench landed. */
  const count = a.page.getByRole('textbox', { name: 'Troops', exact: true });
  await count.click();
  await count.fill('5');
  assert.equal(await count.inputValue(), '5');
  await count.press('Enter');
  await until(() => a.view().snapshot.battlePlan?.troops[0]?.undialed === 5, 'Five troops did not save.');
  await a.page.getByRole('textbox', { name: 'Committed spice', exact: true }).fill('5');
  await a.page.getByRole('textbox', { name: 'Committed spice', exact: true }).press('Enter');
  await until(() => a.view().snapshot.battlePlan?.spice === 5, 'Five spice did not reserve.');
  assert.equal(a.view().snapshot.bank.balance, 2);
  await count.fill('3');
  await count.press('Enter');
  await until(() => a.view().snapshot.battlePlan?.spice === 3, 'Troop declaration did not save.');
  assert.equal(a.view().snapshot.battlePlan.troops[0].dialed, 3);
  assert.equal(a.view().snapshot.bank.balance, 4);
  await a.page.getByRole('combobox', { name: 'Leader', exact: true }).click();
  await a.page.getByRole('option', { name: 'Recovery token', exact: true }).click();
  await until(() => a.view().snapshot.battlePlan.leaderId === token.id, 'Leader did not commit.');
  await commitCard({ who: a, name: 'Treachery card', until });
  assert.equal(b.view().snapshot.battle.revealed, undefined);
  await a.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
  await a.page.getByRole('heading', { name: 'Battle', exact: true }).scrollIntoViewIfNeeded();
  await capture(a, 'after-battle-private-plan');
  await capture(observer, 'after-battle-observer-preparation');
}
/** The workbench commits a hand card through a pressed button; the committed card reads as removable. */
async function commitCard({ who, name, until }) {
  await who.page.getByRole('button', { name: `Add ${name} to battle plan`, exact: true }).click();
  await until(() => who.view().snapshot.battlePlan?.cardIds.length === 1, `${name} did not commit.`);
  await who.page.getByRole('button', { name: `Remove ${name} from battle plan`, exact: true, pressed: true }).waitFor();
}
function inspectPrivateCollections(peers) {
  for (const who of peers) {
    for (const message of who.rawMessages) {
      assert.equal(Object.hasOwn(message.snapshot ?? {}, 'factionInventories'), false);
      assert.equal(Object.hasOwn(message.snapshot ?? {}, 'factionBanks'), false);
    }
  }
}
async function verifyReverseBattle({ a, b, openTab, drag, button, until, act, passed }) {
  await openTab(b, 'Battle');
  await drag(b, button(b, 'Drag battle marker onto territory'), [0, 0.18, 0]);
  await until(() => b.view().snapshot.battle, 'Second battle did not start.');
  await act(b, 'Claim left side');
  await act(a, 'Claim right side');
  await act(b, 'Ready for battle');
  await act(a, 'Ready for battle');
  await act(b, 'Undo Ready');
  await act(b, 'Ready for battle');
  await a.page.reload({ waitUntil: 'domcontentloaded' });
  await a.page.locator('[data-connection="authorized"]').waitFor();
  await until(
    () => a.view().snapshot.battle?.stage === 'revealed' && b.view().snapshot.battle?.stage === 'revealed',
    'Reversed battle did not reveal.',
    15_000
  );
  await act(b, 'Right side won');
  await act(a, 'Right side won');
  await until(() => !b.view().snapshot.battle, 'Reversed battle did not resolve.');
  assert.equal(a.view().snapshot.battleResults[0].outcome, 'right');
  passed('Both players can claim either side, withdraw Ready and reconnect during their countdown');
}
