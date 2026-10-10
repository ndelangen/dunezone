import { conversationMembers, conversationsAvailable, conversationTextSchema } from '@shared/play/conversations';
import type { ConversationMessage, ConversationSummary } from '@shared/play/conversations';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { rosterSeat } from '@shared/play/schema';

type Request = Extract<ClientMessage, { type: 'conversation-send' | 'conversation-history' | 'conversation-read' }>;
type Context = { userId: string; factionId: string; factionName: string; peers: { id: string; name: string }[] };
type Delivery = { state: 'unsent' } | { state: 'sent'; at: number } | { state: 'failed'; error: string };
type Load =
  | { state: 'idle' }
  | { state: 'loading'; requestId: string; at: number }
  | { state: 'failed'; error: string };
type Pending = { request: Extract<Request, { type: 'conversation-send' }>; delivery: Delivery };
type Page = { entries: ConversationMessage[]; more: boolean; load: Load };
/* Each `at` is a monotonic reading, so it stays off the view where a component could compare it with a wall clock. */
type Unclocked<State> = State extends unknown ? Omit<State, 'at'> : never;
type PendingView = Omit<Pending, 'delivery'> & { delivery: Unclocked<Delivery> };
type PageView = Omit<Page, 'load'> & { load: Unclocked<Load> };
export type ConversationView = {
  context: Context | null;
  online: boolean;
  summaries: ConversationSummary[];
  pages: Record<string, PageView>;
  pending: PendingView[];
};

/** Owns session-only outgoing messages and private history; the caller supplies current authority and transport. */
export class ConversationSession {
  private context: Context | null = null;
  private online = false;
  private generation?: number;
  private summaries: ConversationSummary[] = [];
  private pages: Record<string, Page> = {};
  private pending: Pending[] = [];
  private readonly reads = new Map<string, { peerId: string; through: number }>();

  constructor(
    private readonly send: (request: Request) => boolean,
    private readonly changed: () => void,
    private readonly monotonicNow: () => number
  ) {}

  view(): ConversationView {
    return {
      context: this.context,
      online: this.online,
      summaries: this.summaries,
      pages: this.pages,
      pending: this.pending,
    };
  }

  authority(snapshot: GameSnapshot, viewer: Viewer) {
    const factionId = currentFaction(snapshot, viewer);
    if (!factionId) {
      this.clear();
      return;
    }
    if (this.context?.factionId !== factionId || this.context.userId !== viewer.userId) {
      this.clear();
    }
    this.context = {
      userId: viewer.userId,
      factionId,
      factionName: factionName(snapshot, factionId),
      peers: otherFactions(snapshot, factionId),
    };
    this.online = true;
    this.flush();
  }

  /**
   * Picks up where a reloaded tab left off: the faction and peers from its stored table, offline, with the messages it had not confirmed.
   * The first live view's `authority` keeps them when the faction is the same and sends them;
   * the room saves each request id once.
   */
  resume(snapshot: GameSnapshot, viewer: Viewer, pending: Extract<Request, { type: 'conversation-send' }>[]) {
    const factionId = currentFaction(snapshot, viewer);
    if (!factionId) {
      return;
    }
    this.context = {
      userId: viewer.userId,
      factionId,
      factionName: factionName(snapshot, factionId),
      peers: otherFactions(snapshot, factionId),
    };
    this.pending = pending
      .filter((request) => request.factionId === factionId)
      .map((request) => ({ request, delivery: { state: 'unsent' } }));
  }

  /** The messages the room has not confirmed, which a reload should keep; one the room rejected stays behind, as across a reconnect. */
  unconfirmed(): Extract<Request, { type: 'conversation-send' }>[] {
    return this.pending.filter((entry) => entry.delivery.state !== 'failed').map((entry) => entry.request);
  }

  disconnected(denied: boolean) {
    this.online = false;
    this.pages = {};
    this.summaries = [];
    this.reads.clear();
    this.pending = this.pending.map((entry): Pending =>
      entry.delivery.state === 'sent' ? { ...entry, delivery: { state: 'unsent' } } : entry
    );
    if (denied) {
      this.clear();
    }
  }

  private clear() {
    this.context = null;
    this.online = false;
    this.generation = undefined;
    this.summaries = [];
    this.pages = {};
    this.pending = [];
    this.reads.clear();
  }

  receive(message: ServerMessage): boolean {
    if (message.type === 'rejected') {
      return this.receiveRejection(message);
    }
    switch (message.type) {
      case 'conversations':
      case 'conversation-history':
      case 'conversation-message':
        if (!this.online || message.factionId !== this.context?.factionId) {
          return true;
        }
        this.receivePrivate(message);
        this.changed();
        return true;
      default:
        return false;
    }
  }

  private receivePrivate(
    message: Extract<ServerMessage, { type: 'conversations' | 'conversation-history' | 'conversation-message' }>
  ) {
    switch (message.type) {
      case 'conversations':
        this.receiveSummaries(message);
        break;
      case 'conversation-history':
        this.receiveHistory(message);
        break;
      case 'conversation-message':
        this.receiveSaved(message);
        break;
    }
  }

  private receiveRejection(message: Extract<ServerMessage, { type: 'rejected' }>) {
    const outgoing = this.pending.some((entry) => entry.request.requestId === message.requestId);
    const page = Object.entries(this.pages).find(
      ([, { load }]) => load.state === 'loading' && load.requestId === message.requestId
    );
    const read = this.reads.delete(message.requestId);
    const matched = outgoing || page || read;
    if (!matched) {
      return false;
    }
    this.pending = this.pending.map((entry): Pending =>
      entry.request.requestId === message.requestId
        ? { ...entry, delivery: { state: 'failed', error: message.message } }
        : entry
    );
    if (page) {
      this.pages = { ...this.pages, [page[0]]: { ...page[1], load: { state: 'failed', error: message.message } } };
    }
    this.changed();
    return true;
  }

  private receiveSummaries(message: Extract<ServerMessage, { type: 'conversations' }>) {
    if (this.generation !== undefined && this.generation !== message.generation) {
      this.pages = {};
      this.reads.clear();
    }
    this.generation = message.generation;
    this.summaries = message.entries;
  }

  private receiveHistory(message: Extract<ServerMessage, { type: 'conversation-history' }>) {
    const page = this.pages[message.peerId];
    if (page?.load.state !== 'loading' || page.load.requestId !== message.requestId) {
      return;
    }
    this.pages = {
      ...this.pages,
      [message.peerId]: { entries: merge(page.entries, message.entries), more: message.more, load: { state: 'idle' } },
    };
  }

  private receiveSaved(message: Extract<ServerMessage, { type: 'conversation-message' }>) {
    const page = this.pages[message.peerId];
    if (page) {
      this.pages = {
        ...this.pages,
        [message.peerId]: { ...page, entries: merge(page.entries, [message.message]) },
      };
    }
    if (message.message.senderFactionId === this.context!.factionId) {
      this.pending = this.pending.filter((entry) => entry.request.requestId !== message.message.requestId);
    }
  }

  load = ({ peerId, before = Number.MAX_SAFE_INTEGER }: { peerId: string; before?: number }) => {
    if (!this.context || !this.online) {
      return;
    }
    if (this.pages[peerId]?.load.state === 'loading') {
      return;
    }
    const requestId = crypto.randomUUID();
    this.pages = {
      ...this.pages,
      [peerId]: {
        entries: this.pages[peerId]?.entries ?? [],
        more: false,
        load: { state: 'loading', requestId, at: this.monotonicNow() },
      },
    };
    if (!this.send({ type: 'conversation-history', requestId, factionId: this.context.factionId, peerId, before })) {
      this.pages = {
        ...this.pages,
        [peerId]: { ...this.pages[peerId]!, load: { state: 'failed', error: 'History could not load. Try again.' } },
      };
    }
    this.changed();
  };

  submit = ({ peerId, text }: Pick<Extract<Request, { type: 'conversation-send' }>, 'peerId' | 'text'>) => {
    const parsed = conversationTextSchema.safeParse(text);
    if (!parsed.success) {
      return false;
    }
    if (!this.context || !this.reaches(peerId)) {
      return false;
    }
    this.pending = [
      ...this.pending,
      {
        request: {
          type: 'conversation-send',
          requestId: crypto.randomUUID(),
          factionId: this.context.factionId,
          peerId,
          text: parsed.data,
        },
        delivery: { state: 'unsent' },
      },
    ];
    this.flush();
    this.changed();
    return true;
  };

  /** Whether this faction may write to `peerId`: another seated faction, or the table. */
  reaches(peerId: string) {
    const { factionId, peers } = this.context ?? { factionId: '', peers: [] };
    return Boolean(conversationMembers(factionId, peerId, [factionId, ...peers.map((peer) => peer.id)]));
  }

  retry = (requestId: string) => {
    this.pending = this.pending.map((entry): Pending =>
      entry.request.requestId === requestId ? { ...entry, delivery: { state: 'unsent' } } : entry
    );
    this.flush();
    this.changed();
  };

  read = ({ peerId, through }: Pick<Extract<Request, { type: 'conversation-read' }>, 'peerId' | 'through'>) => {
    if (!this.context || !this.online) {
      return;
    }
    if (!through || this.alreadyRead(peerId, through)) {
      return;
    }
    const requestId = crypto.randomUUID();
    this.forgetRead(peerId);
    this.reads.set(requestId, { peerId, through });
    if (!this.send({ type: 'conversation-read', requestId, factionId: this.context.factionId, peerId, through })) {
      this.reads.delete(requestId);
    }
  };

  private alreadyRead(peerId: string, through: number) {
    return [...this.reads.values()].some((read) => read.peerId === peerId && read.through >= through);
  }

  private forgetRead(peerId: string) {
    for (const [id, read] of this.reads) {
      if (read.peerId === peerId) {
        this.reads.delete(id);
      }
    }
  }

  tick() {
    for (const [peerId, page] of Object.entries(this.pages)) {
      if (page.load.state === 'loading' && this.expired(page.load.at)) {
        this.pages = {
          ...this.pages,
          [peerId]: { ...page, load: { state: 'failed', error: 'History could not load. Try again.' } },
        };
        this.changed();
      }
    }
    this.expirePending();
  }

  private expirePending() {
    const overdue = ({ delivery }: Pending) => delivery.state === 'sent' && this.expired(delivery.at);
    if (this.pending.some(overdue)) {
      this.pending = this.pending.map((entry): Pending =>
        overdue(entry)
          ? { ...entry, delivery: { state: 'failed', error: 'No save confirmation received. Retry safely.' } }
          : entry
      );
      this.changed();
    }
  }

  private expired(at: number) {
    return this.monotonicNow() - at >= 15_000;
  }

  private flush() {
    if (!this.online) {
      return;
    }
    this.pending = this.pending.map((entry) => this.sendPending(entry));
  }
  private sendPending(entry: Pending): Pending {
    if (entry.delivery.state !== 'unsent') {
      return entry;
    }
    return this.send(entry.request) ? { ...entry, delivery: { state: 'sent', at: this.monotonicNow() } } : entry;
  }
}

function merge(previous: ConversationMessage[], incoming: ConversationMessage[]) {
  const messages = new Map(previous.map((message) => [message.sequence, message]));
  for (const message of incoming) {
    messages.set(message.sequence, message);
  }
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence);
}

function currentFaction(snapshot: GameSnapshot, viewer: Viewer) {
  return conversationsAvailable(snapshot.stage)
    ? rosterSeat(snapshot.roster, viewer.viewerSeat)?.faction?.id
    : undefined;
}

function otherFactions(snapshot: GameSnapshot, factionId: string) {
  return snapshot.roster!.seats.flatMap((seat) =>
    seat.faction && seat.faction.id !== factionId ? [seat.faction] : []
  );
}

function factionName(snapshot: GameSnapshot, factionId: string) {
  return snapshot.roster!.seats.find((seat) => seat.faction?.id === factionId)?.faction?.name ?? factionId;
}
