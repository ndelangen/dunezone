import type { PieceAction } from '../../src/shared/play/protocol';
type BattlePlan = Extract<PieceAction, { kind: 'battle-plan' }>['plan'];
import { afterEach, describe, expect, it } from 'vitest';

import type { FactionInput } from '../../src/shared/factions/schema';
import { PHASE_CHANGE_COOLDOWN_MS, TABLE_PHASES } from '../../src/shared/play/phases';
import type { GameSnapshot } from '../../src/shared/play/protocol';
import { draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeConnection } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.ts';
import { storedSnapshotSchema } from './state';

/*
 * Authored troop battle values travel from a faction's definition, through its capture at assignment
 * and setup, into a real game's battle plans, using ordinary commands only.
 * Harkonnen's troops carry synthetic authored values; Atreides keeps the shared fixture's troops,
 * which predate battle authoring and so have none.
 */

const BATTLE = TABLE_PHASES.findIndex((phase) => phase.id === 'battle');
const AUTHORED_TROOPS: (FactionInput['troops'][number] & { troopId: string })[] = [
  {
    troopId: '40000000-0000-4000-8000-000000000001',
    name: 'Trooper',
    image: '/vector/troop/harkonnen.svg',
    description: 'Synthetic trooper',
    count: 20,
    combat: { strength: 0.5, supportedStrength: 1 },
    back: {
      name: 'Veteran',
      image: '/vector/troop/harkonnen.svg',
      description: 'Synthetic veteran',
      combat: { strength: -0.5, supportedStrength: 2.5, supportCost: 2 },
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
      combat: { strength: 1, supportedStrength: 1.5, supportCost: 0 },
    },
  },
];

describe('Authored troop battle values in a real game', { timeout: 120_000 }, () => {
  let peer: NativePeer, runtime: NativeRuntime, offset: number;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix: string) => admitPlayer(peer, runtime, suffix);
  const stored = async () =>
    storedSnapshotSchema.parse(
      JSON.parse((await runtime.exec<{ data: string }>('SELECT data FROM current_state'))[0].data)
    );
  async function next(connection: NativeConnection) {
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
  async function keepSeat(connection: NativeConnection) {
    const view = await syncView(connection);
    if (view.snapshot.stage !== 'swapping') {
      return;
    }
    await accepted(connection, {
      kind: 'swap-ready',
      ready: true,
      round: required(view.snapshot.swapping).round,
      seat: view.viewer.viewerSeat,
    });
  }
  async function readyAll(players: NativeConnection[]) {
    for (const connection of players) {
      await accepted(connection, { kind: 'ready', ready: true });
    }
  }
  const waitsForReadiness = (snapshot: GameSnapshot) =>
    snapshot.stage === 'setup' && required(snapshot.controls).ready.length < required(snapshot.roster).seats.length;
  /** Runs setup through to the first phase of play, readying every seat whenever it waits for them. */
  async function throughSetup(players: NativeConnection[]) {
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
    const harkonnen = views.findIndex((view) => required(view.snapshot.bank).factionId === 'harkonnen');
    return { harkonnen: players[harkonnen], atreides: players[1 - harkonnen] };
  }

  it('supplies both authored faces, omits faces that cannot fight and unauthored faces, and supports the retained values', async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    const harkonnenSource = required(peer.factions.get('harkonnen'));
    peer.factions.set('harkonnen', {
      ...harkonnenSource,
      data: { ...required(required(harkonnenSource).data), troops: AUTHORED_TROOPS },
    });
    const { harkonnen, atreides } = await toBattle();

    const { factions } = await runtime.captures();
    const problems = Object.fromEntries(
      factions.map((capture) => [
        capture.faction.id,
        capture.readiness.problems.filter((problem) => problem.reason.includes('battle values')),
      ])
    );
    expect(problems.harkonnen).toEqual([]);
    expect(problems.atreides).toEqual([
      { subject: 'troop Regular troop', reason: 'This troop face can fight but has no authored battle values.' },
    ]);

    const state = await stored();
    expect(state.combatFaces).toEqual({
      harkonnen: [
        {
          id: 'troop-0-front',
          name: 'Trooper',
          capable: true,
          strength: 0.5,
          supportedStrength: 1,
          supportCost: 1,
          image: '/vector/troop/harkonnen.svg',
        },
        {
          id: 'troop-0-back',
          name: 'Veteran',
          capable: true,
          strength: -0.5,
          supportedStrength: 2.5,
          supportCost: 2,
          image: '/vector/troop/harkonnen.svg',
        },
        {
          id: 'troop-1-back',
          name: 'Zealot',
          capable: true,
          strength: 1,
          supportedStrength: 1.5,
          supportCost: 0,
          image: '/vector/troop/harkonnen.svg',
        },
      ],
      atreides: [],
    });
    /* Artwork is public; battle values reach the plans through combatFaces alone. */
    expect(JSON.stringify(state.factionArtwork)).not.toContain('combat');
    expect(JSON.stringify(state.factionArtwork)).not.toContain('capable');

    const started = await accepted(harkonnen, {
      kind: 'battle-start',
      anchor: [0.95, 0.18, -3.05],
      territory: 'Arrakeen',
    });
    const battleId = required(started.snapshot.battle).id;
    await accepted(harkonnen, { kind: 'battle-claim', battleId, side: 0 });
    const claimed = await accepted(atreides, { kind: 'battle-claim', battleId, side: 1 });
    expect(required(claimed.snapshot.battlePlan).faces).toEqual([]);
    const reserve = required(required(await syncView(harkonnen)).snapshot.bank).balance;
    const plan = (troops: number, spice: number, extra: Partial<BattlePlan> = {}): BattlePlan => ({
      mode: 'max',
      troops: [{ faceId: 'troop-0-front', undialed: troops, dialed: 0 }],
      spice,
      adjustment: 0,
      leaderId: null,
      cardIds: [],
      ...extra,
    });

    /* The browser support case: five troops reserve five spice; three return two. */
    const five = await accepted(harkonnen, { kind: 'battle-plan', battleId, plan: plan(5, 5) });
    expect(required(five.snapshot.bank).balance).toBe(reserve - 5);
    expect(required(five.snapshot.battlePlan).strength).toBe(5);
    const three = await accepted(harkonnen, { kind: 'battle-plan', battleId, plan: plan(3, 5) });
    expect(required(three.snapshot.battlePlan).spice).toBe(3);
    expect(required(three.snapshot.bank).balance).toBe(reserve - 3);
    expect(required(three.snapshot.battlePlan).strength).toBe(3);

    /* Mixed faces, fractional and negative strengths and a zero cost, with exact usable support. */
    const mixed = (spice: number) =>
      plan(0, spice, {
        troops: [
          { faceId: 'troop-0-front', undialed: 2, dialed: 0 },
          { faceId: 'troop-0-back', undialed: 1, dialed: 0 },
          { faceId: 'troop-1-back', undialed: 2, dialed: 0 },
        ],
      });
    const odd = await sendCommand(harkonnen, { kind: 'battle-plan', battleId, plan: mixed(5) });
    expect(odd.reply).toMatchObject({ type: 'rejected' });
    const supported = await accepted(harkonnen, { kind: 'battle-plan', battleId, plan: mixed(4) });
    expect(required(supported.snapshot.battlePlan).spice).toBe(4);
    expect(required(supported.snapshot.bank).balance).toBe(reserve - 4);
    /* Two spice lift a veteran by three, one each lifts a trooper by a half, and the zealots are supported free. */
    expect(required(supported.snapshot.battlePlan).strength).toBe(2 * 1 + 2.5 + 2 * 1.5);
    /* Switching modes resets the declaration and refunds the reserve, so the Custom plan is sent twice. */
    const custom = await accepted(harkonnen, {
      kind: 'battle-plan',
      battleId,
      plan: { ...mixed(0), mode: 'custom', troops: [{ faceId: 'troop-0-back', undialed: 1, dialed: 1 }] },
    });
    expect(required(custom.snapshot.battlePlan).spice).toBe(0);
    expect(required(custom.snapshot.bank).balance).toBe(reserve);
    const customSupported = await accepted(harkonnen, {
      kind: 'battle-plan',
      battleId,
      plan: { ...mixed(0), mode: 'custom', troops: [{ faceId: 'troop-0-back', undialed: 1, dialed: 1 }] },
    });
    expect(required(customSupported.snapshot.battlePlan).spice).toBe(2);
    expect(required(customSupported.snapshot.battlePlan).strength).toBe(-0.5 + 2.5);
    expect(required(customSupported.snapshot.bank).balance).toBe(reserve - 2);
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
