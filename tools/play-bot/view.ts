/*
 * What the bot knows of its game: the same frames a browser in its seat receives, folded into one current view,
 * plus the chat it has seen and the faction sheets it asked for. Nothing here reads anything a human in the seat could not.
 */
import { TABLE_CONVERSATION } from '../../src/shared/play/conversations';
import type { ConversationMessage } from '../../src/shared/play/conversations';
import type { ServerMessage } from '../../src/shared/play/protocol';
import { rosterSeat } from '../../src/shared/play/schema';
import type { RoomView } from '../../src/shared/play/updates';
import { applyRoomUpdate } from '../../src/shared/play/updates';

export type ChatLine = { peerId: string; message: ConversationMessage };
export type FactionSheet = Extract<ServerMessage, { type: 'faction' }>['faction'];

const CHAT_KEPT = 60;

export class BotView {
  current: RoomView | undefined;
  /** Every chat line this connection saw, oldest first, table and private alike. */
  readonly chat: ChatLine[] = [];
  readonly factions = new Map<string, FactionSheet>();
  /** True once an update could not be applied, so the owner asks for a fresh view. */
  stale = false;

  apply(message: ServerMessage) {
    switch (message.type) {
      case 'view':
        this.current = message;
        this.stale = false;
        return;
      case 'update': {
        const next = applyRoomUpdate(this.current, message);
        if (next) {
          this.current = next;
        } else {
          this.stale = true;
        }
        return;
      }
      case 'conversation-message':
        if (!this.chat.some((line) => line.message.requestId === message.message.requestId)) {
          this.chat.push({ peerId: message.peerId, message: message.message });
          this.chat.splice(0, Math.max(0, this.chat.length - CHAT_KEPT));
        }
        return;
      case 'conversation-history':
        for (const entry of message.entries) {
          if (!this.chat.some((line) => line.message.requestId === entry.requestId)) {
            this.chat.push({ peerId: message.peerId, message: entry });
          }
        }
        this.chat.sort((a, b) => a.message.savedAt - b.message.savedAt);
        return;
      case 'faction':
        this.factions.set(message.factionId, message.faction);
        return;
      default:
        return;
    }
  }

  get snapshot() {
    return this.current?.snapshot;
  }

  /** The faction this connection plays, once it holds a seat with one. */
  get factionId(): string | null {
    const view = this.current;
    return view ? (rosterSeat(view.snapshot.roster, view.viewer.viewerSeat)?.faction?.id ?? null) : null;
  }

  factionName(factionId: string) {
    return this.snapshot?.roster?.seats.find((seat) => seat.faction?.id === factionId)?.faction?.name ?? factionId;
  }

  seatedFactions(): string[] {
    return this.snapshot?.roster?.seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : [])) ?? [];
  }

  peerLabel(peerId: string) {
    return peerId === TABLE_CONVERSATION ? 'table' : `private with ${this.factionName(peerId)}`;
  }
}
