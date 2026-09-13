import { request as httpRequest } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPeer, createRuntime, eventually, openGame, provision } from './native-runtime.fixture.mjs';

describe('isolated load limits in native workerd', () => {
  let peer;
  let runtime;
  beforeEach(async () => {
    peer = await createPeer();
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  async function start(overrides = {}) {
    const startsAt = Date.now();
    runtime = await createRuntime(peer, 'load', {
      LOAD_LIMITS: JSON.stringify({
        gameId: 'fixture-game',
        startsAt,
        expiresAt: startsAt + 60_000,
        messages: 25_000,
        incomingBytes: 8 * 1024 * 1024,
        requests: 1000,
        connections: 44,
        ...overrides,
      }),
    });
  }
  async function admit() {
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    peer.answer(await peer.query());
    await connection.message('view');
    return connection;
  }

  it('refuses another game before it reaches provisioning or consumes the fixed run budget', async () => {
    await start();
    expect((await runtime.fetch('/__play/games/another-game/provision', { method: 'POST' })).status).toBe(403);
    expect(peer.requests).toHaveLength(0);
    expect((await runtime.loadControl()).requests).toBe(0);
    expect((await provision(runtime)).status).toBe(200);
  });

  it('caps simultaneous connections before accepting an extra socket', async () => {
    await start({ connections: 2 });
    expect((await provision(runtime)).status).toBe(200);
    await openGame(runtime);
    await openGame(runtime);
    const extra = await runtime.fetch('/__play/games/fixture-game/socket', {
      headers: { Origin: 'http://table.test', Upgrade: 'websocket' },
    });
    expect(extra.status).toBe(429);
    expect((await runtime.loadControl()).connections).toBe(2);
    await runtime.loadControl(true);
  });

  it('stops at the message budget, closes authorization and removes the synthetic game data', async () => {
    await start({ messages: 3 });
    expect((await provision(runtime)).status).toBe(200);
    const connection = await admit();
    for (let seq = 0; seq < 3; seq++) {
      connection.send({ type: 'pointer', seq, position: [0, 0, 0] });
    }
    await eventually(() => connection.closed, 'budget disconnect');
    const state = await eventually(async () => {
      const state = await runtime.loadControl();
      return state.gameRows === 0 && state;
    }, 'cleanup');
    expect(state).toMatchObject({ stopped: 'messages-budget', messages: 3, gameRows: 0, historyRows: 0, alarm: null });
    const requests = peer.requests.length;
    await new Promise((resolve) => setTimeout(resolve, 3300));
    expect(peer.requests).toHaveLength(requests);
    expect((await provision(runtime)).status).toBe(410);
  });

  it('does not refund unused message reservations when the runtime restarts', async () => {
    await start({ messages: 2 });
    expect((await provision(runtime)).status).toBe(200);
    await admit();
    expect((await runtime.loadControl()).messages).toBe(2);
    await runtime.restart();
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    await eventually(() => connection.closed, 'remaining reservation exhausted');
    expect((await runtime.loadControl()).stopped).toBe('messages-budget');
  });

  it('stops on input bytes before forwarding a message that exceeds the allowance', async () => {
    await start({ incomingBytes: 200 });
    expect((await provision(runtime)).status).toBe(200);
    const connection = await admit();
    for (let seq = 0; seq < 4; seq++) {
      connection.send({ type: 'pointer', seq, position: [0, 0, 0] });
    }
    await eventually(() => connection.closed, 'byte disconnect');
    expect((await runtime.loadControl()).stopped).toBe('incomingBytes-budget');
  });

  it('retains the HTTP request budget across a restart', async () => {
    await start({ requests: 2 });
    expect((await provision(runtime)).status).toBe(200);
    await runtime.restart();
    await openGame(runtime);
    expect((await provision(runtime)).status).toBe(410);
    expect((await runtime.loadControl()).stopped).toBe('requests-budget');
  });

  it('expires without another client message and stays stopped after a restart', async () => {
    await start({ expiresAt: Date.now() + 4000 });
    expect((await provision(runtime)).status).toBe(200);
    const connection = await admit();
    await eventually(() => connection.closed, 'expiry disconnect', 6000);
    expect(await runtime.loadControl(true)).toMatchObject({
      stopped: 'expiry',
      gameRows: 0,
      historyRows: 0,
      alarm: null,
    });
    await runtime.restart();
    expect((await provision(runtime)).status).toBe(410);
    expect((await runtime.loadControl()).alarm).toBe(null);
  });

  it('cleans up after an in-flight confirmation fails without leaving its retry alarm', async () => {
    await start();
    peer.holdFirstConfirmation = true;
    const pending = provision(runtime);
    await eventually(() => peer.confirmationRequests === 1, 'held confirmation');
    expect(await runtime.loadControl(true)).toMatchObject({
      stopped: 'operator-stop',
      gameRows: 0,
      historyRows: 0,
      alarm: null,
    });
    await pending;
    await runtime.restart();
    expect((await runtime.loadControl()).alarm).toBe(null);
    expect((await provision(runtime)).status).toBe(410);
  });

  it('expires and removes game data while a chunked HTTP upload remains incomplete', async () => {
    await start({ expiresAt: Date.now() + 2500 });
    expect((await provision(runtime)).status).toBe(200);
    const address = await runtime.url();
    const request = httpRequest({
      hostname: address.hostname,
      port: address.port,
      path: '/__play/games/fixture-game/account-deletion',
      method: 'POST',
      headers: { Host: 'table.test', 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    });
    const result = new Promise((resolve, reject) => {
      request.once('response', (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.once('error', reject);
    });
    request.write('{');
    try {
      await eventually(async () => (await runtime.loadControl()).requests === 2, 'streaming request reaches room');
      expect(await result).toBe(410);
      expect(await runtime.loadControl(true)).toMatchObject({
        stopped: 'expiry',
        gameRows: 0,
        historyRows: 0,
        alarm: null,
      });
    } finally {
      request.destroy();
    }
  });
});
