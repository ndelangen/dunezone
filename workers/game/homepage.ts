import { DurableObject } from 'cloudflare:workers';

import { api } from '../../convex/_generated/api';
import {
  HOMEPAGE_CONNECTION_LIMIT,
  HOMEPAGE_EDITOR_LIMIT,
  HOMEPAGE_FRAME_LIMIT,
  HOMEPAGE_RESET_MS,
  homepageAdmissionSchema,
  homepageMessageSchema,
} from '../../src/shared/homepage/protocol';
import type { HomepageAction } from '../../src/shared/homepage/protocol';
import { homepageSnapshot } from '../../src/shared/homepage/setup';
import { gameSnapshotSchema, KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol';
import type { ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { gameHttpClient } from './authorization';
import { RoomDelivery } from './delivery';
import { Room } from './room';
import { storedSnapshotSchema } from './state';
import type { StoredSnapshot } from './state';

type Connection = {
  viewer: Viewer;
  userKey?: string;
  leaseUntil: number;
  generation: number;
  messages: number;
  windowAt: number;
  authenticating: boolean;
  controlTokens: number;
  controlUpdatedAt: number;
};
type Saved = { resetAt: number; snapshot: StoredSnapshot };
type Admission = ReturnType<typeof homepageAdmissionSchema.parse>;
type Settlement = Extract<HomepageAction, { type: 'drop' | 'command' }>;
type Gesture = Exclude<HomepageAction, Settlement>;
const COLORS = ['#d7b65c', '#73bb9d', '#7fa8e8', '#d89481', '#c2a0e1', '#9fc774'];

/* One public table, with private games' physical rules and its own admission and hourly lifetime. */
export class HomepageRoom extends DurableObject<GameEnv> {
  private room!: Room;
  private resetAt = 0;
  private scheduledAlarm = 0;
  private delivery = new RoomDelivery();
  private activityTimer?: ReturnType<typeof setTimeout>;
  private readonly connections = new Map<WebSocket, Connection>();

  constructor(ctx: DurableObjectState, env: GameEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_PING, KEEPALIVE_PONG));
    /* The Durable Object runtime gates incoming events on this promise and resets the object if it rejects. */
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Saved>('table');
      const parsed = saved && storedSnapshotSchema.safeParse(saved.snapshot);
      this.resetAt = saved?.resetAt ?? 0;
      this.room = new Room(parsed?.success ? parsed.data : homepageSnapshot(env.APPLICATION_ORIGIN), () => []);
      for (const socket of ctx.getWebSockets()) {
        const connection: Connection = socket.deserializeAttachment();
        connection.authenticating = false;
        connection.controlTokens ??= 8;
        connection.controlUpdatedAt ??= Date.now();
        this.connections.set(socket, connection);
      }
      await this.refresh();
      /* Hibernation keeps settled pieces. A new epoch tells clients to forget old gestures and patch baselines. */
      this.broadcast();
    });
  }

  async fetch(_request: Request) {
    await this.refresh();
    if (this.connections.size >= HOMEPAGE_CONNECTION_LIMIT) {
      return new Response('Table busy.', { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, socket] = Object.values(pair);
    const id = crypto.randomUUID();
    const connection: Connection = {
      viewer: {
        connectionId: id,
        userId: id,
        viewerSeat: SPECTATOR_SEAT,
        displayName: '',
        color: COLORS[this.connections.size % COLORS.length]!,
      },
      leaseUntil: 0,
      generation: 0,
      messages: 0,
      windowAt: Date.now(),
      authenticating: false,
      controlTokens: 8,
      controlUpdatedAt: Date.now(),
    };
    this.ctx.acceptWebSocket(socket);
    this.connections.set(socket, connection);
    this.saveConnection(socket, connection);
    this.sendView(socket, connection);
    return new Response(null, { status: 101, webSocket: client });
  }

  private saveConnection(socket: WebSocket, connection: Connection) {
    socket.serializeAttachment(connection);
  }

  private send(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify({ ...message, serverNow: Date.now() }));
    } catch {
      this.disconnected(socket);
    }
  }

  private frame() {
    return {
      epoch: this.room.epoch,
      snapshot: gameSnapshotSchema.parse(this.room.snapshot),
      carries: this.room.publicCarries(),
      pointers: [...this.room.pointers.values()],
    };
  }

  private sendView(socket: WebSocket, connection: Connection) {
    this.send(socket, this.delivery.view(socket, connection.viewer, this.frame()));
  }

  private broadcast(completed?: { socket: WebSocket; commandId: string }) {
    const frame = this.frame();
    for (const [socket, connection] of this.connections) {
      this.send(
        socket,
        this.delivery.update(
          socket,
          connection.viewer,
          frame,
          completed?.socket === socket ? completed.commandId : undefined
        )
      );
    }
    this.watchActivity();
  }

  private watchActivity() {
    if (this.activityTimer) {
      return;
    }
    if (!this.room.carries.size && !this.room.pointers.size) {
      return;
    }
    this.activityTimer = setTimeout(() => {
      this.activityTimer = undefined;
      if (this.room.sweep()) {
        this.broadcast();
      }
      this.watchActivity();
    }, 1000);
  }

  private makeAnonymous(socket: WebSocket, connection: Connection) {
    const changed = connection.viewer.viewerSeat !== SPECTATOR_SEAT;
    connection.generation++;
    connection.userKey = undefined;
    connection.leaseUntil = 0;
    connection.viewer = { ...connection.viewer, viewerSeat: SPECTATOR_SEAT, avatarUrl: undefined };
    this.room.clearActivity(connection.viewer.connectionId);
    this.saveConnection(socket, connection);
    return changed;
  }

  private async refresh() {
    const now = Date.now();
    if (this.resetAt <= now) {
      const snapshot = storedSnapshotSchema.parse(homepageSnapshot(this.env.APPLICATION_ORIGIN));
      const resetAt = (Math.floor(now / HOMEPAGE_RESET_MS) + 1) * HOMEPAGE_RESET_MS;
      await this.ctx.storage.put<Saved>('table', { resetAt, snapshot });
      this.resetAt = resetAt;
      this.room = new Room(snapshot, () => []);
      this.delivery = new RoomDelivery();
      this.broadcast();
    }
    let changed = false;
    for (const [socket, connection] of this.connections) {
      if (connection.leaseUntil && connection.leaseUntil <= now) {
        this.makeAnonymous(socket, connection);
        changed = true;
      }
    }
    if (changed) {
      this.broadcast();
    }
    await this.scheduleAlarm();
  }

  private async scheduleAlarm() {
    const leases = [...this.connections.values()]
      .map((connection) => connection.leaseUntil)
      .filter((time) => time > Date.now());
    const next = Math.min(this.resetAt, ...leases);
    if (next !== this.scheduledAlarm) {
      await this.ctx.storage.setAlarm(next);
      this.scheduledAlarm = next;
    }
  }

  async alarm() {
    this.scheduledAlarm = 0;
    await this.refresh();
  }

  private async authenticate(socket: WebSocket, connection: Connection, ticket: string) {
    if (!this.allowControl(socket, connection)) {
      return;
    }
    if (connection.authenticating) {
      return;
    }
    connection.authenticating = true;
    const generation = ++connection.generation;
    try {
      const admission = homepageAdmissionSchema.parse(
        await gameHttpClient(this.env.CONVEX_URL).mutation(api.homepageAdmission.redeemTicket, { ticket })
      );
      if (this.connections.get(socket) !== connection || generation !== connection.generation) {
        return;
      }
      const changed = this.applyAdmission(socket, connection, admission);
      this.sendView(socket, connection);
      if (changed) {
        this.broadcast();
      }
      await this.scheduleAlarm();
    } catch {
      /* An unavailable admission service grants no new lease. An existing lease still ends at its original deadline. */
    } finally {
      connection.authenticating = false;
      if (this.connections.has(socket)) {
        this.saveConnection(socket, connection);
      }
    }
  }

  private applyAdmission(socket: WebSocket, connection: Connection, admission: Admission) {
    if (!admission.allowed) {
      return this.makeAnonymous(socket, connection);
    }
    const editors = [...this.connections.values()].filter(
      (other) => other.leaseUntil > Date.now() && other !== connection
    );
    if (admission.leaseUntil <= Date.now() || editors.length >= HOMEPAGE_EDITOR_LIMIT) {
      return this.makeAnonymous(socket, connection);
    }
    const changed = Boolean(connection.userKey && connection.userKey !== admission.userKey);
    if (changed) {
      this.room.clearActivity(connection.viewer.connectionId);
    }
    connection.userKey = admission.userKey;
    connection.leaseUntil = admission.leaseUntil;
    connection.viewer = {
      ...connection.viewer,
      viewerSeat: connection.viewer.connectionId,
      avatarUrl: admission.avatarUrl ?? null,
    };
    this.saveConnection(socket, connection);
    return changed;
  }

  /* Full views and admission calls have a separate budget from smooth pointer and carry motion. */
  private allowControl(socket: WebSocket, connection: Connection) {
    const now = Date.now();
    connection.controlTokens = Math.min(8, connection.controlTokens + (now - connection.controlUpdatedAt) / 1000);
    connection.controlUpdatedAt = now;
    if (connection.controlTokens < 1) {
      socket.close(1008, 'Too many control messages.');
      this.disconnected(socket);
      return false;
    }
    connection.controlTokens--;
    this.saveConnection(socket, connection);
    return true;
  }

  private readMessage(socket: WebSocket, connection: Connection, input: string | ArrayBuffer) {
    if (typeof input !== 'string' || input.length > HOMEPAGE_FRAME_LIMIT) {
      socket.close(1009, 'Message too large.');
      this.disconnected(socket);
      return;
    }
    if (!this.allowMessage(socket, connection)) {
      return;
    }
    try {
      const parsed = homepageMessageSchema.safeParse(JSON.parse(input));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return;
    }
  }

  private allowMessage(socket: WebSocket, connection: Connection) {
    const now = Date.now();
    if (now - connection.windowAt >= 1000) {
      connection.messages = 0;
      connection.windowAt = now;
    }
    if (++connection.messages > 80) {
      socket.close(1008, 'Too many messages.');
      this.disconnected(socket);
      return false;
    }
    this.saveConnection(socket, connection);
    return true;
  }

  async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    const message = this.readMessage(socket, connection, input);
    if (!message) {
      return;
    }
    await this.refresh();
    switch (message.type) {
      case 'authenticate':
        await this.authenticate(socket, connection, message.ticket);
        return;
      case 'anonymous':
        if (this.makeAnonymous(socket, connection)) {
          this.broadcast();
        }
        return;
      case 'sync':
        this.resync(socket, connection);
        return;
      case 'act':
        await this.authorizedAction(socket, connection, message.epoch, message.message);
    }
  }

  private resync(socket: WebSocket, connection: Connection) {
    if (this.allowControl(socket, connection)) {
      this.sendView(socket, connection);
    }
  }

  private async authorizedAction(socket: WebSocket, connection: Connection, epoch: string, action: HomepageAction) {
    try {
      if (epoch !== this.room.epoch) {
        throw new GameRejection('The table reset. Pick the piece up again.');
      }
      if (connection.leaseUntil <= Date.now()) {
        throw new GameRejection('Sign in to handle the table.');
      }
      await this.act(socket, connection.viewer, action);
    } catch (error) {
      this.rejectAction(socket, connection, action, error);
    }
  }

  private rejectAction(socket: WebSocket, connection: Connection, action: HomepageAction, error: unknown) {
    if (!(error instanceof GameRejection)) {
      throw error;
    }
    const requestId = actionRequestId(action);
    if (requestId) {
      this.send(socket, { type: 'rejected', requestId, message: error.message });
    }
    this.resync(socket, connection);
  }

  private async act(socket: WebSocket, viewer: Viewer, message: HomepageAction) {
    if (message.type === 'drop' || message.type === 'command') {
      await this.settle(socket, viewer, message);
      return;
    }
    this.gesture(socket, viewer, message);
    this.broadcast();
  }

  private async settle(socket: WebSocket, viewer: Viewer, message: Settlement) {
    const next =
      message.type === 'drop'
        ? this.room.drop(viewer, message.carryId, message.position, message.orientation)
        : this.room.command(viewer, message.action, message.expectedRevision);
    await this.ctx.storage.put<Saved>('table', { resetAt: this.resetAt, snapshot: next });
    this.room.accept(next, message.type === 'drop' ? message.carryId : undefined);
    this.broadcast({ socket, commandId: message.commandId });
  }

  private gesture(socket: WebSocket, viewer: Viewer, message: Gesture) {
    switch (message.type) {
      case 'begin':
        this.send(socket, { type: 'carry', carryId: message.carryId, draft: this.room.begin(viewer, message) });
        break;
      case 'take':
        this.send(socket, { type: 'carry', carryId: message.carryId, draft: this.room.take(viewer, message) });
        break;
      case 'pose':
        this.room.pose(viewer, message);
        break;
      case 'pointer':
        this.room.pointer(viewer, message.position, Date.now(), message.seq);
        break;
      case 'cancel':
        this.room.cancel(viewer, message.carryId);
        break;
      case 'renew':
        this.room.renew(viewer, message.carryId);
        break;
    }
  }

  private disconnected(socket: WebSocket) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    this.connections.delete(socket);
    this.room.disconnect(connection.viewer.connectionId);
    this.broadcast();
  }

  webSocketClose(socket: WebSocket) {
    this.disconnected(socket);
  }
  webSocketError(socket: WebSocket) {
    this.disconnected(socket);
  }
}

function actionRequestId(action: HomepageAction) {
  if ('commandId' in action) {
    return action.commandId;
  }
  if ('requestId' in action) {
    return action.requestId;
  }
  return 'carryId' in action ? action.carryId : null;
}
