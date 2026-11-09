import { DurableObject } from 'cloudflare:workers';

import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol';
import { BiddingHub } from '../../src/shared/tools/biddingHub';
import type { Member } from '../../src/shared/tools/biddingHub';
import type { TableRole } from '../../src/shared/tools/biddingTable';

/*
 * One IRL bidding table (Norbert, 2026-11-09): the tablet and its phones meet here (routing in biddingHub.ts). It
 * stores nothing; sleeping sockets keep who is who in their tags.
 */

export class BiddingTable extends DurableObject<GameEnv> {
  private readonly hub = new BiddingHub(() => this.members());
  /* Sockets that have closed but the runtime still lists until the close finishes. */
  private readonly gone = new WeakSet<WebSocket>();

  constructor(ctx: DurableObjectState, env: GameEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_PING, KEEPALIVE_PONG));
  }

  private members(): Member[] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => !this.gone.has(socket))
      .map((socket) => {
        const [role, id] = this.ctx.getTags(socket) as [TableRole, string];
        return { socket, role, id };
      });
  }

  private member(socket: WebSocket): Member {
    const [role, id] = this.ctx.getTags(socket) as [TableRole, string];
    return { socket, role, id };
  }

  /** Opens a client's socket; the worker has checked the path, so role and id are well formed. */
  connect(role: TableRole, id: string): Response {
    if (!this.hub.admits(role, id)) {
      return new Response('Table full.', { status: 503 });
    }
    const [client, socket] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(socket, [role, id]);
    this.hub.joined({ socket, role, id });
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    this.hub.message(this.member(socket), message);
  }

  override webSocketClose(socket: WebSocket) {
    this.gone.add(socket);
    this.hub.left();
  }

  override webSocketError(socket: WebSocket) {
    this.gone.add(socket);
    this.hub.left();
  }
}
