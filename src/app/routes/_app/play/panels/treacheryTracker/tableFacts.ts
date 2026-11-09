import { handCountsShowing } from '@shared/play/handCounts';
import { tableProgressFor } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';

import type { TableFacts } from './tableFeed';

/*
 * The single face-down Treachery card the viewer holds open in the Bidding phase, which is the card up for bid.
 * A deck looked through, or a card of another deck, is not.
 */
function bidPeek(snapshot: GameSnapshot, faces: ReadonlySet<string>): TableFacts['peek'] {
  const piece = snapshot.peek?.piece;
  const item = piece?.kind === 'card' && piece.items.length === 1 ? piece.items[0] : undefined;
  const face = item?.artwork?.front;
  if (!item || item.faceUp || !face || !faces.has(face) || !handCountsShowing(snapshot.phase, snapshot.phases)) {
    return null;
  }
  return { item: item.id, face };
}

/** What the table shows the tracking seat, read from its own view of the game. */
export function tableFacts(snapshot: GameSnapshot, faces: ReadonlySet<string>): TableFacts {
  return { turn: tableProgressFor(snapshot.phase, snapshot.phases).turn, peek: bidPeek(snapshot, faces) };
}
