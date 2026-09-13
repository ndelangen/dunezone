import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publishingTokenFace } from '../../src/shared/assets/fixtures/publishingTokenFace';
import { createPeer, createRuntime, openGame, provision, eventually } from './native-runtime.fixture.mjs';

function tokenPage(name = 'Recovery token') {
  return {
    asset: {
      id: 'token-asset',
      type: 'token-disc',
      slug: 'recovery',
      name,
      data: {
        name,
        about: '',
        front: publishingTokenFace,
        back: { mode: 'same' },
      },
    },
    members: [],
    membersTruncated: false,
    backToken: null,
    backDeck: null,
    assetPublishing: { publicationHref: '/published/tokens/token-asset/token.png' },
    resolvedBack: { href: '/published/tokens/token-asset/token.png' },
  };
}

describe('Hosted readiness and shared inventory through native commands', () => {
  let peer, runtime, number, offset;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 3_600_000;
    peer.catalogue.set('token-disc/recovery', tokenPage());
    runtime = await createRuntime(peer, 'game');
    number = 0;
    offset = 0;
    if ((await provision(runtime)).status !== 200) {
      throw new Error('Fixture provisioning failed');
    }
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
  async function snapshot(connection) {
    return (await eventually(() => connection.messages.findLast((message) => message.type === 'view'), 'current view'))
      .snapshot;
  }
  async function act(connection, action, rejected) {
    const current = await snapshot(connection);
    const message = { type: 'command', commandId: `command-${++number}`, action, expectedRevision: current.revision };
    connection.send(message);
    if (rejected) {
      expect(await connection.message('rejected', (entry) => entry.requestId === message.commandId)).toMatchObject({
        message: expect.stringContaining(rejected),
      });
      return current;
    }
    return (await connection.message('view', (entry) => entry.completedCommandId === message.commandId)).snapshot;
  }
  async function waitPhase() {
    offset += 8001;
    await runtime.clock(offset);
  }

  it('gates Mentat on every occupied seat, survives reconnect, and requires explicit advance and fresh readiness', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const observer = await admit('c');
    await act(a, { kind: 'ready', ready: true }, 'only during Mentat');
    for (let index = 0; index < 8; index++) {
      await waitPhase();
      await act(a, { kind: 'phase' });
    }
    await waitPhase();
    await act(a, { kind: 'phase' }, 'Every seated player');
    await act(observer, { kind: 'ready', ready: true }, 'Spectators');
    await act(observer, { kind: 'phase' }, 'Spectators');
    let state = await act(a, { kind: 'ready', ready: true });
    expect(state.phase).toBe(8);
    expect(state.controls.ready).toEqual(['harkonnen']);
    a.socket.close();
    await act(b, { kind: 'phase' }, 'Every seated player');
    state = await act(b, { kind: 'ready', ready: true });
    expect(state.phase).toBe(8);
    expect(state.controls.ready).toEqual(['harkonnen', 'atreides']);
    const reconnected = await admit('a');
    expect((await snapshot(reconnected)).controls.ready).toEqual(state.controls.ready);
    await act(reconnected, { kind: 'ready', ready: false });
    await act(b, { kind: 'phase' }, 'Every seated player');
    await act(reconnected, { kind: 'ready', ready: true });
    const pieces = (await act(b, { kind: 'spice-spawn', count: 3 })).table.pieces;
    expect((await snapshot(b)).controls.ready).toHaveLength(2);
    state = await act(b, { kind: 'phase' });
    expect(state.phase).toBe(9);
    expect(state.controls.ready).toEqual([]);
    await act(reconnected, { kind: 'phase' }, 'eight seconds');
    await act(b, { kind: 'phase', direction: -1 }, 'eight seconds');
    await act(b, { kind: 'turn', turn: 3 }, 'eight seconds');
    await waitPhase();
    state = await act(b, { kind: 'phase', direction: -1 });
    expect(state.phase).toBe(8);
    expect(state.controls.ready).toEqual([]);
    expect(state.table.pieces).toEqual(pieces);
    await waitPhase();
    await act(b, { kind: 'turn', turn: 3 }, 'Every seated player');
    await runtime.restart();
    const restored = await admit('a');
    expect((await snapshot(restored)).controls.ready).toEqual([]);
    expect((await snapshot(restored)).table.pieces).toEqual(pieces);
  });

  it('captures contents before approval, retains offline requests, and never duplicates requests or spawns', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const observer = await admit('c');
    const initial = await snapshot(a);
    const request = {
      type: 'command',
      commandId: 'request-once',
      expectedRevision: initial.revision,
      action: { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' },
    };
    a.send(request);
    const requested = (await a.message('view', (view) => view.completedCommandId === request.commandId)).snapshot;
    expect(requested.controls.requests).toHaveLength(1);
    expect(requested.table.pieces).toEqual(initial.table.pieces);
    a.messages.length = 0;
    a.send(request);
    expect((await a.message('view', (view) => view.completedCommandId === request.commandId)).snapshot).toEqual(
      requested
    );
    const id = requested.controls.requests[0].id;
    await act(a, { kind: 'spawn-approve', requestId: id }, 'different seated player');
    await act(observer, { kind: 'spawn-approve', requestId: id }, 'Spectators');
    await act(observer, { kind: 'spawn-dismiss', requestId: id }, 'Spectators');
    await act(observer, request.action, 'Only seated players');
    peer.catalogue.set('token-disc/recovery', tokenPage('Changed later'));
    a.socket.close();
    const approved = await act(b, { kind: 'spawn-approve', requestId: id });
    expect(approved.controls.requests).toEqual([]);
    const piece = approved.table.pieces.find((piece) => piece.inventory);
    expect(piece.label).toBe('Recovery token');
    expect(piece.items[0].artwork.name).toBe('Recovery token');
    await act(b, { kind: 'spawn-approve', requestId: id }, 'already been resolved');
    expect((await snapshot(observer)).table.pieces).toEqual(approved.table.pieces);
    await runtime.restart();
    const restored = await admit('b');
    expect((await snapshot(restored)).table.pieces).toEqual(approved.table.pieces);
    expect(await runtime.audit()).toHaveLength(2);
    expect((await runtime.audit()).every((row) => row.contents.includes('Recovery token'))).toBe(true);
    expect(
      peer.requests
        .filter((request) => request.function.startsWith('assets:'))
        .every((request) => !request.headers.authorization)
    ).toBe(true);
  });

  it('dismisses without spawning and refuses incomplete definitions, missing backs and missing members', async () => {
    const a = await admit('a');
    await admit('b');
    let state = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    await runtime.restart();
    const restored = await admit('a');
    expect((await snapshot(restored)).controls.requests).toEqual(state.controls.requests);
    state = await act(restored, { kind: 'spawn-dismiss', requestId: state.controls.requests[0].id });
    expect(state.controls.requests).toEqual([]);
    expect(state.table.pieces.some((piece) => piece.inventory)).toBe(false);
    for (const field of ['definition', 'front', 'back', 'members']) {
      const page = tokenPage();
      if (field === 'definition') {
        page.asset.data = {};
      }
      if (field === 'front') {
        page.assetPublishing.publicationHref = null;
      }
      if (field === 'back') {
        page.resolvedBack.href = null;
      }
      if (field === 'members') {
        page.membersTruncated = true;
      }
      peer.catalogue.set('token-disc/recovery', page);
      await act(
        restored,
        { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' },
        field === 'front' || field === 'back' ? 'Publish every' : 'definition'
      );
    }
  });

  it('spawns directly only for a sole seat and drags out face down with ordinary flip controls', async () => {
    const a = await admit('a');
    let state = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    expect(state.controls.requests).toEqual([]);
    const piece = state.table.pieces.find((piece) => piece.inventory);
    await act(a, { kind: 'flip', pieceId: piece.id }, 'Drag this item');
    a.send({
      type: 'begin',
      carryId: 'inventory-drag',
      sourcePieceId: piece.id,
      expectedVersion: state.versions[piece.id],
      pickup: 'whole',
    });
    await a.message('carry');
    const drop = {
      type: 'drop',
      commandId: 'drop-once',
      carryId: 'inventory-drag',
      position: [0, 0.38, 0],
      orientation: 0,
    };
    a.send(drop);
    state = (await a.message('view', (message) => message.completedCommandId === drop.commandId)).snapshot;
    const dropped = state.table.pieces.find((candidate) => candidate.id === piece.id);
    expect(dropped.inventory).toBeUndefined();
    expect(dropped.items.every((item) => !item.faceUp)).toBe(true);
    state = await act(a, { kind: 'flip', pieceId: piece.id });
    expect(state.table.pieces.find((candidate) => candidate.id === piece.id).items[0].faceUp).toBe(true);
    await admit('b');
    state = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    expect(state.controls.requests).toHaveLength(1);
    expect(state.table.pieces.filter((piece) => piece.inventory)).toHaveLength(0);
  });
});
