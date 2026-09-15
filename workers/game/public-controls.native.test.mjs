import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { publishingDeckCardback } from '../../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingRectangleTokenFace } from '../../src/shared/assets/fixtures/publishingRectangleTokenFace';
import { publishingTokenFace } from '../../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../../src/shared/assets/fixtures/publishingTreacheryCard';
import { spiceSupplySlot } from '../../src/shared/play/spiceSupply';
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
    resolvedBack: { mode: 'same', href: '/published/tokens/token-asset/token.png' },
  };
}

describe('Hosted readiness and shared inventory through native commands', () => {
  let peer, runtime, number, offset, committedRevision;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 3_600_000;
    peer.catalogue.set('token-disc/recovery', tokenPage());
    runtime = await createRuntime(peer, 'game');
    number = 0;
    offset = 0;
    committedRevision = 0;
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
    return (
      await eventually(
        () =>
          connection.messages.findLast(
            (message) => message.type === 'view' && message.snapshot.revision >= committedRevision
          ),
        'current committed view'
      )
    ).snapshot;
  }
  async function act(connection, action, rejected) {
    const current = await snapshot(connection);
    const message = { type: 'command', commandId: `command-${++number}`, action, expectedRevision: current.revision };
    connection.send(message);
    const reply = await eventually(
      () =>
        connection.messages.find((entry) =>
          entry.type === 'rejected'
            ? entry.requestId === message.commandId
            : entry.type === 'view' && entry.completedCommandId === message.commandId
        ),
      'command outcome'
    );
    if (rejected) {
      expect(reply).toMatchObject({ type: 'rejected', message: expect.stringContaining(rejected) });
      return current;
    }
    expect(reply.type).toBe('view');
    committedRevision = reply.snapshot.revision;
    return reply.snapshot;
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
      const phaseView = a.messages.findLast((message) => message.type === 'view');
      expect(phaseView.phaseCooldownMs).toBeGreaterThan(0);
      expect(phaseView.phaseCooldownMs).toBeLessThanOrEqual(8000);
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
    const replay = await eventually(
      () =>
        a.messages.find((entry) =>
          entry.type === 'rejected'
            ? entry.requestId === request.commandId
            : entry.type === 'view' && entry.completedCommandId === request.commandId
        ),
      'request replay outcome'
    );
    expect(replay.type).toBe('view');
    expect(replay.snapshot).toEqual(requested);
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
        .filter((request) => request.function === 'assets:getPage')
        .every((request) => JSON.stringify(Object.keys(request.args).sort()) === JSON.stringify(['slug', 'type']))
    ).toBe(true);
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
    const invalidPages = [
      {
        rejection: 'definition',
        change: (page) => {
          page.asset.data = {};
        },
      },
      {
        rejection: 'Publish every',
        change: (page) => {
          page.assetPublishing.publicationHref = null;
        },
      },
      {
        rejection: 'Publish every',
        change: (page) => {
          page.resolvedBack.href = null;
        },
      },
      {
        rejection: 'definition',
        change: (page) => {
          page.membersTruncated = true;
        },
      },
      {
        rejection: 'definition',
        change: (page) => {
          page.resolvedBack.mode = 'dangling';
        },
      },
      {
        rejection: 'invalid publication',
        change: (page) => {
          page.assetPublishing.publicationHref = 'https://other.example/published/token.jpg';
        },
      },
    ];
    for (const { rejection, change } of invalidPages) {
      const page = tokenPage();
      change(page);
      peer.catalogue.set('token-disc/recovery', page);
      await act(restored, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' }, rejection);
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
    for (let phase = 0; phase < 8; phase++) {
      await waitPhase();
      await act(a, { kind: 'phase' });
    }
    await waitPhase();
    await act(a, { kind: 'phase' }, 'Every seated player');
    await act(a, { kind: 'ready', ready: true });
    expect((await act(a, { kind: 'phase' })).phase).toBe(9);
    await admit('b');
    state = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    expect(state.controls.requests).toHaveLength(1);
    expect(state.table.pieces.filter((piece) => piece.inventory)).toHaveLength(0);
  });
  it('captures complete decks and mixed token bundles with every member quantity and back', async () => {
    const a = await admit('a');
    const token = tokenPage();
    const rectangle = tokenPage('Rectangle');
    rectangle.asset = {
      ...rectangle.asset,
      id: 'rectangle',
      type: 'token-enhance',
      slug: 'rectangle',
      data: { name: 'Rectangle', about: '', front: publishingRectangleTokenFace, back: { mode: 'same' } },
    };
    peer.catalogue.set('token-enhance/rectangle', rectangle);
    const bundle = {
      ...tokenPage('Bundle'),
      asset: {
        id: 'bundle',
        type: 'bundle',
        slug: 'bundle',
        name: 'Bundle',
        data: { name: 'Bundle', about: '', band: { label: 'Bundle', background: publishingTokenFace.background } },
      },
      members: [
        { member: token.asset, count: 3 },
        { member: rectangle.asset, count: 2 },
      ],
      assetPublishing: null,
      resolvedBack: null,
    };
    peer.catalogue.set('bundle/bundle', bundle);
    let state = await act(a, { kind: 'spawn-request', type: 'bundle', slug: 'bundle' });
    expect(state.table.pieces.filter((piece) => piece.inventory).map((piece) => piece.items.length)).toEqual([3, 2]);
    const card = {
      ...tokenPage('Card'),
      asset: { id: 'card', type: 'card-treachery', slug: 'card', name: 'Card', data: publishingTreacheryCard },
      resolvedBack: null,
    };
    peer.catalogue.set('card-treachery/card', card);
    const deck = {
      ...tokenPage('Deck'),
      asset: {
        id: 'deck',
        type: 'deck',
        slug: 'deck',
        name: 'Deck',
        data: { name: 'Deck', about: '', cardback: publishingDeckCardback },
      },
      members: [{ member: card.asset, count: 4 }],
      resolvedBack: { mode: 'custom', href: '/published/decks/deck/cardback.jpg' },
    };
    peer.catalogue.set('deck/deck', deck);
    const b = await admit('b');
    state = await act(a, { kind: 'spawn-request', type: 'deck', slug: 'deck' });
    const captured = state.controls.requests[0].contents;
    expect(captured.members).toEqual([{ assetId: 'card', count: 4 }]);
    /* The live snapshot omits the captured definitions; the audit row carries them. */
    expect(captured.definitions).toEqual([]);
    const audited = JSON.parse((await runtime.audit()).at(-1).contents);
    expect(audited.definitions.map((entry) => entry.id)).toEqual(['deck', 'card']);
    expect(captured.pieces[0].items).toHaveLength(4);
    expect(
      captured.pieces[0].items.every((item) => item.artwork.back.endsWith('/published/decks/deck/cardback.jpg'))
    ).toBe(true);
    state = await act(b, { kind: 'spawn-approve', requestId: state.controls.requests[0].id });
    const observer = await admit('c');
    const stack = state.table.pieces.find((piece) => piece.kind === 'card' && piece.inventory);
    const hidden = (piece) => {
      for (const item of piece.items) {
        expect(item.faceUp).toBe(false);
        expect(item.artwork).not.toHaveProperty('front');
        expect(item.artwork).not.toHaveProperty('name');
        expect(item.id).toMatch(/^card-[a-f0-9]{64}$/);
      }
    };
    hidden(captured.pieces[0]);
    hidden(stack);
    a.send({ type: 'catalogue', requestId: 'deck-preview', selection: { type: 'deck', slug: 'deck' } });
    hidden((await a.message('catalogue', (message) => message.requestId === 'deck-preview')).contents.pieces[0]);
    hidden((await snapshot(observer)).table.pieces.find((piece) => piece.id === stack.id));
    b.send({
      type: 'begin',
      carryId: 'inventory-top',
      sourcePieceId: stack.id,
      expectedVersion: state.versions[stack.id],
      pickup: 'top',
    });
    const carrying = await b.message('carry', (message) => message.carryId === 'inventory-top');
    expect(carrying.draft.pickedUpItemIds).toEqual([stack.items.at(-1).id]);
    const activity = await observer.message('activity', (message) =>
      message.carries.some((carry) => carry.id === 'inventory-top')
    );
    hidden(activity.carries.find((carry) => carry.id === 'inventory-top').held);
    b.send({ type: 'drop', commandId: 'drop-top', carryId: 'inventory-top', position: [0, 0.38, 0], orientation: 0 });
    state = (await b.message('view', (message) => message.completedCommandId === 'drop-top')).snapshot;
    expect(state.table.pieces.find((piece) => piece.id === stack.id).items).toHaveLength(3);
    expect(state.table.pieces.find((piece) => piece.id === 'carry-inventory-top')).toMatchObject({
      items: [expect.objectContaining({ faceUp: false })],
    });
    expect(state.table.pieces.find((piece) => piece.id === 'carry-inventory-top').inventory).toBeUndefined();
    hidden(state.table.pieces.find((piece) => piece.id === 'carry-inventory-top'));
    await act(b, { kind: 'phase' });
    observer.send({ type: 'history', step: 1 });
    hidden(
      (await observer.message('history')).snapshot.table.pieces.find((piece) => piece.id === 'carry-inventory-top')
    );
    state = await act(b, { kind: 'flip', pieceId: 'carry-inventory-top' });
    expect(state.table.pieces.find((piece) => piece.id === 'carry-inventory-top').items[0].artwork).toMatchObject({
      name: 'Card',
      front: expect.any(String),
    });

    deck.members = [];
    await act(a, { kind: 'spawn-request', type: 'deck', slug: 'deck' }, 'Add playable members');
    deck.members = [{ member: token.asset, count: 1 }];
    await act(a, { kind: 'spawn-request', type: 'deck', slug: 'deck' }, 'incompatible members');
    deck.members = [{ member: { ...card.asset, id: 'replaced-card' }, count: 1 }];
    await act(a, { kind: 'spawn-request', type: 'deck', slug: 'deck' }, 'member changed');
  });

  it('never lets the requester approve their own request, even as the last seat, and lets them spawn and dismiss', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const requested = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    const requestId = requested.controls.requests[0].id;
    expect(requested.controls.requests[0]).toMatchObject({ requesterSeat: 'harkonnen', requesterName: 'Synthetic A' });
    expect(JSON.stringify(requested.controls)).not.toContain('user-a');
    await act(b, { kind: 'phase' });
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-b',
        eventId: 'deletion-b',
        deletionOperationId: 'operation-b',
      }),
    });
    expect(response.status).toBe(200);
    await eventually(
      () => a.messages.findLast((message) => message.type === 'view')?.snapshot.controls.seats.length === 1,
      'sole seat'
    );
    await act(a, { kind: 'spawn-approve', requestId }, 'different seated player');
    const spawned = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    expect(spawned.table.pieces.filter((piece) => piece.inventory)).toHaveLength(1);
    expect(spawned.controls.requests).toHaveLength(1);
    const dismissed = await act(a, { kind: 'spawn-dismiss', requestId });
    expect(dismissed.controls.requests).toHaveLength(0);
  });

  it('refuses catalogue reads from spectators and runs one capture per connection at a time', async () => {
    const a = await admit('a');
    await admit('b');
    const observer = await admit('c');
    observer.send({ type: 'catalogue', requestId: 'browse-1' });
    const refused = await observer.message('rejected', (message) => message.requestId === 'browse-1');
    expect(refused.message).toContain('seated');
    peer.catalogueMode = 'hold';
    const before = peer.requests.length;
    a.send({ type: 'catalogue', requestId: 'capture-1', selection: { type: 'token-disc', slug: 'recovery' } });
    const held = await eventually(
      () => peer.requests.slice(before).find((request) => request.function === 'assets:getPage'),
      'held capture'
    );
    a.send({ type: 'catalogue', requestId: 'capture-2', selection: { type: 'token-disc', slug: 'recovery' } });
    const second = await a.message('rejected', (message) => message.requestId === 'capture-2');
    expect(second.message).toContain('already in flight');
    expect(peer.requests.slice(before).filter((request) => request.function === 'assets:getPage')).toHaveLength(1);
    peer.catalogueMode = 'allow';
    held.release(peer.catalogue.get('token-disc/recovery'));
    const first = await a.message('catalogue', (message) => message.requestId === 'capture-1');
    expect(first.contents.name).toBe('Recovery token');
    a.send({ type: 'catalogue', requestId: 'capture-3', selection: { type: 'token-disc', slug: 'recovery' } });
    expect((await a.message('catalogue', (message) => message.requestId === 'capture-3')).contents.name).toBe(
      'Recovery token'
    );
  });

  it('sends controls in a compact update only when they changed, without captured definitions', async () => {
    const a = await admit('a');
    await admit('b');
    a.send({ type: 'sync' });
    await a.message('view', (message) => message.sequence > 0);
    a.send({
      type: 'command',
      commandId: 'request',
      expectedRevision: 0,
      action: { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' },
    });
    const requested = await a.message('update', (message) => message.completedCommandId === 'request');
    expect(requested.snapshot.controls.requests).toHaveLength(1);
    expect(requested.snapshot.controls.requests[0].contents.definitions).toEqual([]);
    a.send({ type: 'command', commandId: 'spice', expectedRevision: 1, action: { kind: 'spice-spawn', count: 2 } });
    const spiced = await a.message('update', (message) => message.completedCommandId === 'spice');
    expect(spiced.snapshot.controls).toBeUndefined();
    expect((await runtime.audit()).at(-1).contents).toContain('"definitions":[{');
  });

  it('reads a request persisted by the previous release as unapprovable and replays it without its user id', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const requested = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    const requestId = requested.controls.requests[0].id;
    await act(b, { kind: 'phase' });
    /* The previous release named the requester by user id, in the live state and in history patches. */
    for (const table of ['current_state', 'history']) {
      await runtime.exec(`UPDATE ${table} SET data=replace(data, ?, ?)`, [
        '"requesterSeat":"harkonnen"',
        '"requester":"user-a"',
      ]);
    }
    const rows = await runtime.exec('SELECT data FROM history');
    expect(rows.some((row) => row.data.includes('"requester":"user-a"'))).toBe(true);
    await runtime.restart();
    const restoredA = await admit('a');
    const restoredB = await admit('b');
    restoredB.send({ type: 'history', step: 1 });
    const historical = await restoredB.message('history');
    expect(JSON.stringify(historical)).not.toContain('user-a');
    expect(historical.snapshot.controls.requests[0]).toMatchObject({ id: requestId, requesterSeat: null });
    expect((await snapshot(restoredB)).controls.requests[0].requesterSeat).toBeNull();
    await act(restoredA, { kind: 'spawn-approve', requestId }, 'no known requester');
    await act(restoredB, { kind: 'spawn-approve', requestId }, 'no known requester');
    expect((await act(restoredB, { kind: 'spawn-dismiss', requestId })).controls.requests).toHaveLength(0);
  });

  it('scrubs deleted attribution from live state, stored checkpoints and patches, and cold replay', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const requested = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    const ownRequest = requested.controls.requests[0].id;
    const otherRequest = (await act(b, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' })).controls
      .requests[1].id;
    await act(a, { kind: 'spice-spawn', count: 3 });
    let current = await snapshot(a);
    const stack = current.table.pieces.find((piece) => piece.stackKey === 'spice');
    a.send({
      type: 'begin',
      carryId: 'dispose',
      sourcePieceId: stack.id,
      expectedVersion: current.versions[stack.id],
      pickup: 'whole',
    });
    await a.message('carry');
    a.send({
      type: 'drop',
      commandId: 'dispose',
      carryId: 'dispose',
      position: spiceSupplySlot().position,
      orientation: 0,
    });
    const dropped = await a.message('view', (message) => message.completedCommandId === 'dispose');
    committedRevision = dropped.snapshot.revision;
    await act(b, { kind: 'spice-spawn', count: 2 });
    await act(b, { kind: 'phase' });
    const rows = await runtime.exec('SELECT * FROM history ORDER BY step');
    expect(rows[1].kind).toBe('patch');
    expect(rows[1].data).toContain('Synthetic A');
    /* A retained checkpoint can carry the same names as a phase patch. */
    const raw = JSON.parse((await runtime.exec('SELECT data FROM current_state'))[0].data);
    const checkpoint = JSON.stringify(raw);
    await runtime.exec("UPDATE history SET kind='checkpoint', data=?, bytes=? WHERE step=1", [
      checkpoint,
      Buffer.byteLength(checkpoint),
    ]);
    await waitPhase();
    await act(b, { kind: 'phase' });
    /* Keep a second patch with request and event arrays, rather than only a phase field. */
    await act(a, { kind: 'spice-spawn', count: 1 });
    await waitPhase();
    await act(b, { kind: 'phase' });
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-a',
        eventId: 'deletion-a',
        deletionOperationId: 'operation-a',
      }),
    });
    expect(response.status).toBe(200);
    async function assertScrubbed(connection) {
      current = (
        await connection.message('view', (message) =>
          message.snapshot.controls.requests.some((request) => request.requesterName === '[deleted user]')
        )
      ).snapshot;
      expect(JSON.stringify(current)).not.toContain('Synthetic A');
      expect(current.controls.requests.find((request) => request.id === ownRequest).requesterName).toBe(
        '[deleted user]'
      );
      expect(current.controls.requests.find((request) => request.id === otherRequest).requesterName).toBe(
        'Synthetic B'
      );
      for (let step = 1; step <= 3; step++) {
        connection.send({ type: 'history', step });
        const historical = (await connection.message('history', (message) => message.step === step)).snapshot;
        expect(JSON.stringify(historical)).not.toContain('Synthetic A');
        expect(historical.controls.requests.find((request) => request.id === ownRequest).requesterName).toBe(
          '[deleted user]'
        );
        expect(historical.controls.requests.find((request) => request.id === otherRequest).requesterName).toBe(
          'Synthetic B'
        );
        expect(historical.table.events.some((event) => event.message === 'Synthetic B spawned 2 spice.')).toBe(true);
      }
      const stored = await runtime.exec('SELECT data, bytes FROM history');
      expect(JSON.stringify(stored)).not.toContain('Synthetic A');
      for (const row of stored) {
        expect(row.bytes).toBe(Buffer.byteLength(row.data));
      }
      expect(JSON.stringify(await runtime.exec('SELECT data FROM current_state'))).not.toContain('Synthetic A');
    }
    await assertScrubbed(b);
    b.send({ type: 'history', step: 1 });
    const events = (await b.message('history', (message) => message.step === 1)).snapshot.table.events;
    expect(events.find((event) => event.command === 'spice.return').message).toBe(
      '[deleted user] returned 3 spice to the supply.'
    );
    expect(events.find((event) => event.command === 'spice.spawn' && event.message.endsWith('3 spice.')).message).toBe(
      '[deleted user] spawned 3 spice.'
    );
    /* A new history boundary must not reintroduce names from the pre-deletion cache. */
    await waitPhase();
    await act(b, { kind: 'phase' });
    expect(JSON.stringify(await runtime.exec('SELECT data FROM history'))).not.toContain('Synthetic A');
    await runtime.restart();
    await assertScrubbed(await admit('b'));
  }, 30_000);

  it('uses actor identity across resets and rolls back a failed history scrub', async () => {
    const a = await admit('a');
    await admit('b');
    await runtime.exec("UPDATE actors SET display_name='Synthetic A' WHERE user_id='user-b'");
    const b = await admit('b');
    const first = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    const firstId = first.controls.requests[0].id;
    const second = await act(b, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    const secondId = second.controls.requests[1].id;
    await act(a, { kind: 'spice-spawn', count: 3 });
    await act(b, { kind: 'phase' });
    await act(b, { kind: 'reset' });
    await act(b, { kind: 'spice-spawn', count: 2 });
    await act(a, { kind: 'spice-spawn', count: 1 });
    await waitPhase();
    await act(b, { kind: 'phase' });
    const beforeCurrent = await runtime.exec('SELECT data FROM current_state');
    const beforeRows = await runtime.exec('SELECT * FROM history ORDER BY step');
    const deletion = () =>
      runtime.fetch('/__play/games/fixture-game/account-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: 'fixture-game',
          secret: 'a'.repeat(64),
          userId: 'user-a',
          eventId: 'deletion-a',
          deletionOperationId: 'operation-a',
        }),
      });
    await runtime.exec(
      "CREATE TRIGGER fail_history_scrub BEFORE UPDATE ON history BEGIN SELECT RAISE(ABORT, 'Fixture scrub failure'); END"
    );
    expect((await deletion()).status).toBe(403);
    expect(await runtime.exec('SELECT * FROM history ORDER BY step')).toEqual(beforeRows);
    expect(await runtime.exec('SELECT data FROM current_state')).toEqual(beforeCurrent);
    expect((await runtime.exec("SELECT deleted FROM actors WHERE user_id='user-a'"))[0].deleted).toBe(0);
    expect(await runtime.exec("SELECT * FROM receipts WHERE actor_id='user-a'")).not.toHaveLength(0);
    expect(await runtime.exec('SELECT * FROM deletion_receipts')).toHaveLength(0);
    await runtime.exec('DROP TRIGGER fail_history_scrub');
    expect((await deletion()).status).toBe(200);
    b.send({ type: 'history', step: 3 });
    const historical = (await b.message('history')).snapshot;
    expect(historical.controls.requests.find((request) => request.id === firstId).requesterName).toBe('[deleted user]');
    expect(historical.controls.requests.find((request) => request.id === secondId).requesterName).toBe('Synthetic A');
    expect(historical.table.events.find((event) => event.message.endsWith('1 spice.')).message).toBe(
      '[deleted user] spawned 1 spice.'
    );
    expect(historical.table.events.find((event) => event.message.endsWith('2 spice.')).message).toBe(
      'Synthetic A spawned 2 spice.'
    );
    expect(historical.spiceTransfers.find((transfer) => transfer.amount === 2).actor).toBe('Synthetic A');
    const scrubbed = await runtime.exec('SELECT * FROM history ORDER BY step');
    expect((await deletion()).status).toBe(200);
    expect(await runtime.exec('SELECT * FROM history ORDER BY step')).toEqual(scrubbed);
    /* Reproduce persisted names from a deletion handled by the previous release. */
    for (const table of ['current_state', 'history']) {
      await runtime.exec(`UPDATE ${table} SET data=replace(data, '[deleted user]', 'Synthetic A')`);
    }
    await runtime.restart();
    const restored = await admit('b');
    restored.send({ type: 'history', step: 3 });
    expect((await restored.message('history')).snapshot).toEqual(historical);
  }, 30_000);

  it('retains requests after account deletion and anonymizes attribution in replay and cold recovery', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const requested = await act(a, { kind: 'spawn-request', type: 'token-disc', slug: 'recovery' });
    await act(b, { kind: 'phase' });
    const beforeDeletion = b.messages.length;
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-a',
        eventId: 'deletion-a',
        deletionOperationId: 'operation-a',
      }),
    });
    expect(response.status).toBe(200);
    const current = (
      await eventually(
        () => b.messages.slice(beforeDeletion).find((message) => message.type === 'view'),
        'deletion view'
      )
    ).snapshot;
    expect(current.controls.requests[0]).toMatchObject({
      id: requested.controls.requests[0].id,
      requesterSeat: 'harkonnen',
      requesterName: '[deleted user]',
    });
    b.send({ type: 'history', step: 1 });
    const historical = (await b.message('history')).snapshot;
    expect(historical.controls.requests[0]).toMatchObject({
      requesterSeat: 'harkonnen',
      requesterName: '[deleted user]',
    });
    expect(JSON.stringify(historical)).not.toContain('Synthetic A');
    expect((await runtime.audit())[0]).toMatchObject({ user_id: null, display_name: '[deleted user]' });
    expect(JSON.stringify(await runtime.audit())).not.toContain('user-a');
    await runtime.restart();
    const restored = await admit('b');
    restored.send({ type: 'history', step: 1 });
    expect((await restored.message('history')).snapshot.controls.requests[0].requesterName).toBe('[deleted user]');
    await act(restored, { kind: 'spawn-approve', requestId: current.controls.requests[0].id });
    expect((await snapshot(restored)).table.pieces.filter((piece) => piece.inventory)).toHaveLength(1);
  });
});
