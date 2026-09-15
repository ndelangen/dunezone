import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPeer, createRuntime, openGame, provision, eventually } from './native-runtime.fixture.mjs';

describe('Player-run battles through the native game boundary', { timeout: 15_000 }, () => {
  let peer, runtime, a, b, observer;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
    const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const state = JSON.parse(rows[0].data);
    state.phase = 6;
    state.factionBanks = { harkonnen: 10, atreides: 10 };
    const card = state.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    card.items[0].artwork = {
      front: 'https://example.test/secret-card.png',
      back: 'https://example.test/back.png',
      name: 'Secret card',
      type: 'treachery',
    };
    state.table.pieces.push({
      ...structuredClone(state.table.pieces.find((piece) => piece.id === 'harkonnen-force-loose')),
      id: 'fixture-leader',
      label: 'Fixture leader',
      position: [-2, 0.14, 0],
      items: [
        {
          id: 'leader-item',
          faceUp: true,
          artwork: {
            front: 'https://example.test/leader.png',
            back: 'https://example.test/back.png',
            name: 'Fixture leader',
            type: 'token-disc',
          },
        },
      ],
    });
    state.combatFaces = {
      harkonnen: [
        { id: 'harkonnen-front', name: 'Front', strength: 0.5, fundedStrength: 1 },
        { id: 'heavy', name: 'Heavy', strength: -0.5, fundedStrength: 2.5, fundingCost: 2 },
        { id: 'free', name: 'Free', strength: 0.5, fundedStrength: 1.5, fundingCost: 0 },
        { id: 'negative', name: 'Negative', strength: 1, fundedStrength: -1, fundingCost: 0 },
        { id: 'incapable', name: 'Incapable', strength: 1, fundedStrength: 2, capable: false },
      ],
      atreides: [],
    };
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(state)]);
    await runtime.restart();
    a = await admit('a');
    b = await admit('b');
    observer = await admit('c');
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  async function admit(suffix) {
    peer.registrationId = `registration-${suffix}`;
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    await connection.message('view');
    return connection;
  }
  async function sync(connection) {
    const start = connection.messages.length;
    connection.send({ type: 'sync' });
    return eventually(
      () => connection.messages.slice(start).find((message) => message.type === 'view'),
      'fresh battle view'
    );
  }
  async function command(connection, action, envelope = {}) {
    const view = await sync(connection);
    const commandId = envelope.commandId ?? crypto.randomUUID();
    const start = connection.messages.length;
    const message = { type: 'command', commandId, action, expectedRevision: view.snapshot.revision, ...envelope };
    connection.send(message);
    const reply = await eventually(
      () =>
        connection.messages
          .slice(start)
          .find((message) =>
            message.type === 'rejected' ? message.requestId === commandId : message.completedCommandId === commandId
          ),
      'battle command'
    );
    return { reply, message, snapshot: (await sync(connection)).snapshot };
  }
  async function start() {
    const started = await command(a, { kind: 'battle-start', anchor: [0.95, 0.18, -3.05], territory: 'Arrakeen' });
    const battleId = started.snapshot.battle.id;
    await command(a, { kind: 'battle-claim', battleId, side: 0 });
    await command(b, { kind: 'battle-claim', battleId, side: 1 });
    return battleId;
  }
  function plan(troops = 5, spice = 5, extra = {}) {
    return {
      mode: 'max',
      troops: [{ faceId: 'harkonnen-front', undialed: troops, dialed: 0 }],
      spice,
      adjustment: -0.25,
      leaderId: null,
      cardIds: [],
      ...extra,
    };
  }
  async function ready(battleId) {
    await command(a, { kind: 'battle-ready', battleId, ready: true });
    return command(b, { kind: 'battle-ready', battleId, ready: true });
  }
  async function revealed(connection = a) {
    return eventually(
      async () => {
        const view = await sync(connection);
        return view.snapshot.battle?.stage === 'revealed' && view.snapshot;
      },
      'authoritative reveal',
      8000
    );
  }

  it('returns an invalidated reserve and spends the rest once, with no private plan in other frames', async () => {
    const battleId = await start();
    a.messages.length = 0;
    b.messages.length = 0;
    observer.messages.length = 0;
    const saved = await command(a, { kind: 'battle-plan', battleId, plan: plan() });
    expect(saved.snapshot.bank.balance).toBe(5);
    const lowered = await command(a, { kind: 'battle-plan', battleId, plan: plan(3) });
    expect(lowered.snapshot.bank.balance).toBe(7);
    expect(lowered.snapshot.battlePlan.spice).toBe(3);
    expect(lowered.snapshot.battlePlan.strength).toBe(2.75);
    for (const connection of [b, observer]) {
      const view = await sync(connection);
      expect(view.snapshot.battle).not.toHaveProperty('revealed');
      for (const message of connection.messages) {
        expect(JSON.stringify(message)).not.toContain('factionInventories');
        expect(JSON.stringify(message)).not.toContain('factionBanks');
        expect(JSON.stringify(message)).not.toContain('harkonnen-front","undialed');
      }
    }
    await ready(battleId);
    const result = await revealed();
    expect(result.bank.balance).toBe(7);
    expect(result.battle.revealed[0].spice).toBe(3);
    await runtime.alarm(true);
    expect((await sync(a)).snapshot.bank.balance).toBe(7);
  });

  it('Undo Ready preserves both plans and reserves, clears only its side and restarts a full countdown', async () => {
    const battleId = await start();
    await command(a, { kind: 'battle-plan', battleId, plan: plan() });
    const first = await ready(battleId);
    const undone = await command(a, { kind: 'battle-ready', battleId, ready: false });
    expect(undone.snapshot.battle.stage).toBe('preparing');
    expect(undone.snapshot.battle.sides.map((side) => side.ready)).toEqual([false, true]);
    expect(undone.snapshot.bank.balance).toBe(5);
    expect(undone.snapshot.battlePlan.spice).toBe(5);
    await runtime.alarm(true);
    expect((await sync(a)).snapshot.battle.stage).toBe('preparing');
    const again = await command(a, { kind: 'battle-ready', battleId, ready: true });
    expect(again.snapshot.battle.deadline).toBeGreaterThan(first.snapshot.battle.deadline);
    expect(again.snapshot.battle.deadline - Date.now()).toBeGreaterThan(4000);
    expect((await command(a, { kind: 'battle-cancel', battleId })).reply.type).toBe('rejected');
  });

  it('preserves countdown through cold restore and replacement and rejects former faction authority', async () => {
    const battleId = await start();
    await command(a, { kind: 'battle-plan', battleId, plan: plan() });
    const countdown = await ready(battleId);
    await runtime.exec("UPDATE actors SET seat='neutral' WHERE user_id='user-a'");
    await runtime.exec("UPDATE actors SET seat='harkonnen' WHERE user_id='user-c'");
    expect((await sync(a)).snapshot.battlePlan).toBeNull();
    expect((await command(a, { kind: 'battle-ready', battleId, ready: false })).reply.type).toBe('rejected');
    expect((await sync(observer)).snapshot.battlePlan.spice).toBe(5);
    await runtime.restart();
    const replacement = await admit('c');
    expect((await sync(replacement)).snapshot.battle.deadline).toBe(countdown.snapshot.battle.deadline);
    expect((await revealed(replacement)).bank.balance).toBe(5);
    expect((await command(replacement, { kind: 'battle-ready', battleId, ready: false })).reply.type).toBe('rejected');
  });

  it('cancels once with private inventory and reserve restored and board troops unchanged', async () => {
    await command(a, { kind: 'hand-take', pieceId: 'treachery-card-loose' });
    await command(a, { kind: 'hand-take', pieceId: 'fixture-leader' });
    const battleId = await start();
    const before = (await sync(a)).snapshot.table;
    const selected = plan(5, 5, { leaderId: 'fixture-leader', cardIds: ['treachery-card-loose'] });
    await command(a, { kind: 'battle-plan', battleId, plan: selected });
    expect((await sync(a)).snapshot.hand).toHaveLength(0);
    const cancelled = await command(b, { kind: 'battle-cancel', battleId });
    expect(cancelled.snapshot.battle).toBeNull();
    const own = (await sync(a)).snapshot;
    expect(own.hand).toHaveLength(2);
    expect(own.bank.balance).toBe(10);
    expect(own.table.pieces).toEqual(before.pieces);
    expect(own.table.events).toEqual(before.events);
    expect(own.battleResults).toEqual([]);
    b.send(cancelled.message);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await sync(a)).snapshot.hand).toHaveLength(2);
    expect((await command(a, { kind: 'battle-ready', battleId, ready: true })).reply.type).toBe('rejected');
  });

  it('retains revealed declarations when a card returns to hand and resolves only matching public choices', async () => {
    await command(a, { kind: 'hand-take', pieceId: 'treachery-card-loose' });
    const battleId = await start();
    await command(a, { kind: 'battle-plan', battleId, plan: plan(2, 1, { cardIds: ['treachery-card-loose'] }) });
    await ready(battleId);
    await revealed();
    await command(a, { kind: 'hand-take', pieceId: 'treachery-card-loose' });
    await command(a, { kind: 'battle-outcome', battleId, outcome: 'left' });
    const opposing = await command(b, { kind: 'battle-outcome', battleId, outcome: 'right' });
    expect(opposing.snapshot.battle.sides.map((side) => side.choice)).toEqual(['left', 'right']);
    expect((await command(observer, { kind: 'battle-outcome', battleId, outcome: 'left' })).reply.type).toBe(
      'rejected'
    );
    const resolved = await command(b, { kind: 'battle-outcome', battleId, outcome: 'left' });
    expect(resolved.snapshot.battle).toBeNull();
    expect(resolved.snapshot.battleResults[0].plans[0].pieces[0].items[0].artwork.name).toBe('Secret card');
    expect((await sync(a)).snapshot.hand).toHaveLength(1);
    expect(resolved.snapshot.table.pieces.some((piece) => piece.id === 'treachery-card-loose')).toBe(false);
    expect((await runtime.exec('SELECT * FROM battle_results')).length).toBe(1);
    expect((await command(a, { kind: 'battle-outcome', battleId, outcome: 'right' })).reply.type).toBe('rejected');
  });

  it('rejects competing starts and claims, counts exact funding and refunds a mode switch', async () => {
    const battleId = await start();
    expect((await command(b, { kind: 'battle-start', anchor: [0, 0, 0], territory: 'Polar Sink' })).reply.type).toBe(
      'rejected'
    );
    expect((await command(a, { kind: 'battle-claim', battleId, side: 1 })).reply.type).toBe('rejected');
    expect((await command(a, { kind: 'battle-plan', battleId, plan: plan(2, 3) })).reply.type).toBe('rejected');
    await command(a, { kind: 'battle-plan', battleId, plan: plan(5, 5) });
    const switched = await command(a, { kind: 'battle-plan', battleId, plan: plan(5, 5, { mode: 'custom' }) });
    expect(switched.snapshot.battlePlan.troops).toEqual([]);
    expect(switched.snapshot.battlePlan.spice).toBe(0);
    expect(switched.snapshot.bank.balance).toBe(10);
    await command(a, { kind: 'phase' });
    expect((await sync(a)).snapshot.battle.id).toBe(battleId);
    expect((await command(a, { kind: 'battle-ready', battleId, ready: true })).reply.type).not.toBe('rejected');
  });
  it('keeps physical troop discs on the board and prevents reset from duplicating private pieces', async () => {
    expect((await command(a, { kind: 'hand-take', pieceId: 'harkonnen-force-loose' })).reply.type).toBe('rejected');
    await command(a, { kind: 'hand-take', pieceId: 'treachery-card-loose' });
    expect((await command(a, { kind: 'reset' })).reply.type).toBe('rejected');
    expect((await sync(a)).snapshot.hand).toHaveLength(1);
    expect((await sync(a)).snapshot.table.pieces.some((piece) => piece.id === 'treachery-card-loose')).toBe(false);
    const played = await command(a, { kind: 'hand-play', pieceId: 'treachery-card-loose', position: [29, 0, 29] });
    const card = played.snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    expect(Math.hypot(card.position[0], card.position[2])).toBeLessThan(5.55);
    expect(card.items[0].faceUp).toBe(false);
    expect((await sync(a)).snapshot.hand).toHaveLength(0);
  });

  it('maximizes exact funding with zero costs and signed strengths and derives the custom price', async () => {
    const battleId = await start();
    const troops = [
      { faceId: 'heavy', undialed: 3, dialed: 0 },
      { faceId: 'free', undialed: 2, dialed: 0 },
      { faceId: 'negative', undialed: 2, dialed: 0 },
    ];
    expect((await command(a, { kind: 'battle-plan', battleId, plan: plan(0, 3, { troops }) })).reply.type).toBe(
      'rejected'
    );
    const exact = await command(a, { kind: 'battle-plan', battleId, plan: plan(0, 4, { troops }) });
    expect(exact.snapshot.battlePlan.troops.map((troop) => troop.dialed)).toEqual([2, 2, 0]);
    expect(exact.snapshot.battlePlan.strength).toBe(9.25);
    expect(exact.snapshot.bank.balance).toBe(6);
    expect(
      (
        await command(a, {
          kind: 'battle-plan',
          battleId,
          plan: plan(0, 0, { troops: [{ faceId: 'incapable', undialed: 1, dialed: 0 }] }),
        })
      ).reply.type
    ).toBe('rejected');
    await command(a, { kind: 'battle-plan', battleId, plan: plan(0, 4, { troops, mode: 'custom' }) });
    const custom = await command(a, {
      kind: 'battle-plan',
      battleId,
      plan: plan(0, 999, { troops: [{ faceId: 'heavy', undialed: 1, dialed: 2 }], mode: 'custom' }),
    });
    expect(custom.snapshot.battlePlan.spice).toBe(4);
    expect(custom.snapshot.bank.balance).toBe(6);
  });

  it('orders cancellation and the second Ready, rejecting commands for the cancelled predecessor', async () => {
    const first = await start();
    await command(a, { kind: 'battle-plan', battleId: first, plan: plan() });
    await command(a, { kind: 'battle-ready', battleId: first, ready: true });
    await command(b, { kind: 'battle-cancel', battleId: first });
    expect((await command(b, { kind: 'battle-ready', battleId: first, ready: true })).reply.type).toBe('rejected');
    const second = await start();
    expect((await command(a, { kind: 'battle-cancel', battleId: first })).reply.type).toBe('rejected');
    await ready(second);
    expect((await command(a, { kind: 'battle-cancel', battleId: second })).reply.type).toBe('rejected');
    await runtime.clock(6000);
    const late = await command(a, { kind: 'battle-ready', battleId: second, ready: false });
    expect(late.reply.type).toBe('rejected');
    expect(late.snapshot.battle.stage).toBe('revealed');
    expect(late.snapshot.bank.balance).toBe(10);
  });

  it('retains every public reveal and result through older history reads after more than twenty battles', async () => {
    let firstId;
    for (let index = 0; index < 21; index++) {
      const battleId = await start();
      firstId ??= battleId;
      await ready(battleId);
      await runtime.clock((index + 1) * 6000);
      await command(a, { kind: 'battle-outcome', battleId, outcome: 'none' });
      await command(b, { kind: 'battle-outcome', battleId, outcome: 'none' });
    }
    expect((await sync(a)).snapshot.battleResults).toHaveLength(20);
    for (const [step, stage] of [
      [1, 'revealed'],
      [2, null],
    ]) {
      const index = observer.messages.length;
      observer.send({ type: 'history', step });
      const history = await eventually(
        () => observer.messages.slice(index).find((message) => message.type === 'history'),
        'older battle history'
      );
      if (stage) {
        expect(history.snapshot.battle.id).toBe(firstId);
      } else {
        expect(history.snapshot.battleResults[0].id).toBe(firstId);
      }
      expect(history.snapshot.battlePlan).toBeNull();
      expect(history.snapshot).not.toHaveProperty('hand');
    }
  });

  it.each(['movement-first', 'resolution-first'])('serializes overlay movement and resolution: %s', async (order) => {
    await command(a, { kind: 'hand-take', pieceId: 'fixture-leader' });
    const battleId = await start();
    await command(a, { kind: 'battle-plan', battleId, plan: plan(1, 0, { leaderId: 'fixture-leader' }) });
    await ready(battleId);
    await runtime.clock(6000);
    const view = await sync(a);
    a.send({
      type: 'begin',
      carryId: 'leader-carry',
      sourcePieceId: 'fixture-leader',
      expectedVersion: view.snapshot.versions['fixture-leader'],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'leader-carry');
    const drop = {
      type: 'drop',
      commandId: 'leader-drop',
      carryId: 'leader-carry',
      position: [-2, 0.38, 2],
      orientation: 0,
    };
    async function move() {
      const index = a.messages.length;
      a.send(drop);
      return eventually(
        () =>
          a.messages
            .slice(index)
            .find((message) => message.completedCommandId === 'leader-drop' || message.requestId === 'leader-drop'),
        'leader movement'
      );
    }
    if (order === 'movement-first') {
      expect((await move()).type).not.toBe('rejected');
    }
    await command(a, { kind: 'battle-outcome', battleId, outcome: 'none' });
    await command(b, { kind: 'battle-outcome', battleId, outcome: 'none' });
    if (order === 'resolution-first') {
      expect((await move()).type).toBe('rejected');
    }
    const final = (await sync(a)).snapshot;
    const leaders = final.table.pieces.filter((piece) => piece.id === 'fixture-leader');
    expect(leaders).toHaveLength(1);
    expect(leaders[0].battleOverlay).toBeUndefined();
    if (order === 'movement-first') {
      expect([leaders[0].position[0], leaders[0].position[2]]).toEqual([-2, 2]);
    }
    expect(final.battleResults[0].plans[0].leaderId).toBe('fixture-leader');
    expect(final.bank.balance).toBe(10);
  });
  it('rejects invalid anchors, unavailable resources, duplicate choices and locked plan edits', async () => {
    expect((await command(a, { kind: 'battle-start', anchor: [29, 0, 29], territory: 'Outside' })).reply.type).toBe(
      'rejected'
    );
    const battleId = await start();
    expect((await command(a, { kind: 'battle-plan', battleId, plan: plan(12, 12) })).reply.message).toBe(
      'There is not enough banked spice for this plan.'
    );
    const invalid = [
      plan(12, 12),
      plan(1, 0, { leaderId: 'harkonnen-force-loose' }),
      plan(1, 0, { cardIds: ['not-owned'] }),
      plan(1, 0, {
        troops: [
          { faceId: 'harkonnen-front', undialed: 1, dialed: 0 },
          { faceId: 'harkonnen-front', undialed: 1, dialed: 0 },
        ],
      }),
      plan(1, 0, { troops: [{ faceId: 'harkonnen-front', undialed: Number.MAX_SAFE_INTEGER, dialed: 1 }] }),
    ];
    for (const input of invalid) {
      expect((await command(a, { kind: 'battle-plan', battleId, plan: input })).reply.type).toBe('rejected');
    }
    expect((await command(b, { kind: 'battle-plan', battleId, plan: plan() })).reply.type).toBe('rejected');
    expect((await command(observer, { kind: 'hand-take', pieceId: 'fixture-leader' })).reply.type).toBe('rejected');
    expect((await command(a, { kind: 'battle-outcome', battleId, outcome: 'none' })).reply.type).toBe('rejected');
    await command(a, { kind: 'hand-take', pieceId: 'treachery-card-loose' });
    expect(
      (
        await command(a, {
          kind: 'battle-plan',
          battleId,
          plan: plan(1, 0, { cardIds: ['treachery-card-loose', 'treachery-card-loose'] }),
        })
      ).reply.type
    ).toBe('rejected');
    expect(
      (await command(a, { kind: 'battle-plan', battleId, plan: plan(1, 0, { leaderId: 'treachery-card-loose' }) }))
        .reply.type
    ).toBe('rejected');
    await command(a, { kind: 'battle-ready', battleId, ready: true });
    expect((await command(a, { kind: 'battle-plan', battleId, plan: plan() })).reply.type).toBe('rejected');
    expect((await command(a, { kind: 'battle-ready', battleId, ready: true })).reply.type).toBe('rejected');
  });
});
