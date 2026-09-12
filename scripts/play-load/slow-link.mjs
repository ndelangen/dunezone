import { createConnection, createServer } from 'node:net';

/** A loopback TCP proxy delays both directions and paces downlink bytes with a bounded queue. */
export async function slowLink(target, settings) {
  const sockets = new Set();
  const relays = new Set();
  const totals = { uplinkBytes: 0, downlinkBytes: 0, maxBufferedBytes: 0 };
  let constrained = false;
  const relay = (source, destination, downlink) => {
    const queue = [];
    let queuedBytes = 0;
    let availableAt = 0;
    let blocked = false;
    let timer;
    const pump = () => {
      clearTimeout(timer);
      if (source.destroyed || destination.destroyed || blocked) {
        return;
      }
      while (queue.length) {
        const next = queue[0];
        const remaining = constrained ? next.due - performance.now() : 0;
        if (remaining > 0) {
          timer = setTimeout(pump, remaining);
          break;
        }
        queue.shift();
        queuedBytes -= next.bytes.length;
        totals[downlink ? 'downlinkBytes' : 'uplinkBytes'] += next.bytes.length;
        if (!destination.write(next.bytes)) {
          blocked = true;
          break;
        }
      }
      if (queuedBytes < 65_536 && !blocked) {
        source.resume();
      }
    };
    source.on('data', (chunk) => {
      const arrival = performance.now();
      for (let offset = 0; offset < chunk.length; offset += 4096) {
        const bytes = chunk.subarray(offset, offset + 4096);
        availableAt = constrained
          ? Math.max(availableAt, arrival + settings.roundTripMs / 2) +
            (downlink ? (bytes.length * 8) / settings.downlinkKbitPerSecond : 0)
          : arrival;
        queue.push({ bytes, due: availableAt });
        queuedBytes += bytes.length;
      }
      totals.maxBufferedBytes = Math.max(totals.maxBufferedBytes, queuedBytes);
      if (queuedBytes >= 65_536) {
        source.pause();
      }
      pump();
    });
    destination.on('drain', () => {
      blocked = false;
      pump();
    });
    source.on('close', () => {
      clearTimeout(timer);
      relays.delete(pump);
    });
    relays.add(pump);
  };
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
    relay(client, upstream, false);
    relay(upstream, client, true);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    totals,
    constrain() {
      constrained = true;
    },
    restore() {
      constrained = false;
      for (const pump of relays) {
        pump();
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
