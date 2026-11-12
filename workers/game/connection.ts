import type { ClientMessage, PingSound, PublicPointer, Viewer } from '../../src/shared/play/protocol';
import type { SeatPassPayload } from '../../src/shared/play/seatPass';
import { STORED_DISPLAY_NAME_LENGTH } from './actors';
import type { PassProfile } from './actors';
import type { HeldPass } from './seatPasses';

/* One game room socket as the room tracks it, its rate limits, and the messages the room tells apart before dispatch. */
export type Connection = {
  connectionId: string;
  openedAt: number;
  protocol?: number;
  /* The visitor's address, which bounds how many waiting places one visitor holds; kept in memory only and never saved. */
  client?: string;
  admitting: boolean;
  /* One catalogue capture per connection at a time; each capture is a Convex query. */
  capturing: boolean;
  viewer?: Viewer;
  /*
   * The player's name, avatar and profile slug as their pass carried them, with when that pass was issued; the actor directory keeps them.
   * They stay apart from the viewer, which the room reconciles from the directory, so a paused tab's renewal still carries its rename to the directory when it resumes.
   */
  profile?: PassProfile;
  /* Whether the player already held the most seats one player may when this connection was admitted. */
  seatLimitReached?: boolean;
  /* The seat pass this connection entered with, or its latest renewal. */
  pass?: HeldPass;
  /* The expiry of the pass this connection was last told had run out. */
  expiryAnnounced?: number;
  /* The connection the same page held before it reconnected; it is closed once this one is admitted. */
  replaces?: string;
  sessionId?: string;
  announced: 'pending' | 'authorized' | 'suspended';
  /* Counts the `suspended` frames the room sent. The page discards its unanswered requests on each one, so a message that arrived before the latest is dropped. */
  suspensions: number;
  everAuthorized: boolean;
  pointerSeq: number;
  deferredPointer?: Extract<ClientMessage, { type: 'pointer' }>;
  /* When this connection last pinged, by the room's clock. */
  pingedAt: number;
  /* When this connection's last ping carried the rumble. */
  rumbledAt: number;
  tokens: number;
  motionTokens: number;
  commandTokens: number;
  refilledAt: number;
};
/*
 * What an admitted connection keeps in its socket, so the room can hibernate between moves and wake with its players still connected.
 * The rest is either work in flight, which hibernation never interrupts, or a rate limit that refills while the room sleeps.
 */
export type RememberedConnection = Pick<
  Connection,
  | 'connectionId'
  | 'openedAt'
  | 'protocol'
  | 'viewer'
  | 'seatLimitReached'
  | 'pass'
  | 'expiryAnnounced'
  | 'sessionId'
  | 'announced'
  | 'suspensions'
> & {
  /* The room's activity epoch and revision when this socket last heard from it, so a woken room keeps the epoch and resends a state it moved on from. */
  epoch?: string;
  revision?: number;
  pointerSeq?: number;
  pointer?: Pick<PublicPointer, 'position' | 'updatedAt'>;
};
export function openConnection(
  state: Pick<Connection, 'connectionId' | 'openedAt'> &
    Partial<Pick<Connection, 'client'>> &
    Partial<Pick<Connection, Extract<keyof RememberedConnection, keyof Connection> | 'everAuthorized'>>
): Connection {
  return {
    admitting: false,
    capturing: false,
    announced: 'pending',
    suspensions: 0,
    everAuthorized: false,
    pointerSeq: -1,
    pingedAt: 0,
    rumbledAt: 0,
    tokens: RATE_BURST,
    motionTokens: RATE_BURST,
    commandTokens: COMMAND_BURST,
    refilledAt: Date.now(),
    ...state,
  };
}
export function isMovingPointer(
  message: ClientMessage
): message is Extract<ClientMessage, { type: 'pointer' }> & { position: PublicPointer['position'] } {
  return message.type === 'pointer' && message.position !== null;
}
/** Each connection's message buckets hold this many messages and refill at this rate. */
export const RATE_BURST = 120;
export const RATE_PER_SECOND = 60;
/*
 * Table commands and Discord nudges draw on a smaller bucket because they trigger writes or external requests.
 * Play by hand stays well inside it; a command over it is refused on its own, so the room never spends a write or a frame on it.
 */
export const COMMAND_BURST = 30;
export const COMMANDS_PER_SECOND = 10;
/* A held Tab rumbles after three seconds, so one connection rumbles at most that often. */
export const RUMBLE_INTERVAL_MS = 3000;

/* A page rumbles only after Tab is held for seconds, so a rumble sooner than that after the last goes out as a plain ping. */
export function pingSoundAllowed(connection: Pick<Connection, 'rumbledAt'>, sound: PingSound | undefined, now: number) {
  if (!sound || now - connection.rumbledAt < RUMBLE_INTERVAL_MS) {
    return undefined;
  }
  connection.rumbledAt = now;
  return sound;
}
/*
 * A room holds this many connections that have not been admitted yet, each for at most PLAY_PENDING_TIMEOUT_MS.
 * One address may hold only a quarter of them, so a visitor who knows a game's address needs four addresses to keep its players from reconnecting.
 */
export const PENDING_CONNECTION_LIMIT = 16;
export const CLIENT_PENDING_LIMIT = 4;
export const COMMAND_RATE_REFUSAL = 'You are acting too fast. Wait a moment, then try again.';
/** The profile a seat pass carries for its player, with when Convex issued the pass. */
export function passProfile(pass: SeatPassPayload): PassProfile {
  return {
    userId: pass.actorId,
    displayName: pass.displayName.slice(0, STORED_DISPLAY_NAME_LENGTH),
    avatarUrl: pass.avatarUrl,
    profileSlug: pass.profileSlug,
    issuedAt: pass.issuedAt,
  };
}
export type PageRead = Extract<
  ClientMessage,
  { type: 'history' | 'log-history' | 'spice-history' | 'faction' | 'treachery-deck' }
>;
const PAGE_READS: ReadonlySet<ClientMessage['type']> = new Set<PageRead['type']>([
  'history',
  'log-history',
  'spice-history',
  'faction',
  'treachery-deck',
]);
export const isPageRead = (message: ClientMessage): message is PageRead => PAGE_READS.has(message.type);
export type ConversationRequest = Extract<
  ClientMessage,
  { type: 'conversation-history' | 'conversation-send' | 'conversation-read' | 'conversation-clear' }
>;
export const isConversationRequest = (message: ClientMessage): message is ConversationRequest =>
  message.type.startsWith('conversation-');

export function messageId(message: ClientMessage): string {
  if ('commandId' in message) {
    return message.commandId;
  }
  if ('requestId' in message) {
    return message.requestId ?? 'message';
  }
  if ('carryId' in message) {
    return message.carryId;
  }
  return 'message';
}

/** Refills a connection's message, motion and command buckets for the time since it last sent. */
export function refillBuckets(connection: Connection, now: number) {
  const elapsed = Math.max(0, now - connection.refilledAt);
  const refill = (tokens: number) => Math.min(RATE_BURST, tokens + (elapsed * RATE_PER_SECOND) / 1000);
  connection.tokens = refill(connection.tokens);
  connection.motionTokens = refill(connection.motionTokens);
  connection.commandTokens = Math.min(COMMAND_BURST, connection.commandTokens + (elapsed * COMMANDS_PER_SECOND) / 1000);
  connection.refilledAt = now;
}
