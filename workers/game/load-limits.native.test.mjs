import { request as httpRequest } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PLAY_CONFIRMATION_RETRY_MS, PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission.ts';
import { createPeer, createRuntime, eventually, openGame, provision } from './native-runtime.fixture.mjs';

/*
 * A case that turns on a deadline moves the room's test clock past it, which fires the room's timers on the way.
 * No case waits for a deadline on the real clock.
 */
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
    const limits = {
      gameId: 'fixture-game',
      startsAt,
      expiresAt: startsAt + 60_000,
      messages: 25_000,
      incomingBytes: 8 * 1024 * 1024,
      requests: 1000,
      connections: 44,
      ...overrides,
    };
    runtime = await createRuntime(peer, 'load', { LOAD_LIMITS: JSON.stringify(limits) });
    return limits;
  }
  async function admit() {
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    peer.answer(await peer.query());
    await connection.message('view');
    return connection;
  }

  it('requires the controller secret and fixed target, then verifies stopped records after an operator stop', async () => {
    await start();
    expect((await provision(runtime)).status).toBe(200);
    const path = '/__play/games/fixture-game/load-control';
    expect((await runtime.fetch(path, { method: 'DELETE' })).status).toBe(403);
    expect((await runtime.fetch(path, { headers: { Authorization: `Bearer ${'é'.repeat(64)}` } })).status).toBe(403);
    expect((await runtime.loadControl()).stopped).toBe(null);
    const headers = { Authorization: `Bearer ${'d'.repeat(64)}` };
    expect((await runtime.fetch(path.replace('fixture-game', 'another-game'), { headers })).status).toBe(403);
    const active = await (await runtime.fetch(path, { headers })).json();
    expect(active).toMatchObject({ gameId: 'fixture-game', gitSha: 'native-test', rows: { metadata: 1 } });
    expect(active.failures).toEqual({});
    const stopped = await (await runtime.fetch(path, { method: 'DELETE', headers })).json();
    expect(stopped.stopped).toBe('operator-stop');
    expect(stopped.alarm).toBe(null);
    expect(Object.values(stopped.rows).every((count) => count === 0)).toBe(true);
  });

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
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        runtime.fetch('/__play/games/fixture-game/socket', {
          headers: { Origin: 'http://table.test', Upgrade: 'websocket' },
        })
      )
    );
    expect(responses.map((response) => response.status).sort()).toEqual([101, 101, 429, 429, 429, 429]);
    for (const response of responses) {
      response.webSocket?.accept();
    }
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
    /* A timer the stopped room still held would fire as its clock passes it, and reach the peer or arm an alarm. */
    await runtime.clock(3300);
    expect((await runtime.loadControl()).alarm).toBe(null);
    expect((await provision(runtime)).status).toBe(410);
    expect(peer.requests).toHaveLength(requests);
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

  it('leaves a room that another activation names without a budget, so its own activation still starts it', async () => {
    await start();
    const foreign = await runtime.object('another-game', '/__play/games/another-game/socket');
    expect(foreign.status).toBe(503);
    expect((await provision(runtime)).status).toBe(200);
    expect((await runtime.loadControl()).stopped).toBe(null);
  });

  it('stops a room whose budget another activation recorded, and the controller can still read and stop it', async () => {
    await start();
    expect((await provision(runtime)).status).toBe(200);
    const startsAt = Date.now();
    await runtime.restart({
      LOAD_LIMITS: JSON.stringify({
        gameId: 'fixture-game',
        startsAt,
        expiresAt: startsAt + 120_000,
        messages: 25_000,
        incomingBytes: 8 * 1024 * 1024,
        requests: 1000,
        connections: 44,
      }),
    });
    const path = '/__play/games/fixture-game/load-control';
    const headers = { Authorization: `Bearer ${'d'.repeat(64)}` };
    const status = await runtime.fetch(path, { headers });
    expect(status.status).toBe(200);
    expect((await status.json()).stopped).toBe('replaced-budget');
    const stopped = await (await runtime.fetch(path, { method: 'DELETE', headers })).json();
    expect(Object.values(stopped.rows).every((count) => count === 0)).toBe(true);
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
    const { expiresAt } = await start();
    expect((await provision(runtime)).status).toBe(200);
    const connection = await admit();
    await runtime.clock(expiresAt - Date.now());
    await eventually(() => connection.closed, 'expiry disconnect');
    const stopped = await (
      await runtime.fetch('/__play/games/fixture-game/load-control', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${'d'.repeat(64)}` },
      })
    ).json();
    expect(stopped).toMatchObject({ stopped: 'expiry', alarm: null });
    expect(Object.values(stopped.rows).every((count) => count === 0)).toBe(true);
    await runtime.restart();
    expect((await provision(runtime)).status).toBe(410);
    expect((await runtime.loadControl()).alarm).toBe(null);
  });

  /*
   * Provisions while the peer holds the confirmation, then starts an operator stop, which waits for the confirmation to settle.
   * The room's clock runs ahead, so the retry alarm the confirmation armed falls after the case on the real clock and fires only when a case forces it.
   */
  async function stopWhileConfirming() {
    await start();
    const offset = 30_000;
    const { now } = await runtime.clock(offset);
    peer.holdFirstConfirmation = true;
    const pending = provision(runtime);
    await eventually(() => peer.confirmationRequests === 1, 'held confirmation');
    const { alarm } = await runtime.loadControl();
    expect(alarm).toBeGreaterThanOrEqual(now + PLAY_CONFIRMATION_RETRY_MS);
    expect(alarm).toBeLessThanOrEqual(Date.now() + offset + PLAY_CONFIRMATION_RETRY_MS);
    const stopped = runtime.loadControl(true);
    await eventually(async () => (await runtime.loadControl()).stopped === 'operator-stop', 'stop in progress');
    /* The peer fails the held confirmation instead of the room giving up on it after the request timeout. */
    const fail = () => {
      const held = peer.requests.find((record) => record.function === 'playProvisioning:confirmProvisioning');
      held.response.writeHead(503).end('Confirmation unavailable');
    };
    return { pending, stopped, fail };
  }

  it('cleans up after an in-flight confirmation fails without leaving its retry alarm', async () => {
    const { pending, stopped, fail } = await stopWhileConfirming();
    fail();
    expect(await stopped).toMatchObject({
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

  it('sends no retry and leaves no alarm when the retry alarm fires while the stop waits for the confirmation', async () => {
    const { pending, stopped, fail } = await stopWhileConfirming();
    await runtime.alarm(true);
    await eventually(async () => (await runtime.loadControl()).alarm === null, 'retry alarm fired');
    /* The provisioning request then ends in a stopped room with no alarm, and must not arm the run's deadline again. */
    fail();
    expect(await stopped).toMatchObject({
      stopped: 'operator-stop',
      gameRows: 0,
      historyRows: 0,
      alarm: null,
    });
    await pending;
    expect(peer.confirmationRequests).toBe(1);
  });

  it('refuses an oversized HTTP body before forwarding it', async () => {
    await start();
    expect((await provision(runtime)).status).toBe(200);
    const requests = peer.requests.length;
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      body: ' '.repeat(8193),
    });
    expect(response.status).toBe(413);
    expect(peer.requests).toHaveLength(requests);
    expect(await runtime.loadControl()).toMatchObject({ stopped: null, gameRows: 1 });
    await runtime.loadControl(true);
  });

  it.each([
    { duration: 2500, status: 410, reason: 'expiry' },
    { duration: 60_000, status: 408, reason: 'operator-stop' },
  ])(
    'returns $status for an incomplete upload with $duration ms until expiry',
    async ({ duration, status, reason }) => {
      const { expiresAt } = await start({ expiresAt: Date.now() + 10 * 60_000 });
      expect((await provision(runtime)).status).toBe(200);
      const address = await runtime.url();
      /* The upload reaches the room `duration` before expiry on its clock, however long the way there took. */
      const arrival = expiresAt - duration;
      const request = httpRequest({
        hostname: address.hostname,
        port: address.port,
        path: '/__play/games/fixture-game/account-deletion',
        method: 'POST',
        headers: {
          Host: 'table.test',
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked',
          'X-Native-Test-Now': String(arrival),
        },
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
        /* The request timeout passes on the room's clock, and expiry with it when that comes first. */
        await runtime.clock(arrival + PLAY_REQUEST_TIMEOUT_MS - Date.now());
        expect(await result).toBe(status);
        expect(await runtime.loadControl(true)).toMatchObject({
          stopped: reason,
          gameRows: 0,
          historyRows: 0,
          alarm: null,
        });
      } finally {
        request.destroy();
      }
    }
  );
});
