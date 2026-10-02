import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPatch, diff } from './history';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';
import { storedSnapshotSchema } from './state';

/** The diff every release before element-wise array patches stored: a changed array is replaced whole. */
function wholeArrayDiff(a, b, path = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return [];
  }
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(a) || !object(b)) {
    return [{ path, value: b }];
  }
  return [
    ...Object.keys(a)
      .filter((key) => !Object.hasOwn(b, key))
      .map((key) => ({ path: [...path, key], remove: true })),
    ...Object.keys(b).flatMap((key) =>
      Object.hasOwn(a, key) ? wholeArrayDiff(a[key], b[key], [...path, key]) : [{ path: [...path, key], value: b[key] }]
    ),
  ];
}

const parse = (data) => storedSnapshotSchema.parse(JSON.parse(data));

describe('Replay history through the native game boundary', { timeout: 30_000 }, () => {
  let peer, runtime, a, b, offset;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
    const [row] = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const state = JSON.parse(row.data);
    state.phase = 1;
    state.factionBanks = { harkonnen: 10, atreides: 10 };
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(state)]);
    await runtime.restart();
    a = await admitPlayer(peer, runtime, 'a');
    b = await admitPlayer(peer, runtime, 'b');
    offset = 0;
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  /** Moves the room's clock past a flip's animation and the phase cooldown before the next command. */
  async function later() {
    offset += 10_000;
    await runtime.clock(offset);
  }

  /** The room's stored state now, keyed by its revision, so a replayed step can be compared with what the room held. */
  async function keep(held) {
    const [row] = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const state = parse(row.data);
    held.set(state.revision, state);
  }

  async function battle(held) {
    const started = await accepted(a, { kind: 'battle-start', anchor: [0.95, 0.18, -3.05], territory: 'Arrakeen' });
    const battleId = started.snapshot.battle.id;
    await accepted(a, { kind: 'battle-claim', battleId, side: 0 });
    await accepted(b, { kind: 'battle-claim', battleId, side: 1 });
    const plan = { mode: 'custom', troops: [], spice: 0, adjustment: 0, leaderId: null, cardIds: [] };
    await accepted(a, { kind: 'battle-plan', battleId, plan });
    await accepted(b, { kind: 'battle-plan', battleId, plan });
    await accepted(a, { kind: 'battle-ready', battleId, ready: true });
    await accepted(b, { kind: 'battle-ready', battleId, ready: true });
    offset += 120_000;
    await runtime.clock(offset);
    await eventually(async () => (await syncView(a)).snapshot.battle?.stage === 'revealed', 'reveal', 8000);
    await keep(held);
    await accepted(a, { kind: 'battle-outcome', battleId, outcome: 'left' });
    await accepted(b, { kind: 'battle-outcome', battleId, outcome: 'left' });
    await keep(held);
  }

  it('replays every stored step to the state the room held, and old whole-array patches replay the same', async () => {
    /* The seeded checkpoint predates the fixture's edit to the stored state, so the first kept state is after a command. */
    const held = new Map();
    for (let round = 0; round < 4; round++) {
      await accepted(a, { kind: 'spice-spawn', count: 2 + round });
      await later();
      await accepted(b, { kind: 'flip', pieceId: 'treachery-card-loose' });
      await later();
      await accepted(a, { kind: 'phase', direction: 1 });
      await keep(held);
    }
    await later();
    await accepted(a, { kind: 'phase', direction: 1 });
    await keep(held);
    await battle(held);
    await accepted(a, { kind: 'spice-spawn', count: 1 });
    await later();
    await accepted(a, { kind: 'phase', direction: 1 });
    await keep(held);
    await later();
    await accepted(a, { kind: 'phase', direction: -1 });
    await keep(held);

    const rows = await runtime.exec('SELECT step, kind, revision, data FROM history ORDER BY step');
    expect(rows.filter((row) => row.kind === 'patch').length).toBeGreaterThanOrEqual(6);
    let replayed;
    let old;
    const kinds = [];
    let compared = 0;
    let elementBytes = 0;
    let wholeBytes = 0;
    for (const row of rows) {
      const previous = replayed;
      replayed =
        row.kind === 'checkpoint'
          ? parse(row.data)
          : storedSnapshotSchema.parse(applyPatch(replayed, JSON.parse(row.data)));
      expect(replayed.revision).toBe(row.revision);
      kinds.push([row.kind, replayed.battleState?.stage ?? null]);
      if (held.has(row.revision)) {
        expect(replayed).toEqual(held.get(row.revision));
        compared++;
      }
      /* The same steps stored the way earlier releases stored them replay to the same states. */
      if (row.kind === 'checkpoint') {
        old = replayed;
      } else {
        const wholePatch = wholeArrayDiff(previous, replayed);
        old = storedSnapshotSchema.parse(applyPatch(old, wholePatch));
        expect(old).toEqual(replayed);
        expect(JSON.parse(row.data)).toEqual(diff(previous, replayed));
        elementBytes += row.data.length;
        wholeBytes += JSON.stringify(wholePatch).length;
      }
    }
    expect(compared).toBe(held.size);
    /* The reveal stores its change; the settled outcome after it is the battle's one checkpoint. */
    const reveal = kinds.findIndex(([, stage]) => stage === 'revealed');
    expect(reveal).toBeGreaterThan(0);
    expect(kinds.slice(reveal, reveal + 2)).toEqual([
      ['patch', 'revealed'],
      ['checkpoint', null],
    ]);
    expect(elementBytes).toBeLessThan(wholeBytes);

    /* A cold restore wakes on the same boundary and current state, and plays on. */
    const before = await syncView(a);
    await runtime.restart();
    a = await admitPlayer(peer, runtime, 'a');
    const after = await syncView(a);
    expect(after.snapshot.table).toEqual(before.snapshot.table);
    expect(after.snapshot.revision).toBe(before.snapshot.revision);
    await later();
    await accepted(a, { kind: 'phase', direction: 1 });
  });

  it('tells every viewer the newest history step with each live frame, so playback can reach it', async () => {
    await later();
    const { reply } = await sendCommand(a, { kind: 'phase', direction: 1 });
    const [{ step }] = await runtime.exec('SELECT MAX(step) AS step FROM history');
    expect(step).toBeGreaterThan(0);
    expect(reply.historySteps).toBe(step);
    const seen = await eventually(
      () => b.messages.findLast((message) => message.type === 'update' && message.historySteps === step),
      'other viewer update'
    );
    expect(seen.historySteps).toBe(step);
  });

  it('keeps the opening of every turn whole, so a restore replays at most one turn of phase changes', async () => {
    /* Three turns with no battle, the stretch that used to grow one patch per phase for the rest of the game. */
    for (let step = 0; step < 26; step++) {
      if ((await syncView(a)).snapshot.phase % 9 === 8) {
        await accepted(a, { kind: 'ready', ready: true });
        await accepted(b, { kind: 'ready', ready: true });
      }
      await later();
      await accepted(a, { kind: 'phase', direction: 1 });
    }
    const rows = await runtime.exec('SELECT step, kind, phase FROM history ORDER BY step');
    expect(rows.filter((row) => row.phase % 9 === 0 && row.step > 0).map((row) => row.kind)).toEqual([
      'checkpoint',
      'checkpoint',
      'checkpoint',
    ]);
    let run = 0;
    let longest = 0;
    for (const row of rows) {
      run = row.kind === 'patch' ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThan(9);
    /* Stepping back across a turn keeps that step whole too, and every stored step still restores. */
    await later();
    await accepted(a, { kind: 'phase', direction: -1 });
    await later();
    await accepted(a, { kind: 'phase', direction: -1 });
    const [{ step: last }] = await runtime.exec('SELECT MAX(step) AS step FROM history');
    for (const step of [1, 9, 10, last - 1, last]) {
      const start = a.messages.length;
      a.send({ type: 'history', step });
      const reply = await eventually(
        () => a.messages.slice(start).find((message) => message.type === 'history'),
        `history step ${step}`
      );
      expect(reply.step).toBe(step);
    }
  });
});
