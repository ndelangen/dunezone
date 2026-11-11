import { timingSafeEqual } from 'node:crypto';

import { DurableObject } from 'cloudflare:workers';

import {
  BIDDING_PING,
  BIDDING_PONG,
  BIDDING_REFUSED,
  BIDDING_REMOTE_LIMIT,
  BIDDING_REPLACED,
  biddingClientFrameSchema,
  biddingCreateSchema,
  biddingFrameFits,
  biddingPathPattern,
} from '../../src/shared/tools/biddingTransport';
import type { BiddingClientFrame, BiddingRole, BiddingServerFrame } from '../../src/shared/tools/biddingTransport';

type SavedTable = {
  tableId: string;
  centralHash: string;
  centralGeneration: number;
  centralInstanceId: string | null;
  centralProtocol?: number;
  devices: Record<string, string>;
};
type Connection = {
  connectionId: string;
  closed?: true;
  deviceId?: string;
  role?: BiddingRole;
  pendingRole?: BiddingRole;
  protocol?: number;
  tokens: number;
  updatedAt: number;
  openedAt: number;
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refreshPhone = 'Refresh this phone to use the updated bidding table.';
const sameHash = (a: string, b: string) => timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
const hash = async (secret: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');

/** The central device owns the auction. This object only admits devices, introduces peers and relays their messages. */
export class BiddingTable extends DurableObject<GameEnv> {
  private saved: SavedTable | undefined;

  constructor(ctx: DurableObjectState, env: GameEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(BIDDING_PING, BIDDING_PONG));
    void ctx.blockConcurrencyWhile(async () => {
      this.saved = await ctx.storage.get<SavedTable>('table');
    });
  }

  async create(input: unknown): Promise<Response> {
    const parsed = biddingCreateSchema.safeParse(input);
    if (!parsed.success) {
      return json({ error: 'Invalid table.' }, 400);
    }
    const centralHash = await hash(parsed.data.centralSecret);
    return await this.ctx.storage.transaction(async (storage) => {
      const current = await storage.get<SavedTable>('table');
      if (current) {
        const same = current.tableId === parsed.data.tableId && sameHash(current.centralHash, centralHash);
        return json({ created: same }, same ? 200 : 409);
      }
      const saved: SavedTable = {
        tableId: parsed.data.tableId,
        centralHash,
        centralGeneration: 0,
        centralInstanceId: null,
        devices: {},
      };
      await storage.put('table', saved);
      this.saved = saved;
      return json({ created: true }, 201);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (
      request.method !== 'GET' ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
      request.headers.get('Origin') !== this.env.APPLICATION_ORIGIN
    ) {
      return json({ error: 'WebSocket required.' }, 400);
    }
    return await this.openSocket();
  }

  private async openSocket(): Promise<Response> {
    if (!this.saved) {
      return json({ error: 'Table not found.' }, 404);
    }
    const sockets = this.sockets();
    if (sockets.length >= BIDDING_REMOTE_LIMIT + 8) {
      return json({ error: 'Table is busy.' }, 429);
    }
    const [client, socket] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(socket);
    socket.serializeAttachment({
      connectionId: crypto.randomUUID(),
      tokens: 30,
      updatedAt: Date.now(),
      openedAt: Date.now(),
    } satisfies Connection);
    const deadline = Date.now() + 10_000;
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || alarm > deadline) {
      await this.ctx.storage.setAlarm(deadline);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private sockets() {
    return this.ctx.getWebSockets().filter((socket) => !this.connection(socket).closed);
  }
  private connection(socket: WebSocket): Connection {
    return socket.deserializeAttachment() as Connection;
  }
  private markClosed(socket: WebSocket) {
    socket.serializeAttachment({ ...this.connection(socket), closed: true } satisfies Connection);
  }
  private send(socket: WebSocket, frame: BiddingServerFrame) {
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      this.markClosed(socket);
    }
  }
  private close(socket: WebSocket, code: number, reason: string) {
    this.markClosed(socket);
    socket.close(code, reason);
  }
  private presence(welcome?: WebSocket, changedRole?: BiddingRole) {
    if (!this.saved) {
      return;
    }
    const members = this.sockets()
      .map((socket) => ({ socket, ...this.connection(socket) }))
      .filter((member) => member.role);
    const central = members.find((member) => member.role === 'central');
    const remotes = members
      .filter((member) => member.role === 'remote')
      .map((member) => ({ deviceId: member.deviceId!, connectionId: member.connectionId }));
    for (const member of members) {
      if (changedRole === 'remote' && member.role !== 'central' && member.socket !== welcome) {
        continue;
      }
      this.send(member.socket, {
        type: member.socket === welcome ? 'welcome' : 'presence',
        tableId: this.saved.tableId,
        connectionId: member.connectionId,
        centralConnectionId: central?.connectionId ?? null,
        remotes: member.role === 'central' ? remotes : [],
      });
    }
  }

  private async join(socket: WebSocket, connection: Connection, frame: Extract<BiddingClientFrame, { type: 'join' }>) {
    const saved = this.saved;
    if (!saved || connection.role || connection.pendingRole || (frame.tableId && frame.tableId !== saved.tableId)) {
      this.close(socket, BIDDING_REFUSED, 'Table identity changed.');
      return;
    }
    connection.pendingRole = frame.role;
    connection.deviceId = frame.device.id;
    const protocol = frame.protocol ?? 1;
    connection.protocol = protocol;
    socket.serializeAttachment(connection);
    const digest = await hash(frame.role === 'central' ? (frame.centralSecret ?? '') : frame.device.secret);
    if (this.connection(socket).closed) {
      return;
    }
    if (frame.role === 'central') {
      if (
        frame.tableId !== saved.tableId ||
        !sameHash(digest, saved.centralHash) ||
        !frame.centralInstanceId ||
        !frame.generation
      ) {
        this.close(socket, BIDDING_REFUSED, 'Central access refused.');
        return;
      }
      const generation = frame.generation;
      const instance = frame.centralInstanceId;
      const accepted = await this.ctx.storage.transaction(async (storage) => {
        const current = await storage.get<SavedTable>('table');
        if (
          !current ||
          generation < current.centralGeneration ||
          (generation === current.centralGeneration &&
            (instance !== current.centralInstanceId || protocol < (current.centralProtocol ?? 1)))
        ) {
          return false;
        }
        if (generation > current.centralGeneration || protocol > (current.centralProtocol ?? 1)) {
          const next = {
            ...current,
            centralGeneration: generation,
            centralInstanceId: instance,
            centralProtocol: protocol,
          };
          await storage.put('table', next);
          this.saved = next;
        }
        return true;
      });
      const current = await this.ctx.storage.get<SavedTable>('table');
      if (
        !accepted ||
        current?.centralGeneration !== generation ||
        current.centralInstanceId !== instance ||
        (current.centralProtocol ?? 1) !== protocol
      ) {
        this.close(socket, BIDDING_REPLACED, 'A newer central device already connected.');
        return;
      }
    } else {
      const allowed = await this.ctx.storage.transaction(async (storage) => {
        const current = await storage.get<SavedTable>('table');
        if (!current) {
          return false;
        }
        if (protocol < (current.centralProtocol ?? 1)) {
          return 'outdated';
        }
        const previous = current.devices[frame.device.id];
        if (previous && !sameHash(previous, digest)) {
          return false;
        }
        const remotes = this.sockets()
          .map((s) => this.connection(s))
          .filter((c) => (c.role === 'remote' || c.pendingRole === 'remote') && c.deviceId !== frame.device.id);
        if (remotes.length >= BIDDING_REMOTE_LIMIT || (!previous && Object.keys(current.devices).length >= 128)) {
          return false;
        }
        if (!previous) {
          const next = { ...current, devices: { ...current.devices, [frame.device.id]: digest } };
          await storage.put('table', next);
          this.saved = next;
        }
        return true;
      });
      if (allowed === 'outdated') {
        this.close(socket, BIDDING_REFUSED, refreshPhone);
        return;
      }
      if (!allowed) {
        this.close(socket, BIDDING_REFUSED, 'Remote access refused or table full.');
        return;
      }
    }
    if (this.connection(socket).closed) {
      return;
    }
    for (const other of this.sockets()) {
      const member = this.connection(other);
      if (
        frame.role === 'central' &&
        (member.role ?? member.pendingRole) === 'remote' &&
        (member.protocol ?? 1) < protocol
      ) {
        this.close(other, BIDDING_REFUSED, refreshPhone);
        continue;
      }
      if (
        other !== socket &&
        member.role === frame.role &&
        (frame.role === 'central' || member.deviceId === frame.device.id)
      ) {
        this.close(other, BIDDING_REPLACED, 'This device connected elsewhere.');
      }
    }
    connection.tokens = frame.role === 'central' ? BIDDING_REMOTE_LIMIT * 8 : 30;
    delete connection.pendingRole;
    socket.serializeAttachment({ ...connection, deviceId: frame.device.id, role: frame.role });
    this.presence(socket, frame.role);
  }

  async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    if (this.connection(socket).closed) {
      return;
    }
    const connection = this.connection(socket);
    if (typeof input !== 'string' || !biddingFrameFits(input)) {
      this.close(socket, 1009, 'Message too large.');
      this.presence();
      return;
    }
    const now = Date.now();
    const burst = connection.role === 'central' ? BIDDING_REMOTE_LIMIT * 8 : 30;
    const perSecond = connection.role === 'central' ? BIDDING_REMOTE_LIMIT * 2 : 10;
    connection.tokens = Math.min(burst, connection.tokens + ((now - connection.updatedAt) / 1000) * perSecond);
    connection.updatedAt = now;
    if (connection.tokens < 1) {
      this.close(socket, BIDDING_REFUSED, 'Too many messages.');
      this.presence();
      return;
    }
    connection.tokens--;
    socket.serializeAttachment(connection);
    let frame: BiddingClientFrame;
    try {
      frame = biddingClientFrameSchema.parse(JSON.parse(input));
    } catch {
      this.close(socket, BIDDING_REFUSED, 'Invalid message.');
      this.presence();
      return;
    }
    if (frame.type === 'join') {
      await this.join(socket, connection, frame);
      return;
    }
    if (!connection.role || !connection.deviceId) {
      this.close(socket, BIDDING_REFUSED, 'Join first.');
      return;
    }
    if (
      (connection.role === 'remote' && frame.to !== 'central') ||
      (connection.role === 'central' && frame.to === 'central')
    ) {
      this.close(socket, BIDDING_REFUSED, 'Invalid recipient.');
      this.presence();
      return;
    }
    const forwarded: BiddingServerFrame = {
      type: 'relay',
      from: connection.role === 'central' ? 'central' : connection.deviceId,
      connectionId: connection.connectionId,
      packet: frame.packet,
    };
    const encoded = JSON.stringify(forwarded);
    if (!biddingFrameFits(encoded)) {
      this.close(socket, 1009, 'Message too large.');
      this.presence();
      return;
    }
    for (const other of this.sockets()) {
      const target = this.connection(other);
      const matches =
        connection.role === 'remote'
          ? target.role === 'central'
          : target.role === 'remote' &&
            (frame.to === 'remotes' ||
              frame.to === target.deviceId ||
              (Array.isArray(frame.to) && frame.to.includes(target.deviceId!)));
      if (matches) {
        try {
          other.send(encoded);
        } catch {
          this.markClosed(other);
        }
      }
    }
  }
  async alarm() {
    let next: number | undefined;
    for (const socket of this.sockets()) {
      const connection = this.connection(socket);
      if (connection.role) {
        continue;
      }
      const deadline = connection.openedAt + 10_000;
      if (deadline <= Date.now()) {
        this.close(socket, BIDDING_REFUSED, 'Join timed out.');
      } else {
        next = Math.min(next ?? deadline, deadline);
      }
    }
    if (next !== undefined) {
      await this.ctx.storage.setAlarm(next);
    }
  }
  webSocketClose(socket: WebSocket) {
    this.markClosed(socket);
    this.presence(undefined, this.connection(socket).role);
  }
  webSocketError(socket: WebSocket) {
    this.close(socket, 1011, 'Connection error.');
    this.presence();
  }
}

/** Checks public requests before they can create or open a table object. */
export async function biddingTableResponse(
  request: Request,
  env: Pick<GameEnv, 'BIDDING_TABLES' | 'APPLICATION_ORIGIN'>
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = biddingPathPattern.exec(url.pathname);
  if (!path) {
    return undefined;
  }
  if (url.origin !== env.APPLICATION_ORIGIN || url.search || request.headers.get('Origin') !== env.APPLICATION_ORIGIN) {
    return json({ error: 'Request refused.' }, 403);
  }
  const table = env.BIDDING_TABLES.getByName(path[1]!);
  if (path[2] === 'socket') {
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket required.' }, 400);
    }
    return await table.fetch(request);
  }
  if (request.method !== 'POST' || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return json({ error: 'JSON required.' }, 400);
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return json({ error: 'Table required.' }, 400);
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    bytes += result.value.byteLength;
    if (bytes > 512) {
      await reader.cancel();
      return json({ error: 'Request too large.' }, 413);
    }
    chunks.push(result.value);
  }
  const body = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: 'Invalid table.' }, 400);
  }
  return await table.create(input);
}
