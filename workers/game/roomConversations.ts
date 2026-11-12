import { conversationPeerFor } from '../../src/shared/play/conversations';
import type { ClientMessage, ServerMessage, Viewer } from '../../src/shared/play/protocol';
import type { Connection, ConversationRequest } from './connection';
import type { GameSession } from './session';

type AnyMessage = Exclude<ServerMessage, { type: 'admission' }>;

/** What relaying table chat needs from its room. */
export type ConversationsRoom = {
  readonly session: GameSession;
  readonly connections: ReadonlyMap<WebSocket, Connection>;
  authorized(socket: WebSocket): boolean;
  send(socket: WebSocket, message: AnyMessage): void;
  /** Tells every connection the game log grew, as a cleared conversation's entry does. */
  announceGameLog(): void;
  /** A saved message changes the directory's unread counts. */
  directoryChanged(): void;
};

/** Relays the room's faction conversations: pages, reads, clears, new messages, and each socket's summaries. */
export class RoomConversations {
  /* The conversation summaries each socket last received, so a snapshot update that left them alone sends none. */
  private readonly sent = new WeakMap<WebSocket, string>();

  constructor(private readonly room: ConversationsRoom) {}

  handle(socket: WebSocket, viewer: Viewer, request: ConversationRequest) {
    switch (request.type) {
      case 'conversation-history':
        this.room.send(socket, this.room.session.conversationPage(viewer, request));
        return;
      case 'conversation-read':
        this.sendReads(this.room.session.markConversationRead(viewer, request));
        return;
      case 'conversation-clear':
        this.clear(viewer, request);
        return;
      case 'conversation-send':
        this.save(socket, viewer, request);
    }
  }

  /** `ifChanged` holds back summaries the socket already has; a view and every conversation change send them regardless. */
  sendSummaries(socket: WebSocket, viewer: Viewer, ifChanged = false) {
    const { session } = this.room;
    if (!session.ready || !this.room.authorized(socket)) {
      return;
    }
    const message = session.conversationSummaries(viewer);
    if (!message) {
      this.sent.delete(socket);
      return;
    }
    /* The seat goes with them, because a page clears its summaries whenever its own faction changes. */
    const summaries = JSON.stringify([viewer.viewerSeat, message]);
    if (ifChanged && this.sent.get(socket) === summaries) {
      return;
    }
    this.sent.set(socket, summaries);
    this.room.send(socket, message);
  }

  /** A page that loses its admission drops its summaries, so whatever readmits it receives them again. */
  forget(socket: WebSocket) {
    this.sent.delete(socket);
  }

  /* The faction's other connections drop the cleared messages when their summaries arrive; everyone reads the clear in the log. */
  private clear(viewer: Viewer, request: Extract<ConversationRequest, { type: 'conversation-clear' }>) {
    const { faction, logged } = this.room.session.clearConversation(viewer, request);
    this.sendReads(faction);
    if (logged) {
      this.room.announceGameLog();
    }
  }

  private save(
    socket: WebSocket,
    viewer: Viewer,
    request: Extract<ConversationRequest, { type: 'conversation-send' }>
  ) {
    const saved = this.room.session.sendConversation(viewer, request);
    if (saved.inserted) {
      this.publish(request, saved.message);
      this.room.directoryChanged();
      return;
    }
    /* A retried request was already delivered to every member; only the retrying connection needs its confirmation. */
    this.room.send(socket, {
      type: 'conversation-message',
      factionId: request.factionId,
      peerId: request.peerId,
      message: saved.message,
    });
  }

  private sendReads(faction: string) {
    for (const [peer, identity] of this.room.connections) {
      if (identity.viewer && this.room.session.factionFor(identity.viewer.userId) === faction) {
        this.sendSummaries(peer, identity.viewer);
      }
    }
  }

  private publish(
    request: Extract<ClientMessage, { type: 'conversation-send' }>,
    message: Extract<ServerMessage, { type: 'conversation-message' }>['message']
  ) {
    const faction = request.factionId;
    const members = this.room.session.conversationMembers(request);
    /* Only current members receive the saved message, including the sender's other connections. */
    for (const [peer, identity] of this.room.connections) {
      if (!identity.viewer || !this.room.authorized(peer)) {
        continue;
      }
      const own = this.room.session.conversationFaction(identity.viewer);
      if (own && members.includes(own)) {
        this.room.send(peer, {
          type: 'conversation-message',
          factionId: own,
          peerId: conversationPeerFor(own, faction, request.peerId),
          message,
        });
        this.sendSummaries(peer, identity.viewer);
      }
    }
  }
}
