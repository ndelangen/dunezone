import type { PieceAction } from '../../src/shared/play/protocol';

/** Every kind of move a page can send as a command. */
export type ActionKind = PieceAction['kind'];

/**
 * How a move is judged when the table changed after its sender last saw it.
 * - `strict`: refused with "The table changed", so the sender sees the new table before trying again.
 * - `tolerant`: names what it changes and is checked against the live table, so another seat acting at the same moment must not turn it away (#1681, #1690).
 * - `readiness`: confirms the table its sender saw, so it may cross other readiness but never a change it would have answered;
 * withdrawing readiness confirms no table and never waits on the revision.
 */
type RevisionPolicy = 'strict' | 'tolerant' | 'readiness';

type ActionPolicy = {
  revision: RevisionPolicy;
  /** Leaves the table a player readied for as it was, when it also leaves the game at the same stage, phase, setup step and trading round. Readiness always does. */
  settled?: true;
  /** A table command the room still takes while setup runs; the room refuses every other one then. Moves the session handles ignore this. */
  setup?: true;
  /** Still taken once the game has finished, which otherwise leaves the table as it was. */
  finished?: true;
};

/**
 * The one place each move declares how the room treats it.
 * A new move does not compile until it has an entry here, so nobody has to remember a separate list.
 */
export const ACTION_POLICY = {
  /* A battle action names its battle and side. */
  'battle-start': { revision: 'strict' },
  'battle-claim': { revision: 'tolerant' },
  'battle-plan': { revision: 'tolerant' },
  'battle-ready': { revision: 'tolerant' },
  'battle-disclose': { revision: 'tolerant' },
  'battle-cancel': { revision: 'tolerant' },
  'battle-outcome': { revision: 'tolerant' },
  'hand-take': { revision: 'strict', setup: true },
  'hand-play': { revision: 'strict', setup: true },
  /* Arranging or ordering the hand names the player's own pieces, which nobody else moves, and is judged against what they hold now. */
  'hand-zone': { revision: 'tolerant', setup: true },
  'hand-order': { revision: 'tolerant', setup: true },
  /* A raise, lowering or pass names its bidding round and is judged against the live bidder's turn, so a quick second raise is not turned away by the first. */
  'bid-start': { revision: 'strict' },
  'bid-reset': { revision: 'strict' },
  'bid-raise': { revision: 'tolerant' },
  'bid-pass': { revision: 'tolerant' },
  'bid-lower': { revision: 'tolerant' },
  /* The bidding clock settings are plain values, set as sent. */
  'bid-seconds': { revision: 'tolerant' },
  'bid-timing': { revision: 'tolerant' },
  /* An alliance offer or answer names the other faction and is judged against the live alliances. */
  'alliance-offer': { revision: 'tolerant' },
  'alliance-withdraw': { revision: 'tolerant' },
  'alliance-accept': { revision: 'tolerant' },
  /* Breaking an alliance stays strict, so a late break never leaves an alliance re-formed since the sender saw it. */
  'alliance-break': { revision: 'strict' },
  'last-turn': { revision: 'tolerant' },
  'movement-done': { revision: 'tolerant' },
  'movement-undo': { revision: 'tolerant' },
  'movement-order': { revision: 'tolerant' },
  'tint-create': { revision: 'tolerant', setup: true },
  'tint-paint': { revision: 'tolerant', setup: true },
  'tint-set': { revision: 'tolerant', setup: true },
  'tint-color': { revision: 'tolerant', setup: true },
  'tint-remove': { revision: 'tolerant', setup: true },
  /* A spice reserve withdrawal stays strict, so two tabs of one player cannot both spend from a spice reserve they saw once. */
  'bank-withdraw': { revision: 'strict', setup: true },
  'bank-collect': { revision: 'strict', setup: true },
  ready: { revision: 'readiness', setup: true },
  'spawn-request': { revision: 'strict' },
  'spawn-approve': { revision: 'strict' },
  'spawn-dismiss': { revision: 'strict' },
  /* A seat request names its seat, an approval its request and a withdrawal the sender's own request, each judged against the live seating. */
  'seat-request': { revision: 'tolerant', settled: true },
  'seat-withdraw': { revision: 'tolerant', settled: true },
  'seat-approve': { revision: 'tolerant' },
  /* Leaving stays strict, since its confirmation said what it costs and a crossed departure may have left the sender the last player. */
  'seat-depart': { revision: 'strict' },
  /* A removal ballot names the sender's own vote. */
  'removal-start': { revision: 'strict' },
  'removal-ballot': { revision: 'tolerant' },
  'review-propose': { revision: 'tolerant' },
  'review-ballot': { revision: 'tolerant' },
  'review-end': { revision: 'tolerant' },
  'review-seek': { revision: 'tolerant' },
  'result-open': { revision: 'strict' },
  'result-cancel': { revision: 'strict' },
  'result-declare': { revision: 'strict' },
  'result-continue': { revision: 'strict' },
  'result-end': { revision: 'strict' },
  /* A draft choice names the sender's own pick. */
  'draft-pick': { revision: 'tolerant' },
  'draft-unpick': { revision: 'tolerant' },
  'draft-ban': { revision: 'tolerant' },
  'draft-unban': { revision: 'tolerant' },
  'draft-ready': { revision: 'readiness' },
  'swap-offer': { revision: 'strict' },
  'swap-cancel': { revision: 'strict' },
  'swap-accept': { revision: 'strict' },
  'swap-ready': { revision: 'readiness' },
  'prediction-lock': { revision: 'strict', setup: true },
  /* A locked prediction can still be revealed once the game has finished. */
  'prediction-reveal': { revision: 'strict', setup: true, finished: true },
  'traitors-gather': { revision: 'strict', setup: true },
  'storm-random': { revision: 'strict' },
  split: { revision: 'strict', setup: true },
  stack: { revision: 'strict', setup: true },
  flip: { revision: 'strict', setup: true },
  lock: { revision: 'strict', setup: true },
  rotate: { revision: 'strict', setup: true },
  delete: { revision: 'strict', setup: true },
  storm: { revision: 'strict' },
  phase: { revision: 'strict', setup: true },
  'spice-spawn': { revision: 'tolerant', setup: true },
  /* A spice blow names its card and territory and finds room among the spice as it lies when it arrives, so the Spice blow command's placings, sent together, all land. */
  'spice-blow': { revision: 'tolerant' },
  /* A tech token draw picks from whatever the shared table inventory holds when it arrives. */
  'tech-token-draw': { revision: 'tolerant', setup: true },
  reset: { revision: 'strict' },
  'deck-draw': { revision: 'tolerant', setup: true },
  'deck-shuffle': { revision: 'strict', setup: true },
  peek: { revision: 'tolerant', setup: true },
  /* A peek can still be closed once the game has finished. */
  'peek-close': { revision: 'tolerant', setup: true, finished: true },
  'peek-arrange': { revision: 'strict', setup: true },
  'peek-pull': { revision: 'strict', setup: true },
  /* A restore names its deletion and finds room among the pieces as they lie when it arrives. */
  restore: { revision: 'tolerant', setup: true },
} as const satisfies Record<ActionKind, ActionPolicy>;

const policyOf = (kind: string): ActionPolicy | undefined => (ACTION_POLICY as Record<string, ActionPolicy>)[kind];

/** Whether a move is checked against the live table instead of the one its sender saw. */
export const revisionTolerant = (kind: string) => policyOf(kind)?.revision === 'tolerant';
/** Whether a move is readiness: `ready`, `draft-ready` or `swap-ready`. */
export const isReadiness = (kind: string) => policyOf(kind)?.revision === 'readiness';
/** Whether a move leaves the table a player readied for as it was, when the game stays in place. */
export const leavesTableSettled = (kind: string) => isReadiness(kind) || policyOf(kind)?.settled === true;
/** Whether the room takes a table command while setup runs. */
export const allowedDuringSetup = (kind: string) => policyOf(kind)?.setup === true;
/** Whether the room takes a move once the game has finished. */
export const allowedWhenFinished = (kind: string) => policyOf(kind)?.finished === true;
