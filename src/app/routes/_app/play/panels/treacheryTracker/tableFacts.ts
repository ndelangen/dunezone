import { handCountsShowing } from '@shared/play/handCounts';
import type { TablePiece } from '@shared/play/model';
import { tableProgressFor } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';

import type { SeenCard, TableFacts } from './tableFeed';

/* The Treachery cards of these pieces that show a face of this deck, face up or not as asked. */
function treacheryCards(pieces: readonly TablePiece[], faces: ReadonlySet<string>, faceUp?: boolean): SeenCard[] {
  return pieces.flatMap((piece) =>
    piece.kind === 'card'
      ? piece.items.flatMap((item) =>
          item.artwork?.front && faces.has(item.artwork.front) && (faceUp === undefined || item.faceUp === faceUp)
            ? [{ item: item.id, face: item.artwork.front }]
            : []
        )
      : []
  );
}

/* The single face-down card the viewer holds open in the Bidding phase, which is the card up for bid; a deck looked through is not. */
function bidPeek(snapshot: GameSnapshot, faces: ReadonlySet<string>): SeenCard | null {
  const piece = snapshot.peek?.piece;
  if (!piece || piece.items.length !== 1 || !handCountsShowing(snapshot.phase, snapshot.phases)) {
    return null;
  }
  return treacheryCards([piece], faces, false)[0] ?? null;
}

/* The bidder's last round, once it ended, named by the phase it ran in and its number there. */
function endedRound(snapshot: GameSnapshot): TableFacts['round'] {
  const bidding = snapshot.bidding;
  if (bidding?.stage !== 'won' && bidding?.stage !== 'unclaimed') {
    return null;
  }
  const key = `${snapshot.phase}:${bidding.round}`;
  return { key, winner: bidding.stage === 'won' ? (bidding.bid?.factionId ?? null) : null };
}

/** What the table shows the tracking seat, read from its own view of the game. */
export function tableFacts(snapshot: GameSnapshot, faces: ReadonlySet<string>, faction: string): TableFacts {
  const lying = snapshot.table.pieces.filter((piece) => !piece.inventory && !piece.battleOverlay);
  return {
    turn: tableProgressFor(snapshot.phase, snapshot.phases).turn,
    peek: bidPeek(snapshot, faces),
    round: endedRound(snapshot),
    counts: snapshot.handCounts ?? {},
    discards: treacheryCards(lying, faces, true),
    own: snapshot.hand ? { faction, cards: treacheryCards(snapshot.hand, faces) } : null,
  };
}
