import { afterEach, describe, expect, it } from 'vitest';

import { PHASE_CHANGE_COOLDOWN_MS, TABLE_PHASES } from '../../src/shared/play/phases';
import { draftingRuntime } from './native-drafting.fixture.mjs';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.mjs';

/*
 * Authored troop combat values travel from a faction's definition, through its capture at assignment
 * and setup, into a real game's battle plans, using ordinary commands only.
 * Harkonnen's troops carry synthetic authored values; Atreides keeps the shared fixture's troops,
 * which predate combat authoring and so have none.
 */

const BATTLE = TABLE_PHASES.findIndex((phase) => phase.id === 'battle');
const AUTHORED_TROOPS = [
  {
    troopId: '40000000-0000-4000-8000-000000000001',
    name: 'Trooper',
    image: '/vector/troop/harkonnen.svg',
    description: 'Synthetic trooper',
    count: 20,
    combat: { strength: 0.5, fundedStrength: 1 },
    back: {
      name: 'Veteran',
      image: '/vector/troop/harkonnen.svg',
      description: 'Synthetic veteran',
      combat: { strength: -0.5, fundedStrength: 2.5, fundingCost: 2 },
    },
  },
  {
    troopId: '40000000-0000-4000-8000-000000000002',
    name: 'Envoy',
    image: '/vector/troop/harkonnen.svg',
    description: 'Synthetic envoy that never fights',
    count: 2,
    capable: false,
    back: {
      name: 'Zealot',
      image: '/vector/troop/harkonnen.svg',
      description: 'Synthetic zealot',
      combat: { strength: 1, fundedStrength: 1.5, fundingCost: 0 },
    },
  },
];

describe('Authored troop combat values in a real game', { timeout: 120_000 }, () => {
  let peer, runtime, offset;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const stored = async () => JSON.parse((await runtime.exec('SELECT data FROM current_state'))[0].data);
  async function next(connection) {
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    return accepted(connection, { kind: 'phase', direction: 1 });
  }
  /** Seats two accounts and readies the draft until the deal assigns their factions. */
  async function deal() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    for (const connection of [a, b]) {
      await accepted(connection, { kind: 'draft-ready', ready: true });
    }
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'the deal', 20_000);
    return [a, b];
  }
  /** Readies one seat to keep what it was dealt, while trading is still open. */
  async function keepSeat(connection) {
    const view = await syncView(connection);
    if (view.snapshot.stage !== 'swapping') {
      return;
    }
    await accepted(connection, {
      kind: 'swap-ready',
      ready: true,
      round: view.snapshot.swapping.round,
      seat: view.viewer.viewerSeat,
    });
  }
  async function readyAll(players) {
    for (const connection of players) {
      await accepted(connection, { kind: 'ready', ready: true });
    }
  }
  const waitsForReadiness = (snapshot) =>
    snapshot.stage === 'setup' && snapshot.controls.ready.length < snapshot.roster.seats.length;
  /** Runs setup through to the first phase of play, readying every seat whenever it waits for them. */
  async function throughSetup(players) {
    let { snapshot } = await syncView(players[0]);
    for (let guard = 0; guard < 8 && snapshot.stage !== 'play'; guard++) {
      if (waitsForReadiness(snapshot)) {
        await readyAll(players);
      }
      ({ snapshot } = await next(players[0]));
    }
    expect(snapshot.stage).toBe('play');
  }
  /** Deals, trades and sets up a real game, then advances to the Battle phase; returns each faction's connection. */
  async function toBattle() {
    const players = await deal();
    /* The catalogue loses both factions after assignment; the game plays from what it retained. */
    peer.factions.clear();
    for (const connection of players) {
      await keepSeat(connection);
    }
    await throughSetup(players);
    while ((await syncView(players[0])).snapshot.phase % TABLE_PHASES.length !== BATTLE) {
      await next(players[0]);
    }
    const views = await Promise.all(players.map(syncView));
    const harkonnen = views.findIndex((view) => view.snapshot.bank.factionId === 'harkonnen');
    return { harkonnen: players[harkonnen], atreides: players[1 - harkonnen] };
  }

  it('supplies both authored faces, omits noncombatant and unauthored faces, and funds the retained values', async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    const harkonnenSource = peer.factions.get('harkonnen');
    peer.factions.set('harkonnen', {
      ...harkonnenSource,
      data: { ...harkonnenSource.data, troops: AUTHORED_TROOPS },
    });
    const { harkonnen, atreides } = await toBattle();

    const { factions } = await runtime.captures();
    const problems = Object.fromEntries(
      factions.map((capture) => [
        capture.faction.id,
        capture.readiness.problems.filter((problem) => problem.reason.includes('combat values')),
      ])
    );
    expect(problems.harkonnen).toEqual([]);
    expect(problems.atreides).toEqual([
      { subject: 'troop Regular troop', reason: 'This troop face can fight but has no authored combat values.' },
    ]);

    const state = await stored();
    expect(state.combatFaces).toEqual({
      harkonnen: [
        {
          id: 'troop-0-front',
          name: 'Trooper',
          capable: true,
          strength: 0.5,
          fundedStrength: 1,
          fundingCost: 1,
          image: '/vector/troop/harkonnen.svg',
        },
        {
          id: 'troop-0-back',
          name: 'Veteran',
          capable: true,
          strength: -0.5,
          fundedStrength: 2.5,
          fundingCost: 2,
          image: '/vector/troop/harkonnen.svg',
        },
        {
          id: 'troop-1-back',
          name: 'Zealot',
          capable: true,
          strength: 1,
          fundedStrength: 1.5,
          fundingCost: 0,
          image: '/vector/troop/harkonnen.svg',
        },
      ],
      atreides: [],
    });
    /* Artwork is public; combat values reach the plans through combatFaces alone. */
    expect(JSON.stringify(state.factionArtwork)).not.toContain('combat');
    expect(JSON.stringify(state.factionArtwork)).not.toContain('capable');

    const started = await accepted(harkonnen, {
      kind: 'battle-start',
      anchor: [0.95, 0.18, -3.05],
      territory: 'Arrakeen',
    });
    const battleId = started.snapshot.battle.id;
    await accepted(harkonnen, { kind: 'battle-claim', battleId, side: 0 });
    const claimed = await accepted(atreides, { kind: 'battle-claim', battleId, side: 1 });
    expect(claimed.snapshot.battlePlan.faces).toEqual([]);
    const bank = (await syncView(harkonnen)).snapshot.bank.balance;
    const plan = (troops, spice, extra = {}) => ({
      mode: 'max',
      troops: [{ faceId: 'troop-0-front', undialed: troops, dialed: 0 }],
      spice,
      adjustment: 0,
      leaderId: null,
      cardIds: [],
      ...extra,
    });

    /* The browser funding case: five troops reserve five spice; three return two. */
    const five = await accepted(harkonnen, { kind: 'battle-plan', battleId, plan: plan(5, 5) });
    expect(five.snapshot.bank.balance).toBe(bank - 5);
    expect(five.snapshot.battlePlan.strength).toBe(5);
    const three = await accepted(harkonnen, { kind: 'battle-plan', battleId, plan: plan(3, 5) });
    expect(three.snapshot.battlePlan.spice).toBe(3);
    expect(three.snapshot.bank.balance).toBe(bank - 3);
    expect(three.snapshot.battlePlan.strength).toBe(3);

    /* Mixed faces, fractional and negative strengths and a zero cost, with exact usable funding. */
    const mixed = (spice) =>
      plan(0, spice, {
        troops: [
          { faceId: 'troop-0-front', undialed: 2, dialed: 0 },
          { faceId: 'troop-0-back', undialed: 1, dialed: 0 },
          { faceId: 'troop-1-back', undialed: 2, dialed: 0 },
        ],
      });
    const odd = await sendCommand(harkonnen, { kind: 'battle-plan', battleId, plan: mixed(5) });
    expect(odd.reply).toMatchObject({ type: 'rejected' });
    const funded = await accepted(harkonnen, { kind: 'battle-plan', battleId, plan: mixed(4) });
    expect(funded.snapshot.battlePlan.spice).toBe(4);
    expect(funded.snapshot.bank.balance).toBe(bank - 4);
    /* Two spice lift a veteran by three, one each lifts a trooper by a half, and the zealots fund free. */
    expect(funded.snapshot.battlePlan.strength).toBe(2 * 1 + 2.5 + 2 * 1.5);
    /* Switching modes resets the declaration and refunds the reserve, so the Custom plan is sent twice. */
    const custom = await accepted(harkonnen, {
      kind: 'battle-plan',
      battleId,
      plan: { ...mixed(0), mode: 'custom', troops: [{ faceId: 'troop-0-back', undialed: 1, dialed: 1 }] },
    });
    expect(custom.snapshot.battlePlan.spice).toBe(0);
    expect(custom.snapshot.bank.balance).toBe(bank);
    const customFunded = await accepted(harkonnen, {
      kind: 'battle-plan',
      battleId,
      plan: { ...mixed(0), mode: 'custom', troops: [{ faceId: 'troop-0-back', undialed: 1, dialed: 1 }] },
    });
    expect(customFunded.snapshot.battlePlan.spice).toBe(2);
    expect(customFunded.snapshot.battlePlan.strength).toBe(-0.5 + 2.5);
    expect(customFunded.snapshot.bank.balance).toBe(bank - 2);
    for (const faceId of ['troop-1-front', 'Envoy']) {
      const refused = await sendCommand(harkonnen, {
        kind: 'battle-plan',
        battleId,
        plan: plan(0, 0, { mode: 'custom', troops: [{ faceId, undialed: 1, dialed: 0 }] }),
      });
      expect(refused.reply).toMatchObject({ type: 'rejected', message: 'Choose each eligible troop face once.' });
    }
  });
});
