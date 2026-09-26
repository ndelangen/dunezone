import { conversationsAvailable, conversationTextSchema } from '@shared/play/conversations';
import type { ConversationMessage, ConversationSummary } from '@shared/play/conversations';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { rosterSeat } from '@shared/play/schema';

type Request = Extract<ClientMessage, { type: 'conversation-send' | 'conversation-history' | 'conversation-read' }>;
type Context = { userId: string; factionId: string; peers: { id: string; name: string }[] };
type PendingView = {
  request: Extract<Request, { type: 'conversation-send' }>;
  status: 'Pending' | 'Failed';
  error?: string;
};
type PageView = { entries: ConversationMessage[]; more: boolean; loading?: string; error?: string };
/* The send and request times are monotonic readings, so they stay off the view where a component could compare them with a wall clock. */
type Pending = PendingView & { sentAt?: number };
type Page = PageView & { requestedAt?: number };
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
      peers: otherFactions(snapshot, factionId),
    };
    this.online = true;
    this.flush();
  }

  disconnected(denied: boolean) {
    this.online = false;
    this.pages = {};
    this.summaries = [];
    this.reads.clear();
    this.pending = this.pending.map((entry) => ({ ...entry, sentAt: undefined }));
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
    const page = Object.entries(this.pages).find(([, value]) => value.loading === message.requestId);
    const read = this.reads.delete(message.requestId);
    const matched = outgoing || page || read;
    if (!matched) {
      return false;
    }
    this.pending = this.pending.map((entry) =>
      entry.request.requestId === message.requestId
        ? { ...entry, status: 'Failed', error: message.message, sentAt: undefined }
        : entry
    );
    if (page) {
      this.pages = { ...this.pages, [page[0]]: { ...page[1], loading: undefined, error: message.message } };
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
    if (page?.loading !== message.requestId) {
      return;
    }
    this.pages = {
      ...this.pages,
      [message.peerId]: { entries: merge(page.entries, message.entries), more: message.more },
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
    if (this.pages[peerId]?.loading) {
      return;
    }
    const requestId = crypto.randomUUID();
    this.pages = {
      ...this.pages,
      [peerId]: {
        entries: this.pages[peerId]?.entries ?? [],
        more: false,
        loading: requestId,
        requestedAt: this.monotonicNow(),
      },
    };
    if (!this.send({ type: 'conversation-history', requestId, factionId: this.context.factionId, peerId, before })) {
      this.pages = {
        ...this.pages,
        [peerId]: { ...this.pages[peerId]!, loading: undefined, error: 'History could not load. Try again.' },
      };
    }
    this.changed();
  };

  submit = ({ peerId, text }: Pick<Extract<Request, { type: 'conversation-send' }>, 'peerId' | 'text'>) => {
    const parsed = conversationTextSchema.safeParse(text);
    if (!parsed.success) {
      return false;
    }
    if (!this.context || !this.context.peers.some((peer) => peer.id === peerId)) {
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
        status: 'Pending',
      },
    ];
    this.flush();
    this.changed();
    return true;
  };

  retry = (requestId: string) => {
    this.pending = this.pending.map((entry) =>
      entry.request.requestId === requestId
        ? { ...entry, status: 'Pending', error: undefined, sentAt: undefined }
        : entry
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
      if (page.loading && this.expired(page.requestedAt)) {
        this.pages = {
          ...this.pages,
          [peerId]: { ...page, loading: undefined, error: 'History could not load. Try again.' },
        };
        this.changed();
      }
    }
    this.expirePending();
  }

  private expirePending() {
    if (this.pending.some((entry) => this.expired(entry.sentAt))) {
      this.pending = this.pending.map((entry) =>
        this.expired(entry.sentAt)
          ? { ...entry, status: 'Failed', sentAt: undefined, error: 'No save confirmation received. Retry safely.' }
          : entry
      );
      this.changed();
    }
  }

  private expired(sentAt: number | undefined) {
    return sentAt !== undefined && this.monotonicNow() - sentAt >= 15_000;
  }

  private flush() {
    if (!this.online) {
      return;
    }
    this.pending = this.pending.map((entry) => this.sendPending(entry));
  }
  private sendPending(entry: Pending): Pending {
    if (entry.status !== 'Pending' || entry.sentAt !== undefined) {
      return entry;
    }
    return this.send(entry.request) ? { ...entry, sentAt: this.monotonicNow() } : entry;
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
