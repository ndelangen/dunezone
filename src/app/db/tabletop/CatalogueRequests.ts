import type { SpawnSelection } from '@shared/play/inventory';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';

type CatalogueReply = Extract<ServerMessage, { type: 'catalogue' }>;

/**
 * The spawn picker's catalogue reads, and the one capture the Worker runs per connection at a time: a catalogue read or a spawn request.
 * A newer selection waits until the capture in flight answers, and only the latest one is sent.
 */
export class CatalogueRequests {
  private requestId?: string;
  private selection?: SpawnSelection;
  private queued: { requestId: string; selection: SpawnSelection } | null = null;
  /* The Worker captures one catalogue read or spawn request per connection at a time; this is the id it holds. */
  private inFlight: string | null = null;
  private reply?: CatalogueReply;

  constructor(private readonly send: (message: Extract<ClientMessage, { type: 'catalogue' }>) => boolean) {}

  /* The answer to the latest read, or its refusal. */
  get result() {
    return this.reply;
  }

  /* Whether the Worker holds a capture for this connection, which a further spawn request would wrongly free. */
  get busy() {
    return this.inFlight !== null;
  }

  /** The picker keys its status on the latest request id, so a queued read shows as checking. */
  request(selection: SpawnSelection) {
    const requestId = crypto.randomUUID();
    this.requestId = requestId;
    this.selection = selection;
    this.queued = { requestId, selection };
    this.flush();
    return requestId;
  }

  flush() {
    if (this.inFlight || !this.queued) {
      return;
    }
    const { requestId, selection } = this.queued;
    this.queued = null;
    if (this.send({ type: 'catalogue', requestId, selection })) {
      this.inFlight = requestId;
    }
  }

  spawnSent(commandId: string) {
    this.inFlight = commandId;
  }

  settle(id: string) {
    if (this.inFlight === id) {
      this.inFlight = null;
    }
  }

  receive(message: CatalogueReply) {
    if (message.requestId === this.requestId) {
      this.reply = message;
    }
  }

  rejected(message: Extract<ServerMessage, { type: 'rejected' }>) {
    if (message.requestId === this.requestId) {
      /* A refused catalogue read never gets a catalogue reply; the picker shows the reason instead of waiting. */
      this.reply = { type: 'catalogue', requestId: message.requestId, contents: null, error: message.message };
    }
  }

  /* The Worker holds a capture for the connection, not the seat, so a seat change keeps it and a disconnect frees it. */
  disconnected() {
    this.inFlight = null;
    /* A catalogue read still unanswered goes again on the fresh connection, so the picker that stays on screen is not left checking. */
    const unanswered = this.requestId !== undefined && this.reply?.requestId !== this.requestId;
    this.queued = unanswered && this.selection ? { requestId: this.requestId!, selection: this.selection } : null;
  }
}
