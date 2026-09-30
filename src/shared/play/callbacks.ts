/**
 * The requests Convex sends a game room.
 * One list serves the game Worker's router, the publisher's callback quota and Convex's client, so a new callback cannot reach one and miss the others, as `retire` first missed the publisher's quota.
 */
export const playCallbackOperations = ['provision', 'account-deletion', 'retire'] as const;

export type PlayCallbackOperation = (typeof playCallbackOperations)[number];

/** A game room's path: its ID, then `socket` or one of the callbacks. */
export const playGamePathPattern = new RegExp(
  `^/__play/games/([a-zA-Z0-9_-]{1,128})/(socket|${playCallbackOperations.join('|')})$`,
  'u'
);
