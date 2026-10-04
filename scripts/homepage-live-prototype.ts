/* Local-only throwaway shared room. Member roles are simulated, not authentication. State dies with this process. */
import { demoPieces } from '../src/app/routes/_app/homepage-live-prototype/fixture';
import { restingPositionAt } from '../src/shared/play/tableGeometry';

let pieces = demoPieces();
const clients = new Set<any>();
const held = new Map<string, string>();
let revision = 0;
let resetAt = Date.now() + 5 * 60_000;
const colors = ['#66d1cf', '#ecac69', '#d09bff', '#b8dc83'];
function send(ws: any, message: unknown) {
  ws.send(JSON.stringify(message));
}
function frame() {
  return { type: 'state', pieces, held: [...held], revision, resetAt, visitors: clients.size };
}
function broadcast(message: unknown) {
  for (const ws of clients) send(ws, message);
}
function reset() {
  pieces = demoPieces();
  held.clear();
  revision++;
  resetAt = Date.now() + 5 * 60_000;
  broadcast(frame());
}
function presence() {
  broadcast({
    type: 'pointers',
    pointers: [...clients]
      .filter((ws) => ws.data.role === 'member' && ws.data.position)
      .map((ws) => ({
        connectionId: ws.data.id,
        viewerSeat: ws.data.id,
        displayName: ws.data.name,
        color: ws.data.color,
        position: ws.data.position,
        updatedAt: Date.now(),
      })),
  });
}
const server = Bun.serve<any>({
  hostname: '127.0.0.1',
  port: 3018,
  fetch(req: Request, server: any) {
    const url = new URL(req.url);
    if (
      server.upgrade(req, {
        data: {
          id: crypto.randomUUID(),
          name: url.searchParams.get('name')?.slice(0, 24) || 'Visitor',
          role: url.searchParams.get('role') === 'member' ? 'member' : 'guest',
          color: colors[clients.size % colors.length],
          position: null,
        },
      })
    )
      return;
    return Response.json(frame());
  },
  websocket: {
    open(ws: any) {
      clients.add(ws);
      send(ws, { type: 'hello', id: ws.data.id });
      broadcast(frame());
    },
    message(ws: any, raw: any) {
      let m;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (ws.data.role !== 'member') {
        send(ws, { type: 'denied', reason: 'Guests watch the shared table.' });
        return;
      }
      if (m.type === 'pointer') {
        ws.data.position = m.position;
        presence();
        return;
      }
      if (m.type === 'reset') {
        reset();
        return;
      }
      const piece = pieces.find((p) => p.id === m.id);
      if (!piece) return;
      if (m.type === 'begin') {
        if (held.has(m.id) && held.get(m.id) !== ws.data.id) {
          send(ws, { type: 'denied', reason: 'Someone else is holding that piece.' });
          return;
        }
        held.set(m.id, ws.data.id);
        broadcast(frame());
        return;
      }
      if (held.get(m.id) !== ws.data.id) return;
      if (m.type === 'move' || m.type === 'drop') {
        if (!Array.isArray(m.position) || m.position.length !== 3 || !m.position.every(Number.isFinite)) return;
        const position: [number, number, number] = [
          Math.max(-5, Math.min(5, m.position[0])),
          0.38,
          Math.max(-4.3, Math.min(4.3, m.position[2])),
        ];
        pieces = pieces.map((p) =>
          p.id === m.id ? { ...p, position: m.type === 'drop' ? restingPositionAt(position, p) : position } : p
        );
        if (m.type === 'drop') held.delete(m.id);
        revision++;
        broadcast(frame());
      }
      if (m.type === 'cancel') {
        held.delete(m.id);
        broadcast(frame());
      }
    },
    close(ws: any) {
      clients.delete(ws);
      for (const [id, owner] of held) if (owner === ws.data.id) held.delete(id);
      broadcast(frame());
      presence();
    },
  },
});
setInterval(() => {
  if (Date.now() > resetAt) reset();
}, 1000);
console.log('Prototype room on 3018; homepage on http://localhost:3017/?liveDemo=1');
const app = Bun.spawn(['bunx', 'vite', '--host', '127.0.0.1', '--port', '3017'], {
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, VITE_CONVEX_URL: 'https://exuberant-finch-263.eu-west-1.convex.cloud' },
});
process.on('SIGINT', () => {
  app.kill();
  server.stop();
  process.exit(0);
});
await app.exited;
