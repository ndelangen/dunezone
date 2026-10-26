import { conversationMembers, conversationPeerFor, TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ConversationMessage } from '@shared/play/conversations';
import type { ClientMessage, ServerMessage } from '@shared/play/protocol';
import { rosterFactionIds } from '@shared/play/protocol';

import type { LocalTable } from './localTable';

type Request = Extract<ClientMessage, { type: 'conversation-send' | 'conversation-history' | 'conversation-read' }>;
type Saved = ConversationMessage & { pair: string };

/** How long the other player takes to answer, so the reply reads as typed rather than automatic. */
export const REPLY_AFTER_MS = 1500;

/* Both sides of a pair share one key, as in the Worker; the table is one conversation for everyone. */
const pairKey = (factionId: string, peerId: string) =>
  peerId === TABLE_CONVERSATION ? TABLE_CONVERSATION : [factionId, peerId].sort((a, b) => a.localeCompare(b)).join('|');

/**
 * The conversations of a table running in the page, kept as the game Worker keeps them, for the learner's seat.
 * A message the learner sends is saved and confirmed at once, and the player it went to answers it a moment later;
 * on the table chat, the first other player at the table answers (Norbert, 2026-10-26: people try the chat in the tutorial).
 */
export class LocalConversations {
  /** The signed-in player's own name, which the answers greet; the seat's name stands in without one. */
  learnerName: string | undefined;
  private messages: Saved[] = [];
  private readonly reads = new Map<string, number>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly table: () => LocalTable,
    private readonly deliver: (message: ServerMessage) => void
  ) {}

  receive(request: Request) {
    switch (request.type) {
      case 'conversation-history': {
        const entries = this.page(request.factionId, request.peerId).filter((entry) => entry.sequence < request.before);
        return this.deliver({ ...request, entries, more: false });
      }
      case 'conversation-read': {
        const read = `${pairKey(request.factionId, request.peerId)}/${request.factionId}`;
        this.reads.set(read, Math.max(this.reads.get(read) ?? 0, request.through));
        return this.summaries(request.factionId);
      }
      case 'conversation-send':
        return this.send(request);
    }
  }

  /** Gives a page that just connected the learner's conversations as they stand, as the Worker does with each view. */
  admitted() {
    const learner = this.factionOf(this.table().seat);
    /* A seat with no faction has no conversations, and the Worker sends it no summaries. */
    if (learner) {
      this.summaries(learner);
    }
  }

  /** Stops any answer still on its way, as leaving the chapter does. */
  dispose() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  private send(request: Extract<Request, { type: 'conversation-send' }>) {
    const table = this.table();
    const seated = rosterFactionIds(table.room.snapshot.roster);
    const learner = this.factionOf(table.seat);
    if (request.factionId !== learner || !conversationMembers(learner, request.peerId, seated)) {
      return this.deliver({
        type: 'rejected',
        requestId: request.requestId,
        message: 'This conversation is not available.',
      });
    }
    /* A message sent again after a reconnect is confirmed again, as the Worker confirms a retried request, and answered once. */
    const previous = this.messages.find((entry) => entry.requestId === request.requestId);
    if (previous) {
      const { pair: _pair, ...message } = previous;
      return this.deliver({ type: 'conversation-message', factionId: learner, peerId: request.peerId, message });
    }
    this.save(learner, request.peerId, table.viewer().displayName, request.text, request.requestId);
    this.answer(learner, request.peerId, seated);
  }

  /** The other side answers a moment later: the player written to, or on the table chat the first other player. */
  private answer(learner: string, peerId: string, seated: readonly string[]) {
    const onTable = peerId === TABLE_CONVERSATION;
    const replier = onTable ? seated.find((faction) => faction !== learner) : peerId;
    const seat = replier && this.seatOf(replier);
    if (!replier || !seat) {
      return;
    }
    const name = this.learnerName || this.table().viewer().displayName;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const author = this.table().viewer(seat).displayName;
      this.save(replier, onTable ? TABLE_CONVERSATION : learner, author, `Hey, nice of you to message me, ${name}!`);
    }, REPLY_AFTER_MS);
    this.timers.add(timer);
  }

  /** Saves one message and passes it to the learner, with the learner's summaries, as the Worker passes it to every member. */
  private save(
    senderFactionId: string,
    peerId: string,
    author: string,
    text: string,
    requestId: string = crypto.randomUUID()
  ) {
    const learner = this.factionOf(this.table().seat);
    const message: Saved = {
      pair: pairKey(senderFactionId, peerId),
      sequence: (this.messages.at(-1)?.sequence ?? 0) + 1,
      requestId,
      senderFactionId,
      author,
      text,
      savedAt: Date.now(),
    };
    this.messages = [...this.messages, message];
    const { pair: _pair, ...saved } = message;
    this.deliver({
      type: 'conversation-message',
      factionId: learner,
      peerId: conversationPeerFor(learner, senderFactionId, peerId),
      message: saved,
    });
    this.summaries(learner);
  }

  private page(factionId: string, peerId: string): ConversationMessage[] {
    const pair = pairKey(factionId, peerId);
    return this.messages.filter((entry) => entry.pair === pair).map(({ pair: _pair, ...message }) => message);
  }

  /** The learner's conversations with each other faction, then the table, with what they have not read. */
  private summaries(factionId: string) {
    const peers = rosterFactionIds(this.table().room.snapshot.roster).filter((peer) => peer !== factionId);
    const entries = [...peers, TABLE_CONVERSATION].map((peerId) => {
      const pair = pairKey(factionId, peerId);
      const read = this.reads.get(`${pair}/${factionId}`) ?? 0;
      const messages = this.messages.filter((entry) => entry.pair === pair);
      return {
        peerId,
        latest: messages.at(-1)?.sequence ?? 0,
        unread: messages.filter((entry) => entry.sequence > read && entry.senderFactionId !== factionId).length,
      };
    });
    this.deliver({ type: 'conversations', generation: 0, factionId, entries });
  }

  private factionOf(seat: string) {
    return this.table().room.snapshot.roster?.seats.find((entry) => entry.id === seat)?.faction?.id ?? '';
  }

  private seatOf(factionId: string) {
    return this.table().room.snapshot.roster?.seats.find((entry) => entry.faction?.id === factionId)?.id;
  }
}
