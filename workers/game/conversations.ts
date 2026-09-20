import { conversationsAvailable } from '../../src/shared/play/conversations';
import type { ConversationMessage } from '../../src/shared/play/conversations';
import type { ClientMessage, Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import type { ActorDirectory } from './actors';
import type { StoredSnapshot } from './state';

type Pair = Pick<ConversationRequest<'conversation-send'>, 'factionId' | 'peerId'>;
type ConversationRequest<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>;

type MessageRow = {
  sequence: number;
  request_id: string;
  sender_faction: string;
  author: string;
  text: string;
  saved_at: number;
  pair: string;
};
const pairKey = ({ factionId, peerId }: Pair) =>
  JSON.stringify([factionId, peerId].sort((a, b) => (a < b ? -1 : Number(a > b))));
const present = (row: MessageRow): ConversationMessage => ({
  sequence: row.sequence,
  requestId: row.request_id,
  senderFactionId: row.sender_faction,
  author: row.author,
  text: row.text,
  savedAt: row.saved_at,
});

/** Owns private faction-pair history and read positions; callers own authentication and transactions. */
export class Conversations {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS conversation_messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT NOT NULL, sender_id TEXT, request_id TEXT NOT NULL, sender_faction TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, saved_at INTEGER NOT NULL, UNIQUE(sender_id, request_id))'
    );
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS conversation_metadata (id INTEGER PRIMARY KEY, generation INTEGER NOT NULL)'
    );
    storage.sql.exec('INSERT OR IGNORE INTO conversation_metadata VALUES(1,0)');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS conversation_pair_sequence ON conversation_messages(pair, sequence)');
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS conversation_reads (pair TEXT NOT NULL, faction TEXT NOT NULL, through INTEGER NOT NULL, PRIMARY KEY(pair, faction))'
    );
  }

  faction(snapshot: StoredSnapshot, viewer: Viewer) {
    return conversationsAvailable(snapshot.stage) ? this.actors.factionFor(viewer.userId) : undefined;
  }

  authorize(snapshot: StoredSnapshot, viewer: Viewer, pair: Pair) {
    const own = this.faction(snapshot, viewer);
    if (!own || own !== pair.factionId) {
      throw new GameRejection('This conversation is not available.');
    }
    const peerExists = hasPeer(snapshot, pair);
    if (pair.peerId === own || !peerExists) {
      throw new GameRejection('This conversation is not available.');
    }
    return own;
  }

  save(viewer: Viewer, request: ConversationRequest<'conversation-send'>, now: number) {
    const { factionId: faction, requestId, text } = request;
    const pair = pairKey(request);
    const previous = this.storage.sql
      .exec<MessageRow>(
        'SELECT * FROM conversation_messages WHERE sender_id=? AND request_id=?',
        viewer.userId,
        requestId
      )
      .toArray()[0];
    if (previous) {
      const sameSender = previous.pair === pair && previous.sender_faction === faction;
      if (!sameSender || previous.text !== text) {
        throw new GameRejection('This message ID was already used.');
      }
      return { message: present(previous), inserted: false };
    }
    const row = this.storage.sql
      .exec<MessageRow>(
        'INSERT INTO conversation_messages(pair,sender_id,request_id,sender_faction,author,text,saved_at) VALUES(?,?,?,?,?,?,?) RETURNING *',
        pair,
        viewer.userId,
        requestId,
        faction,
        viewer.displayName,
        text,
        now
      )
      .one();
    return { message: present(row), inserted: true };
  }

  page(request: ConversationRequest<'conversation-history'>) {
    const rows = this.storage.sql
      .exec<MessageRow>(
        'SELECT * FROM conversation_messages WHERE pair=? AND sequence<? ORDER BY sequence DESC LIMIT 51',
        pairKey(request),
        request.before
      )
      .toArray();
    return { entries: rows.slice(0, 50).reverse().map(present), more: rows.length > 50 };
  }

  summaries(faction: string, peers: string[]) {
    return peers
      .filter((peer) => peer !== faction)
      .map((peerId) => {
        const pair = pairKey({ factionId: faction, peerId });
        const row = this.storage.sql
          .exec<{ latest: number; unread: number }>(
            'SELECT COALESCE((SELECT sequence FROM conversation_messages WHERE pair=? ORDER BY sequence DESC LIMIT 1),0) AS latest, (SELECT COUNT(*) FROM conversation_messages WHERE pair=? AND sequence>COALESCE((SELECT through FROM conversation_reads WHERE pair=? AND faction=?),0) AND sender_faction<>?) AS unread',
            pair,
            pair,
            pair,
            faction,
            faction
          )
          .one();
        return { peerId, ...row };
      });
  }

  read(request: ConversationRequest<'conversation-read'>) {
    const { factionId: faction, through } = request;
    const pair = pairKey(request);
    const exists =
      this.storage.sql
        .exec('SELECT sequence FROM conversation_messages WHERE pair=? AND sequence=?', pair, through)
        .toArray().length > 0;
    if (!exists) {
      throw new GameRejection('This message is not available.');
    }
    this.storage.sql.exec(
      'INSERT INTO conversation_reads(pair,faction,through) VALUES(?,?,?) ON CONFLICT(pair,faction) DO UPDATE SET through=MAX(through,excluded.through)',
      pair,
      faction,
      through
    );
  }

  generation() {
    return this.storage.sql
      .exec<{ generation: number }>('SELECT generation FROM conversation_metadata WHERE id=1')
      .one().generation;
  }

  scrub(userId: string) {
    this.storage.sql.exec('UPDATE conversation_metadata SET generation=generation+1 WHERE id=1');
    this.storage.sql.exec(
      "UPDATE conversation_messages SET sender_id=NULL, author='[deleted user]' WHERE sender_id=?",
      userId
    );
  }
}

function hasPeer(snapshot: StoredSnapshot, pair: Pair) {
  return snapshot.roster?.seats.some((seat) => seat.faction?.id === pair.peerId);
}
