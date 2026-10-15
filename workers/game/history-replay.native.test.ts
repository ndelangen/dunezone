import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { PieceAction } from '../../src/shared/play/protocol';
import type { Patch } from './history';
import { applyPatch, diff } from './history';
import type { NativeMessage } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.ts';
import type { StoredSnapshot } from './state';
import { storedSnapshotSchema } from './state';

/** The diff every release before element-wise array patches stored: a changed array is replaced whole. */
function wholeArrayDiff(
  a: Exclude<Patch['value'], undefined> | undefined,
  b: Exclude<Patch['value'], undefined>,
  path: string[] = []
): Patch[] {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return [];
  }
  const object = (value: Patch['value']): value is Record<string, Exclude<Patch['value'], undefined>> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(a) || !object(b)) {
    return [{ path, value: b }];
  }
  return [
    ...Object.keys(a)
      .filter((key) => !Object.hasOwn(b, key))
      .map((key) => ({ path: [...path, key], remove: true as const })),
    ...Object.keys(b).flatMap((key) =>
      Object.hasOwn(a, key) ? wholeArrayDiff(a[key], b[key], [...path, key]) : [{ path: [...path, key], value: b[key] }]
    ),
  ];
}

const parse = (data: string) => storedSnapshotSchema.parse(JSON.parse(data));

describe('Replay history through the native game boundary', { timeout: 30_000 }, () => {
  let peer: NativePeer, runtime: NativeRuntime, a: NativeConnection, b: NativeConnection, offset: number;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
    const [row] = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    const state = storedSnapshotSchema.parse(JSON.parse(row.data));
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
  async function keep(held: Map<number, StoredSnapshot>) {
    const [row] = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    const state = parse(row.data);
    held.set(state.revision, state);
  }

  async function battle(held: Map<number, StoredSnapshot>) {
    const started = await accepted(a, { kind: 'battle-start', anchor: [0.95, 0.18, -3.05], territory: 'Arrakeen' });
    const battleId = required(started.snapshot.battle).id;
    await accepted(a, { kind: 'battle-claim', battleId, side: 0 });
    await accepted(b, { kind: 'battle-claim', battleId, side: 1 });
    const plan: Extract<PieceAction, { kind: 'battle-plan' }>['plan'] = {
      mode: 'custom',
      troops: [],
      spice: 0,
      adjustment: 0,
      leaderId: null,
      cardIds: [],
    };
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
    const held = new Map<number, StoredSnapshot>();
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

    const rows = await runtime.exec<{ step: number; kind: string; revision: number; data: string }>(
      'SELECT step, kind, revision, data FROM history ORDER BY step'
    );
    expect(rows.filter((row) => row.kind === 'patch').length).toBeGreaterThanOrEqual(6);
    let replayed: StoredSnapshot | undefined;
    let old: StoredSnapshot | undefined;
    const kinds = [];
    let compared = 0;
    let elementBytes = 0;
    let wholeBytes = 0;
    for (const row of rows) {
      const previous = replayed;
      replayed =
        row.kind === 'checkpoint'
          ? parse(row.data)
          : storedSnapshotSchema.parse(applyPatch(required(replayed), JSON.parse(row.data) as Patch[]));
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
        const wholePatch = wholeArrayDiff(
          previous as Exclude<Patch['value'], undefined>,
          replayed as Exclude<Patch['value'], undefined>
        );
        old = storedSnapshotSchema.parse(applyPatch(required(old), wholePatch));
        expect(old).toEqual(replayed);
        expect(JSON.parse(row.data) as Patch[]).toEqual(diff(required(previous), replayed));
        elementBytes += required(row.data).length;
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
    const [{ step }] = await runtime.exec<{ step: number }>('SELECT MAX(step) AS step FROM history');
    expect(step).toBeGreaterThan(0);
    expect('historySteps' in reply ? reply.historySteps : undefined).toBe(step);
    const seen = await eventually(
      () =>
        b.messages.findLast(
          (message): message is Extract<NativeMessage, { type: 'update' }> =>
            message.type === 'update' && message.historySteps === step
        ),
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
    const rows = await runtime.exec<{ step: number; kind: string; phase: number }>(
      'SELECT step, kind, phase FROM history ORDER BY step'
    );
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
    const [{ step: last }] = await runtime.exec<{ step: number }>('SELECT MAX(step) AS step FROM history');
    for (const step of [1, 9, 10, required(last) - 1, last]) {
      const start = a.messages.length;
      a.send({ type: 'history', step });
      const reply = await eventually(
        () =>
          a.messages
            .slice(start)
            .find((message): message is Extract<NativeMessage, { type: 'history' }> => message.type === 'history'),
        `history step ${step}`
      );
      expect(reply.step).toBe(step);
      const [clock] = await runtime.exec<{ recorded_at: number }>(
        'SELECT recorded_at FROM history_clocks WHERE step=?',
        [step]
      );
      expect(reply.recordedAt).toBe(clock.recorded_at);
    }
  });

  it('keeps older steps without a clock readable and records new steps after a restart', async () => {
    await runtime.exec('DROP TABLE history_clocks');
    await runtime.restart();
    const observer = await admitPlayer(peer, runtime, 'observer');
    observer.send({ type: 'history', step: 0 });
    const past = await observer.message('history');
    expect(past.recordedAt).toBeUndefined();
    const rejoined = await admitPlayer(peer, runtime, 'a');
    const next = await accepted(rejoined, { kind: 'phase', direction: 1 });
    rejoined.send({ type: 'history', step: 1 });
    const current = await rejoined.message('history');
    expect(current.recordedAt).toBeLessThanOrEqual(required(next.serverNow));
    expect(current.recordedAt).toBeGreaterThan(required(next.serverNow) - 1000);
  });
});
