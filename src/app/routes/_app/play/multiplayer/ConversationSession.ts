import { conversationsAvailable, conversationTextSchema } from '@shared/play/conversations';
import type { ConversationMessage, ConversationSummary } from '@shared/play/conversations';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { rosterSeat } from '@shared/play/schema';

type Request = Extract<ClientMessage, { type: 'conversation-send' | 'conversation-history' | 'conversation-read' }>;
type Context = { userId: string; factionId: string; peers: { id: string; name: string }[] };
type Pending = {
  request: Extract<Request, { type: 'conversation-send' }>;
  status: 'Pending' | 'Failed';
  error?: string;
  sentAt?: number;
};
type Page = { entries: ConversationMessage[]; more: boolean; loading?: string; requestedAt?: number; error?: string };
export type ConversationView = {
  context: Context | null;
  online: boolean;
  summaries: ConversationSummary[];
  pages: Record<string, Page>;
  pending: Pending[];
};

/** Owns session-only outgoing messages and private history; the caller supplies current authority and transport. */
export class ConversationSession {
  private context: Context | null = null;
  private online = false;
  private generation?: number;
  private summaries: ConversationSummary[] = [];
  private pages: Record<string, Page> = {};
  private pending: Pending[] = [];
  private reads = new Map<string, { peerId: string; through: number }>();

  constructor(
    private readonly send: (request: Request) => boolean,
    private readonly changed: () => void,
    private readonly now: () => number
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
    const factionId = conversationsAvailable(snapshot.stage)
      ? rosterSeat(snapshot.roster, viewer.viewerSeat)?.faction?.id
      : undefined;
    if (!factionId || this.context?.factionId !== factionId || this.context.userId !== viewer.userId) {
      this.clear();
    }
    if (!factionId) {
      return;
    }
    this.context = {
      userId: viewer.userId,
      factionId,
      peers: snapshot.roster!.seats.flatMap((seat) =>
        seat.faction && seat.faction.id !== factionId ? [seat.faction] : []
      ),
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
      const outgoing = this.pending.some((entry) => entry.request.requestId === message.requestId);
      const page = Object.entries(this.pages).find(([, value]) => value.loading === message.requestId);
      const read = this.reads.delete(message.requestId);
      if (!outgoing && !page && !read) {
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
    } else if (
      message.type === 'conversations' ||
      message.type === 'conversation-history' ||
      message.type === 'conversation-message'
    ) {
      if (!this.online || message.factionId !== this.context?.factionId) {
        return true;
      }
      if (message.type === 'conversations') {
        if (this.generation !== undefined && this.generation !== message.generation) {
          this.pages = {};
          this.reads.clear();
        }
        this.generation = message.generation;
        this.summaries = message.entries;
      } else if (message.type === 'conversation-history') {
        const page = this.pages[message.peerId];
        if (page?.loading !== message.requestId) {
          return true;
        }
        this.pages = {
          ...this.pages,
          [message.peerId]: { entries: merge(page.entries, message.entries), more: message.more },
        };
      } else {
        const page = this.pages[message.peerId];
        if (page) {
          this.pages = {
            ...this.pages,
            [message.peerId]: { ...page, entries: merge(page.entries, [message.message]) },
          };
        }
        if (message.message.senderFactionId === this.context.factionId) {
          this.pending = this.pending.filter((entry) => entry.request.requestId !== message.message.requestId);
        }
      }
    } else {
      return false;
    }
    this.changed();
    return true;
  }

  load = (peerId: string, before = Number.MAX_SAFE_INTEGER) => {
    if (!this.context || !this.online || this.pages[peerId]?.loading) {
      return;
    }
    const requestId = crypto.randomUUID();
    this.pages = {
      ...this.pages,
      [peerId]: {
        entries: this.pages[peerId]?.entries ?? [],
        more: false,
        loading: requestId,
        requestedAt: this.now(),
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

  submit = (peerId: string, text: string) => {
    const parsed = conversationTextSchema.safeParse(text);
    if (!this.context || !this.context.peers.some((peer) => peer.id === peerId) || !parsed.success) {
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

  read = (peerId: string, through: number) => {
    if (
      !this.context ||
      !this.online ||
      !through ||
      [...this.reads.values()].some((read) => read.peerId === peerId && read.through >= through)
    ) {
      return;
    }
    const requestId = crypto.randomUUID();
    for (const [id, read] of this.reads) {
      if (read.peerId === peerId) {
        this.reads.delete(id);
      }
    }
    this.reads.set(requestId, { peerId, through });
    if (!this.send({ type: 'conversation-read', requestId, factionId: this.context.factionId, peerId, through })) {
      this.reads.delete(requestId);
    }
  };

  tick() {
    for (const [peerId, page] of Object.entries(this.pages)) {
      if (page.loading && page.requestedAt !== undefined && this.now() - page.requestedAt >= 15_000) {
        this.pages = {
          ...this.pages,
          [peerId]: { ...page, loading: undefined, error: 'History could not load. Try again.' },
        };
        this.changed();
      }
    }
    if (this.pending.some((entry) => entry.sentAt !== undefined && this.now() - entry.sentAt >= 15_000)) {
      this.pending = this.pending.map((entry) =>
        entry.sentAt !== undefined && this.now() - entry.sentAt >= 15_000
          ? { ...entry, status: 'Failed', sentAt: undefined, error: 'No save confirmation received. Retry safely.' }
          : entry
      );
      this.changed();
    }
  }

  private flush() {
    if (!this.online) {
      return;
    }
    this.pending = this.pending.map((entry) =>
      entry.status === 'Pending' && entry.sentAt === undefined && this.send(entry.request)
        ? { ...entry, sentAt: this.now() }
        : entry
    );
  }
}

function merge(previous: ConversationMessage[], incoming: ConversationMessage[]) {
  const messages = new Map(previous.map((message) => [message.sequence, message]));
  for (const message of incoming) {
    messages.set(message.sequence, message);
  }
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence);
}
