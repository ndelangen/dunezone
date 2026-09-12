import { createConnection, createServer } from 'node:net';

class Relay {
  queue = [];
  queuedBytes = 0;
  availableAt = 0;
  blocked = false;
  timer;

  constructor(source, destination, downlink, state, relays) {
    Object.assign(this, { source, destination, downlink, state });
    source.on('data', (chunk) => this.receive(chunk));
    destination.on('drain', () => {
      this.blocked = false;
      this.pump();
    });
    source.on('close', () => {
      clearTimeout(this.timer);
      relays.delete(this);
    });
    relays.add(this);
  }

  due(arrival, byteLength) {
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

  receive(chunk) {
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

  write(bytes) {
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

/** A loopback TCP proxy delays both directions and paces downlink bytes with a bounded queue. */
export async function slowLink(target, settings) {
  const sockets = new Set();
  const relays = new Set();
  const totals = { uplinkBytes: 0, downlinkBytes: 0, maxBufferedBytes: 0 };
  const state = { constrained: false, settings, totals };
  const server = createServer((client) => {
    const upstream = createConnection({ host: target.hostname, port: Number(target.port) });
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
    new Relay(client, upstream, false, state, relays);
    new Relay(upstream, client, true, state, relays);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
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
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
