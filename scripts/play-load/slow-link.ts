import assert from 'node:assert/strict';
import type { Socket } from 'node:net';
import { createConnection, createServer } from 'node:net';

type LinkSettings = { downlinkKbitPerSecond: number; roundTripMs: number };
type LinkTotals = { uplinkBytes: number; downlinkBytes: number; maxBufferedBytes: number };
type LinkState = { constrained: boolean; settings: LinkSettings; totals: LinkTotals };
class Relay {
  source: Socket;
  destination: Socket;
  downlink: boolean;
  state: LinkState;
  queue: { bytes: Buffer; due: number }[] = [];
  queuedBytes = 0;
  availableAt = 0;
  blocked = false;
  timer: NodeJS.Timeout | undefined;

  constructor(
    source: Socket,
    destination: Socket,
    { downlink, state, relays }: { downlink: boolean; state: LinkState; relays: Set<Relay> }
  ) {
    this.source = source;
    this.destination = destination;
    this.downlink = downlink;
    this.state = state;
    source.on('data', (chunk) => this.receive(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    destination.on('drain', () => {
      this.blocked = false;
      this.pump();
    });
    source.on('close', () => {
      clearTimeout(this.timer);
      relays.delete(this);
    });
  }

  due(arrival: number, byteLength: number) {
    if (!this.state.constrained) {
      return arrival;
    }
    const { settings } = this.state;
    let due = Math.max(this.availableAt, arrival + settings.roundTripMs / 2);
    if (this.downlink) {
      due += (byteLength * 8) / settings.downlinkKbitPerSecond;
    }
    return due;
  }

  receive(chunk: Buffer) {
    const arrival = performance.now();
    for (let offset = 0; offset < chunk.length; offset += 4096) {
      const bytes = chunk.subarray(offset, offset + 4096);
      this.availableAt = this.due(arrival, bytes.length);
      this.queue.push({ bytes, due: this.availableAt });
      this.queuedBytes += bytes.length;
    }
    const { totals } = this.state;
    totals.maxBufferedBytes = Math.max(totals.maxBufferedBytes, this.queuedBytes);
    if (this.queuedBytes >= 65_536) {
      this.source.pause();
    }
    this.pump();
  }

  get closed() {
    return this.source.destroyed || this.destination.destroyed;
  }

  write(bytes: Buffer) {
    this.queuedBytes -= bytes.length;
    this.state.totals[this.downlink ? 'downlinkBytes' : 'uplinkBytes'] += bytes.length;
    this.blocked = !this.destination.write(bytes);
  }

  pump() {
    clearTimeout(this.timer);
    if (this.closed || this.blocked) {
      return;
    }
    while (this.queue.length) {
      const next = this.queue[0];
      const remaining = this.state.constrained ? next.due - performance.now() : 0;
      if (remaining > 0) {
        this.timer = setTimeout(() => this.pump(), remaining);
        break;
      }
      this.queue.shift();
      this.write(next.bytes);
      if (this.blocked) {
        break;
      }
    }
    if (this.queuedBytes < 65_536 && !this.blocked) {
      this.source.resume();
    }
  }
}

/**
 * A loopback TCP proxy delays both directions and paces downlink bytes with a bounded queue.
 * It relays the stream as it is, so a TLS origin stays encrypted through it and its byte totals include the TLS framing.
 */
export async function slowLink(target: URL, settings: { downlinkKbitPerSecond: number; roundTripMs: number }) {
  const sockets = new Set<Socket>();
  const relays = new Set<Relay>();
  const totals = { uplinkBytes: 0, downlinkBytes: 0, maxBufferedBytes: 0 };
  const state = { constrained: false, settings, totals };
  const upstreamAddress = {
    host: target.hostname,
    port: Number(target.port) || (target.protocol === 'https:' ? 443 : 80),
  };
  const server = createServer((client) => {
    const upstream = createConnection(upstreamAddress);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => {
        client.destroy();
        upstream.destroy();
      });
      socket.on('close', () => {
        sockets.delete(socket);
        client.destroy();
        upstream.destroy();
      });
    }
    relays.add(new Relay(client, upstream, { downlink: false, state, relays }));
    relays.add(new Relay(upstream, client, { downlink: true, state, relays }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    upstream: upstreamAddress,
    totals,
    constrain() {
      state.constrained = true;
    },
    restore() {
      state.constrained = false;
      for (const relay of relays) {
        relay.pump();
      }
    },
    async close() {
      this.restore();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
