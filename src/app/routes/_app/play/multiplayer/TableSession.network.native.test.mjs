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

const CLOSED = 3;

/** A browser socket that `network.down` cuts off both ways without a close, as a dead link does. */
class BridgeSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;
  inner = null;

  constructor(network) {
    this.network = network;
  }

  send(data) {
    if (!this.network.down) {
      this.inner?.send(data);
    }
  }

  close(code = 1000) {
    if (this.readyState === CLOSED) {
      return;
    }
    this.closed(code);
    /* The Worker sees the drop too; 1006 is reserved for the browser to report, so it closes as a normal close. */
    if (this.inner?.readyState === 1) {
      this.inner.close(code === 1006 ? 1000 : code);
    }
  }

  closed(code) {
    if (this.readyState !== CLOSED) {
      this.readyState = CLOSED;
      this.onclose?.({ code });
    }
  }

  attach(inner) {
    this.inner = inner;
    inner.accept();
    inner.addEventListener('message', (event) => {
      if (!this.network.down && this.readyState === 1) {
        this.onmessage?.({ data: event.data });
      }
    });
    inner.addEventListener('close', (event) => this.closed(event.code));
    this.readyState = 1;
    this.onopen?.();
  }
}

/** A game runtime whose sockets reach the native Worker through the bridge. */
function bridge(runtime, network) {
  const connect = async (socket) => {
    const response = await runtime.fetch(`/__play/games/${gameId}/socket`, {
      headers: { Origin: runtime.origin, Upgrade: 'websocket' },
    });
    if (response.status === 101 && socket.readyState !== CLOSED) {
      socket.attach(response.webSocket);
    } else {
      socket.close(1006);
    }
  };
  return {
    openSocket() {
      const socket = new BridgeSocket(network);
      network.sockets.push(socket);
      connect(socket).catch(() => socket.close(1006));
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

  /* Waits for the client to see the restart, so the next live table is the reconnected one. */
  const restart = async () => {
    const opened = network.sockets.length;
    await runtime.restart();
    await eventually(() => network.sockets.length > opened, 'reconnect attempt', 15_000);
  };
  const live = (label = 'live table') =>
    eventually(
      () => {
        const view = client.getSnapshot();
        return view.status === 'authorized' && view.table ? view : null;
      },
      label,
      15_000
    );
  const revision = () => client.getSnapshot().table?.snapshot.revision;
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
    await restart();
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
    await restart();
    await live('after restart');
    await eventually(() => client.getSnapshot().table?.gestureActivePieceId === null, 'carry ended', 10_000);
    expect(client.getSnapshot().error).toBe('The table paused while you held a piece. Pick it up again to continue.');
  });
});
