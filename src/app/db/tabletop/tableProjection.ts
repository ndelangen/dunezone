import type { PublicFaction } from '@shared/play/capture';
import { snapshotFactionTieBreaks } from '@shared/play/factionLabels';
import type { LogTab } from '@shared/play/log';
import type { Affordance, DraftMove, TablePiece, TableState } from '@shared/play/model';
import type { Peek } from '@shared/play/peeking';
import { piecesOnPlates, pointerRiders, ridersOf } from '@shared/play/pointerRiders';
import { tableForViewer } from '@shared/play/protocol';
import type { GameSnapshot, PublicCarry, ServerMessage, Viewer } from '@shared/play/protocol';
import type { ReviewCheckpoint, TableReview } from '@shared/play/review';
import { renderedPiecesFor } from '@shared/play/tableState';

import type { ConversationView } from './ConversationSession';
import type { StoredTable } from './storedTable';
import type { LogPage } from './TablePages';
import type { TableSubscription } from './TableSubscription';

/* What a table session shows: the table as its scene and panels read it, and the connection around it. */

export type TableProjection = {
  viewer: Viewer;
  snapshot: GameSnapshot;
  liveRevision: number;
  playback: { step: number; lastStep: number; recordedAt?: number } | null;
  historyPending: boolean;
  /*
   * The live table review, read from the live table even while a checkpoint shows; absent where a game cannot review.
   * `seat` is the viewer's own live seat when they hold one, since a shown checkpoint watches the table as an observer.
   */
  review?: { current: TableReview | null; checkpoints: ReviewCheckpoint[]; seat: string | null };
  canInteract: boolean;
  /* Whether the viewer may handle the table's pieces: acting, at a stage whose table can change. A finished game, or one still drafting or trading, keeps its table as it is. */
  canHandleTable: boolean;
  /* The connection is being restored: this is the last live table, read-only, until a fresh view replaces it. */
  reconnecting: boolean;
  /* A seat command is on its way; the bar holds its buttons until the table answers. */
  seatCommandPending: boolean;
  /* How many of this viewer's own Traitor gathers the table has completed, so the camera can follow the pile they made. */
  traitorsGathered: number;
  phaseCooling: boolean;
  state: TableState;
  renderedPieces: TablePiece[];
  selectedPiece: TablePiece | null;
  affordances: Affordance[];
  /* The piece menu's spice reserve and deck actions, present only while this viewer can act. */
  spiceReserveControls?: {
    canCollect(pieceId: string): boolean;
    collect(pieceId: string): void;
  };
  deckControls?: {
    /* Each faction a card can be dealt to, with its token artwork where the room published one. */
    recipients: { id: string; name: string; artwork?: NonNullable<GameSnapshot['factionArtwork']>[string] }[];
    draw(pieceId: string, recipient?: string): void;
    shuffle(pieceId: string): void;
  };
  /* Taking a card, token or stack out of the game for good; present only while this viewer can act. */
  deleteControls?: {
    remove(pieceId: string): void;
  };
  /* Taking a loose card or a battle leader off the table into this viewer's hand; present only while this viewer can act. */
  handControls?: {
    canTake(pieceId: string): boolean;
    take(pieceId: string): void;
  };
  /* The piece this viewer's faction holds open by peeking, faces showing; only its own frames carry one. */
  peek: Peek | null;
  /* Peeking at a hidden card, token or deck, and changing a deck held open; present only while this viewer's faction can act. */
  peekControls?: {
    peek(pieceId: string): void;
    arrange: (pieceId: string, order: number[]) => void;
    pull: (pieceId: string, index: number) => void;
  };
  /* Letting go of the peek held open; a seated viewer can, even once the game is finished and the table no longer handles. */
  closePeek?: () => void;
  remoteCarriedIds: ReadonlySet<string>;
  /* Pieces riding a plate in someone's hand, this page's own included, by id, to that plate's id: they follow the plate as it is shown. */
  plateRiders: ReadonlyMap<string, string>;
  reservedPieceIds: ReadonlySet<string>;
  gestureActivePieceId: string | null;
  hoveredPieceId: string | null;
  flippingPieceIds: ReadonlyMap<string, number>;
  /* Only a derived table reads server time, because the view that derived it anchored the clock. */
  serverNow: () => number;
};

export type ConnectionView = {
  status: TableSubscription['status'];
  conversations: ConversationView;
  error: string | null;
  table: TableProjection | null;
  catalogue?: Extract<ServerMessage, { type: 'catalogue' }>;
  spiceHistory?: Extract<ServerMessage, { type: 'spice-history' }>;
  logHistory: Partial<Record<LogTab, LogPage>>;
  /* Seated factions' captured starting sheets by faction id; null when the game holds no capture of one. */
  factions: Readonly<Partial<Record<string, PublicFaction | null>>>;
};

/*
 * The table as others' carries leave it on this page: what they hold shown in their hands, the pieces they keep from moving, and what rides a plate one of them carries.
 * A piece another player holds part of stays put, as the room's own locks keep it, so it rides no plate.
 */
export function remoteViewOf(
  pieces: TablePiece[],
  carries: PublicCarry[],
  rested: TablePiece[],
  {
    ownDraft,
    pickupRiders,
  }: Readonly<{ ownDraft: DraftMove | null; pickupRiders: ReadonlyMap<string, ReadonlySet<string>> }>
) {
  const reservedPieceIds = new Set(carries.flatMap((carry) => carry.reservedIds));
  const remoteCarriedIds = new Set(carries.map((carry) => carry.held.id));
  /* A plate in anyone's hand, this page's own included, takes its riders along as it is shown. */
  const inHand = ownDraft ? new Set([...remoteCarriedIds, ownDraft.pieceId]) : remoteCarriedIds;
  /* What this page is carrying from is held for it too, so another's plate leaves it behind as well; so is a piece set down where a carried plate lay, which never rode it. */
  const held = new Set([
    ...reservedPieceIds,
    ...(ownDraft ? draftSourceIds(ownDraft) : []),
    ...lateRiders(rested, inHand, pickupRiders),
  ]);
  const guarded = held.size ? rested.map((piece) => (held.has(piece.id) ? { ...piece, locked: true } : piece)) : rested;
  return {
    renderedPieces: piecesOnPlates(projectPublicCarries(pieces, carries), guarded),
    reservedPieceIds,
    remoteCarriedIds,
    plateRiders: ridersOf(guarded, inHand),
  };
}

/* The pieces now resting on a carried plate that were not on it when it was picked up, as the room leaves them behind on its drop; a carry the room has not described yet keeps all it covers. */
function lateRiders(
  rested: readonly TablePiece[],
  inHand: ReadonlySet<string>,
  pickupRiders: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
  /* Each plate on its own, as the room drops it: a piece under two carried plates is held if either picked it up without it. */
  return rested
    .filter((plate) => inHand.has(plate.id) && pickupRiders.has(plate.id))
    .flatMap((plate) => pointerRiders(rested, plate).filter((rider) => !pickupRiders.get(plate.id)!.has(rider.id)))
    .map((rider) => rider.id);
}

/* What rode each carried plate when it was picked up, by the plate's id, as the room says in each carry. */
export function pickupRidersOf(carries: readonly PublicCarry[]): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(carries.flatMap((carry) => (carry.riderIds ? [[carry.held.id, new Set(carry.riderIds)]] : [])));
}

/* The stacks a carry takes from: the one it was picked up from, and any it took more from on the way. */
function draftSourceIds(draft: DraftMove): string[] {
  return [draft.sourcePieceId, ...draft.withdrawals.map((withdrawal) => withdrawal.sourcePieceId)];
}

function projectPublicCarries(pieces: TablePiece[], carries: PublicCarry[]): TablePiece[] {
  let result = pieces;
  for (const carry of carries) {
    result = result
      .map((piece) => {
        const count = carry.withdrawnCounts[piece.id] ?? 0;
        return count ? { ...piece, items: piece.items.slice(0, Math.max(0, piece.items.length - count)) } : piece;
      })
      .filter((piece) => piece.id !== carry.held.id);
    result = [...result, carry.held];
  }
  return result;
}

/* Whether two sets hold the same members, so a table rebuilt for a move keeps the sets a panel already read. */
function sameMembers<T>(a: ReadonlySet<T> | ReadonlyMap<T, unknown>, b: ReadonlySet<T> | ReadonlyMap<T, unknown>) {
  if (a.size !== b.size) {
    return false;
  }
  for (const key of a.keys()) {
    if (!b.has(key)) {
      return false;
    }
  }
  return true;
}

/* The controls a panel offers only while present, so only their presence counts for a panel's render. */
const PIECE_ID_SETS = ['remoteCarriedIds', 'plateRiders', 'reservedPieceIds'] as const;
const PANEL_CONTROLS = ['spiceReserveControls', 'deckControls', 'deleteControls', 'peekControls', 'closePeek'] as const;

function samePlayback(previous: TableProjection['playback'], next: TableProjection['playback']) {
  if (!previous || !next) {
    return previous === next;
  }
  return previous.step === next.step && previous.lastStep === next.lastStep && previous.recordedAt === next.recordedAt;
}

/*
 * Whether the panels would show `next` as they show `previous`: everything they read is the same, and only where held pieces are on their way differs.
 * A carry moves many times a second, and only the scene follows it, so the panels keep the table they have until something they show changes.
 * The hovered piece is left out for the same reason: only the scene, the close-up and the keyboard read it, all from the live table.
 */
export function sameForPanels(previous: TableProjection, next: TableProjection) {
  return (
    previous.viewer === next.viewer &&
    previous.snapshot === next.snapshot &&
    previous.liveRevision === next.liveRevision &&
    samePlayback(previous.playback, next.playback) &&
    previous.historyPending === next.historyPending &&
    previous.canInteract === next.canInteract &&
    previous.canHandleTable === next.canHandleTable &&
    previous.reconnecting === next.reconnecting &&
    previous.seatCommandPending === next.seatCommandPending &&
    previous.traitorsGathered === next.traitorsGathered &&
    previous.phaseCooling === next.phaseCooling &&
    previous.serverNow === next.serverNow &&
    previous.state.selectedPieceId === next.state.selectedPieceId &&
    previous.state.draftMove?.pieceId === next.state.draftMove?.pieceId &&
    previous.gestureActivePieceId === next.gestureActivePieceId &&
    PANEL_CONTROLS.every((key) => Boolean(previous[key]) === Boolean(next[key])) &&
    (previous.peek === null) === (next.peek === null) &&
    PIECE_ID_SETS.every((key) => sameMembers(previous[key], next[key])) &&
    sameMembers(previous.flippingPieceIds, next.flippingPieceIds) &&
    [...previous.flippingPieceIds].every(([id, revision]) => next.flippingPieceIds.get(id) === revision)
  );
}

/* A table a reloaded tab kept from its last visit: read-only, with nothing in hand or in motion, until a fresh view replaces it. */
export function storedProjection({ viewer, snapshot, serverNow }: StoredTable): TableProjection {
  const state = {
    ...tableForViewer(snapshot, viewer.viewerSeat),
    factionTieBreaks: snapshotFactionTieBreaks(snapshot),
    selectedPieceId: null,
    draftMove: null,
  };
  return {
    viewer,
    snapshot,
    liveRevision: snapshot.revision,
    playback: null,
    historyPending: false,
    canInteract: false,
    canHandleTable: false,
    reconnecting: true,
    seatCommandPending: false,
    traitorsGathered: 0,
    phaseCooling: false,
    state,
    renderedPieces: piecesOnPlates(renderedPiecesFor(state), state.pieces),
    selectedPiece: null,
    affordances: [],
    peek: null,
    remoteCarriedIds: new Set(),
    plateRiders: new Map(),
    reservedPieceIds: new Set(),
    gestureActivePieceId: null,
    hoveredPieceId: null,
    flippingPieceIds: new Map(),
    serverNow: () => serverNow,
  };
}
