import { allianceAction, relationTo } from '@shared/play/alliances';
import type { AllianceCommandKind } from '@shared/play/alliances';
import { factionOfToken } from '@shared/play/bribes';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { isFactionToken } from '@shared/play/factionToken';
import type { GameSnapshot, PieceAction } from '@shared/play/protocol';
import { rosterSeat } from '@shared/play/schema';
import { takeableIntoHand } from '@shared/play/techToken';

import { cachedBy } from './cached';
import type { Cached } from './cached';
import type { PeekState } from './PeekState';
import type { SpiceBlowQueue } from './SpiceBlowQueue';
import type { TableProjection } from './tableProjection';

type TableControlsHost = {
  /* The table as the last update derived it, which the controls that depend on nothing read when they are used. */
  table: () => TableProjection | null;
  /* The room's live table. */
  snapshot: () => GameSnapshot;
  viewerSeat: () => string;
  supportsCommand: (kind: PieceAction['kind']) => boolean;
  command: (action: PieceAction) => string | undefined;
};

/* What the viewer may do as a table is shown: whether they act, whether they handle the table's pieces, and whether a look back in time shows. */
export type ControlsAccess = { canInteract: boolean; canHandleTable: boolean; showsHistory: boolean };

/* Each faction a deck can deal to, with its token art for the deal ring. */
function dealRecipients(snapshot: GameSnapshot) {
  const artwork = snapshot.factionArtwork ?? {};
  return Object.entries(snapshotFactionLabels(snapshot)).map(([id, name]) => ({ id, name, artwork: artwork[id] }));
}

/**
 * The piece menu's controls on a table.
 * They keep their identity from one table to the next while what they offer is the same, so a carry moving many times a second leaves the open menu, a peeked deck and its rows as they are.
 * The controls that depend on nothing read the table as it is when they are used.
 */
export class TableControls {
  private dealing: Cached<NonNullable<TableProjection['deckControls']>> | undefined;
  private allying: Cached<NonNullable<TableProjection['allianceControls']>> | undefined;

  constructor(
    private readonly host: TableControlsHost,
    private readonly peeks: PeekState,
    private readonly spiceBlows: SpiceBlowQueue
  ) {}

  private readonly spiceReserve: NonNullable<TableProjection['spiceReserveControls']> = {
    canCollect: (pieceId) => {
      const table = this.host.table();
      return table !== null && !table.reservedPieceIds.has(pieceId);
    },
    collect: (pieceId) => this.host.command({ kind: 'bank-collect', pieceId }),
  };
  private readonly removal: NonNullable<TableProjection['deleteControls']> = {
    remove: (pieceId) => this.host.command({ kind: 'delete', pieceId }),
    restore: (deletionId) => this.host.command({ kind: 'restore', deletionId }),
  };
  private readonly taking: NonNullable<TableProjection['handControls']> = {
    canTake: (pieceId) => {
      const piece = this.host.table()?.state.pieces.find((entry) => entry.id === pieceId);
      return piece !== undefined && takeableIntoHand(piece);
    },
    take: (pieceId) => this.host.command({ kind: 'hand-take', pieceId }),
  };

  /* The controls a table shows, for `displayed`, the table as this viewer sees it. */
  forTable(displayed: GameSnapshot, { canInteract, canHandleTable, showsHistory }: ControlsAccess) {
    const supports = this.host.supportsCommand;
    return {
      spiceReserveControls: canHandleTable && displayed.bank ? this.spiceReserve : undefined,
      /* Placing spice from a spice card is for whoever handles the table, once play has begun. */
      spiceBlowControls:
        canHandleTable && displayed.stage === 'play' && supports('spice-blow') ? this.spiceBlows.controls : undefined,
      deckControls: canHandleTable && supports('deck-draw') ? this.deckControls(displayed) : undefined,
      deleteControls: canHandleTable && supports('delete') ? this.removal : undefined,
      handControls: canHandleTable && supports('hand-take') ? this.taking : undefined,
      allianceControls: this.allianceControls(canInteract && !showsHistory, displayed),
      peek: this.peeks.shown(displayed, showsHistory),
      peekControls: canHandleTable && displayed.bank ? this.peeks.controls : undefined,
      closePeek: canInteract && displayed.peek ? this.peeks.closer(displayed.peek.piece.id) : undefined,
    };
  }

  /* The deal ring names the factions as the snapshot labels them and shows their art, so it is rebuilt only when those change. */
  private deckControls(displayed: GameSnapshot): TableProjection['deckControls'] {
    this.dealing = cachedBy(
      this.dealing,
      [displayed.roster, displayed.controls?.players, displayed.factionArtwork],
      () => ({
        recipients: dealRecipients(displayed),
        draw: (pieceId, recipient) => this.host.command({ kind: 'deck-draw', pieceId, recipient }),
        shuffle: (pieceId) => this.host.command({ kind: 'deck-shuffle', pieceId }),
      })
    );
    return this.dealing.value;
  }

  /* The alliance action on a faction token, for a seated faction at the live table in play (#2978). */
  private allianceControls(live: boolean, displayed: GameSnapshot): TableProjection['allianceControls'] {
    const own = rosterSeat(displayed.roster, this.host.viewerSeat())?.faction?.id;
    if (!live || displayed.stage !== 'play' || !own) {
      return undefined;
    }
    const alliances = displayed.alliances;
    const factionOf = (pieceId: string) =>
      factionOfToken(this.host.snapshot().table.pieces.find((piece) => piece.id === pieceId && isFactionToken(piece)));
    this.allying = cachedBy(this.allying, [alliances, own], () => ({
      relation: (pieceId) => {
        const factionId = factionOf(pieceId);
        return factionId ? relationTo(alliances, own, factionId) : null;
      },
      act: (pieceId, kind: AllianceCommandKind) => {
        const factionId = factionOf(pieceId);
        const action = factionId && allianceAction(alliances, kind, own, factionId);
        if (action) {
          this.host.command(action);
        }
      },
    }));
    return this.allying.value;
  }
}
