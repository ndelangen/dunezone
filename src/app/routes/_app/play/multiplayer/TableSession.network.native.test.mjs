import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  syncView,
} from '../../../../../../workers/game/native-runtime.fixture.mjs';
import { TableSession } from './TableSession';

const gameId = 'fixture-game';

/** A browser socket over the native runtime; `network.down` swallows frames both ways without a close, as a dead link does. */
function bridge(runtime, network) {
  return {
    openSocket() {
      let inner = null;
      const socket = {
        readyState: 0,
        bufferedAmount: 0,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send(data) {
          if (!network.down) {
            inner?.send(data);
          }
        },
        close(code = 1000) {
          if (socket.readyState === 3) {
            return;
          }
          socket.readyState = 3;
          try {
            inner?.close(code);
          } catch {}
          socket.onclose?.({ code });
        },
      };
      network.sockets.push(socket);
      runtime
        .fetch(`/__play/games/${gameId}/socket`, { headers: { Origin: runtime.origin, Upgrade: 'websocket' } })
        .then((response) => {
          if (response.status !== 101 || socket.readyState === 3) {
            socket.close(1006);
            return;
          }
          inner = response.webSocket;
          inner.accept();
          inner.addEventListener('message', (event) => {
            if (!network.down && socket.readyState === 1) {
              socket.onmessage?.({ data: event.data });
            }
          });
          inner.addEventListener('close', (event) => {
            if (socket.readyState !== 3) {
              socket.readyState = 3;
              socket.onclose?.({ code: event.code });
            }
          });
          socket.readyState = 1;
          socket.onopen?.();
        })
        .catch(() => socket.close(1006));
      return socket;
    },
    monotonicNow: () => performance.now(),
    onHidden: () => () => {},
    onOnline: () => () => {},
  };
}

describe('A table client on a bad network (#1696)', { timeout: 60_000, hookTimeout: 30_000 }, () => {
  let peer, runtime, network, client, stop;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
    peer.registrationId = 'registration-a';
    network = { down: false, sockets: [] };
    const ticket = async () => ({ ok: true, ticket: 'c'.repeat(64), expiresInMs: 600_000 });
    client = new TableSession(gameId, ticket, bridge(runtime, network));
    stop = client.connect();
    await live();
  });
  afterEach(async () => {
    stop?.();
    await runtime?.close();
    await peer?.close();
  });

  const live = (label = 'live table') =>
    eventually(
      () => {
        const view = client.getSnapshot();
        return view.status === 'authorized' && view.table ? view : null;
      },
      label,
      15_000
    );
  const revision = () => client.getSnapshot().table.snapshot.revision;
  const server = async () => {
    peer.registrationId = 'registration-b';
    const observer = await admitPlayer(peer, runtime, 'b');
    const view = await syncView(observer);
    observer.socket.close();
    peer.registrationId = 'registration-a';
    return view.snapshot;
  };

  it('recovers when the socket drops with an action in flight, applying it at most once', async () => {
    const before = revision();
    client.spawnSpice(1);
    network.sockets.at(-1).close(1006);
    await live('reconnected');
    const after = await server();
    expect(after.revision - before).toBeLessThanOrEqual(1);
    await eventually(() => revision() === after.revision, 'client caught up', 10_000);
  });

  it('recovers from a Worker restart without a reload', async () => {
    const before = revision();
    await runtime.restart();
    await live('after restart');
    client.spawnSpice(1);
    await eventually(() => revision() === before + 1, 'action after restart', 10_000);
    expect(client.getSnapshot().error).toBeNull();
  });

  it('recovers from a silent outage once frames flow again', async () => {
    network.down = true;
    client.spawnSpice(1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    network.down = false;
    network.sockets.at(-1).close(1006);
    await live('back online');
    const after = await server();
    await eventually(() => revision() === after.revision, 'client caught up', 10_000);
    expect(client.getSnapshot().error).toBeNull();
  });

  it('never doubles an action across a flapping link', async () => {
    const before = await server();
    let sent = 0;
    for (let round = 0; round < 6; round++) {
      await live('round ' + round);
      client.spawnSpice(1);
      sent++;
      await new Promise((resolve) => setTimeout(resolve, round * 15));
      network.sockets.at(-1).close(1006);
    }
    await live('settled');
    const after = await server();
    expect(after.revision - before.revision).toBeLessThanOrEqual(sent);
    await eventually(() => revision() === after.revision, 'client caught up', 10_000);
  });

  it('tells the player to pick a held piece up again after a restart', async () => {
    const piece = client
      .getSnapshot()
      .table.snapshot.table.pieces.find((candidate) => !candidate.inventory && !candidate.locked);
    client.beginGesture(piece.id, 'whole');
    await eventually(() => client.getSnapshot().table?.gestureActivePieceId === piece.id, 'carry', 5000);
    await runtime.restart();
    await live('after restart');
    await eventually(() => client.getSnapshot().table?.gestureActivePieceId === null, 'carry ended', 10_000);
    expect(client.getSnapshot().error).toBe(
      'The connection dropped while you held a piece. Pick it up again to continue.'
    );
  });
});
