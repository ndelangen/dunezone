import { applyPieceAction, nextSnapshot, requireAccepted } from '../../src/shared/play/commands';
import { gestureBlockReason } from '../../src/shared/play/model';
import type { DraftMove, TableState, Vector3Tuple } from '../../src/shared/play/model';
import { PIECE_FLIP_DURATION_MS } from '../../src/shared/play/pieceFlip';
import { carryPieceId, tableForViewer } from '../../src/shared/play/protocol';
import type { GameSnapshot, PieceAction, Viewer, PublicCarry, PublicPointer } from '../../src/shared/play/protocol';
import {
  applyDraftToState,
  draftForGesture,
  draftWithAdditionalTop,
  heldPieceFor,
  projectCarryAtPosition,
  settleCarryAtPosition,
} from '../../src/shared/play/tableState';

export type Identity = Viewer;
type Carry = Identity & {
  id: string;
  draft: DraftMove;
  versions: Map<string, number>;
  lastSeen: number;
  seq: number;
  beginPayload: string;
  takes: Map<string, string>;
};

export class Room {
  readonly epoch = crypto.randomUUID();
  readonly carries = new Map<string, Carry>();
  readonly reservations = new Map<string, string>();
  readonly pointers = new Map<string, PublicPointer>();
  private readonly usedCarryIds = new Set<string>();
  private readonly flipUntil = new Map<string, number>();
  constructor(public snapshot: GameSnapshot) {}

  private player(identity: Identity) {
    if (identity.viewerSeat === 'neutral') {
      throw new Error('Spectators can watch but cannot change the table or publish a cursor.');
    }
  }

  private available(pieceId: string, carryId?: string) {
    const owner = this.reservations.get(pieceId);
    if (owner !== undefined && owner !== carryId) {
      throw new Error('Another player is carrying that piece.');
    }
  }

  private carry(identity: Identity, carryId: string): Carry {
    this.player(identity);
    const carry = this.carries.get(carryId);
    if (!carry || carry.connectionId !== identity.connectionId) {
      throw new Error('That carry has ended. Pick the piece up again.');
    }
    for (const [id, version] of carry.versions) {
      if (this.reservations.get(id) !== carryId || this.snapshot.versions[id] !== version) {
        throw new Error('A carried source changed. Pick the piece up again.');
      }
    }
    return carry;
  }

  // Reserved sources remain physical obstacles until their owner's drop is accepted.
  // They cannot become somebody else's merge target while being carried.
  private table(identity: Identity, ownCarryId?: string): TableState {
    const state = tableForViewer(this.snapshot, identity.viewerSeat);
    return {
      ...state,
      pieces: state.pieces.map((piece) => {
        const reserved = this.reservations.get(piece.id);
        return reserved && reserved !== ownCarryId ? { ...piece, locked: true } : piece;
      }),
    };
  }

  begin(
    identity: Identity,
    id: string,
    sourceId: string,
    expectedVersion: number,
    pickup: 'top' | 'whole',
    now = Date.now()
  ): DraftMove {
    this.player(identity);
    const payload = JSON.stringify({ sourceId, expectedVersion, pickup });
    const existing = this.carries.get(id);
    if (existing) {
      if (existing.connectionId !== identity.connectionId || existing.beginPayload !== payload) {
        throw new Error('That carry ID was already used.');
      }
      existing.lastSeen = now;
      return existing.draft;
    }
    if (this.usedCarryIds.has(id)) {
      throw new Error('That carry ID has ended. Start a new carry.');
    }
    if ([...this.carries.values()].some((carry) => carry.connectionId === identity.connectionId)) {
      throw new Error('Finish the current carry first.');
    }
    if (this.carries.size >= 16) {
      throw new Error('The table already has too many active carries.');
    }
    this.available(sourceId);
    const state = tableForViewer(this.snapshot, identity.viewerSeat);
    const source = state.pieces.find((piece) => piece.id === sourceId);
    if (!source || this.snapshot.versions[sourceId] !== expectedVersion) {
      throw new Error('That piece changed. Try again from the current table.');
    }
    const blocked = gestureBlockReason(state, source);
    if (blocked) {
      throw new Error(blocked);
    }
    const draft = draftForGesture(source, pickup);
    if (!draft) {
      throw new Error('There is nothing to carry.');
    }
    if (draft.withdrawals.length) {
      draft.pieceId = carryPieceId(id);
    }
    if (state.pieces.some((piece) => piece.id === draft.pieceId && piece.id !== source.id)) {
      throw new Error('That carried piece ID already exists.');
    }
    this.usedCarryIds.add(id);
    this.reservations.set(sourceId, id);
    this.carries.set(id, {
      ...identity,
      id,
      draft,
      versions: new Map([[sourceId, expectedVersion]]),
      lastSeen: now,
      seq: -1,
      beginPayload: payload,
      takes: new Map(),
    });
    return draft;
  }

  pose(
    identity: Identity,
    id: string,
    seq: number,
    position: Vector3Tuple,
    orientation: number,
    now = Date.now()
  ): boolean {
    const carry = this.carry(identity, id);
    if (seq <= carry.seq) {
      return false;
    }
    const draft = projectCarryAtPosition(this.table(identity, id), { ...carry.draft, orientation }, position);
    if (!draft) {
      throw new Error('That carried piece is no longer available.');
    }
    carry.draft = draft;
    carry.seq = seq;
    carry.lastSeen = now;
    return true;
  }

  take(identity: Identity, id: string, requestId: string, donorId: string, now = Date.now()): DraftMove {
    const carry = this.carry(identity, id);
    const previous = carry.takes.get(requestId);
    if (previous !== undefined) {
      if (previous !== donorId) {
        throw new Error('That take ID was already used for another donor.');
      }
      return carry.draft;
    }
    if (carry.takes.size >= 128) {
      throw new Error('Finish this carry before taking more items.');
    }
    this.available(donorId, id);
    const state = this.table(identity, id);
    const projected = projectCarryAtPosition(state, carry.draft, carry.draft.position);
    if (!projected || projected.targetPieceId !== donorId) {
      throw new Error('Move the carried piece over that donor first.');
    }
    const next = draftWithAdditionalTop(state, projected);
    if (!next) {
      throw new Error('That donor has no compatible top item available.');
    }
    this.reservations.set(donorId, id);
    carry.versions.set(donorId, this.snapshot.versions[donorId]);
    carry.draft = next;
    carry.takes.set(requestId, donorId);
    carry.lastSeen = now;
    return next;
  }

  drop(identity: Identity, id: string, position: Vector3Tuple, orientation: number): GameSnapshot {
    const carry = this.carry(identity, id);
    const guarded = this.table(identity, id);
    const settled = settleCarryAtPosition(guarded, { ...carry.draft, orientation }, position);
    if (!settled) {
      throw new Error('There is no clear space for that object.');
    }
    if (settled.targetPieceId) {
      this.available(settled.targetPieceId, id);
    }
    const raw = tableForViewer(this.snapshot, identity.viewerSeat);
    // Apply to the real table so temporary reservation locks are never persisted.
    const table = requireAccepted(raw, applyDraftToState(raw, settled));
    return nextSnapshot(this.snapshot, table);
  }

  command(identity: Identity, action: PieceAction, expectedRevision: number, now = Date.now()): GameSnapshot {
    this.player(identity);
    if (expectedRevision !== this.snapshot.revision) {
      throw new Error('The table changed. Try the action again.');
    }
    if ('pieceId' in action) {
      this.available(action.pieceId);
    }
    if (action.kind === 'flip' && (this.flipUntil.get(action.pieceId) ?? 0) > now) {
      throw new Error('Wait for that piece to finish flipping.');
    }
    const raw = tableForViewer(this.snapshot, identity.viewerSeat);
    const guarded = this.table(identity);
    const guardedNext = applyPieceAction(guarded, action, this.snapshot.phase);
    // Any command touching a reserved donor or target must be rejected, even
    // when the acting player owns the carry in another tab.
    if (!['reset', 'enforcement', 'phase'].includes(action.kind)) {
      for (const reserved of this.reservations.keys()) {
        const before = guarded.pieces.find((piece) => piece.id === reserved);
        const after = guardedNext.pieces.find((piece) => piece.id === reserved);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          throw new Error('Finish the carry before changing that piece.');
        }
      }
    }
    const table = {
      ...guardedNext,
      pieces: guardedNext.pieces.map((piece) => {
        const original = raw.pieces.find((candidate) => candidate.id === piece.id);
        return this.reservations.has(piece.id) && original && action.kind !== 'reset'
          ? { ...piece, locked: original.locked }
          : piece;
      }),
    };
    return nextSnapshot(
      this.snapshot,
      table,
      action.kind === 'reset' ? 0 : action.kind === 'phase' ? this.snapshot.phase + 1 : this.snapshot.phase,
      action.kind === 'reset'
    );
  }

  accept(snapshot: GameSnapshot, carryId?: string, clearAll = false, now = Date.now()) {
    for (const piece of snapshot.table.pieces) {
      const before = this.snapshot.table.pieces.find((candidate) => candidate.id === piece.id);
      if (before && (piece.flipRevision ?? 0) === (before.flipRevision ?? 0) + 1) {
        this.flipUntil.set(piece.id, now + PIECE_FLIP_DURATION_MS);
      } else if (!before || (piece.flipRevision ?? 0) !== (before.flipRevision ?? 0)) {
        this.flipUntil.delete(piece.id);
      }
    }
    for (const id of this.flipUntil.keys()) {
      if (!snapshot.table.pieces.some((piece) => piece.id === id)) {
        this.flipUntil.delete(id);
      }
    }
    this.snapshot = snapshot;
    if (clearAll) {
      for (const id of this.carries.keys()) {
        this.remove(id);
      }
    } else if (carryId) {
      this.remove(carryId);
    }
  }

  cancel(identity: Identity, id: string) {
    const carry = this.carries.get(id);
    if (carry && carry.connectionId !== identity.connectionId) {
      throw new Error('That carry belongs to another connection.');
    }
    if (carry) {
      this.remove(id);
    }
  }

  renew(identity: Identity, id: string, now = Date.now()) {
    this.carry(identity, id).lastSeen = now;
  }

  pointer(identity: Identity, position: Vector3Tuple | null, now = Date.now()) {
    this.player(identity);
    if (position === null) {
      this.pointers.delete(identity.connectionId);
    } else {
      this.pointers.set(identity.connectionId, {
        connectionId: identity.connectionId,
        viewerSeat: identity.viewerSeat,
        displayName: identity.displayName,
        color: identity.color,
        position,
        updatedAt: now,
      });
    }
  }

  disconnect(connectionId: string) {
    for (const carry of this.carries.values()) {
      if (carry.connectionId === connectionId) {
        this.remove(carry.id);
      }
    }
    this.pointers.delete(connectionId);
  }

  sweep(now = Date.now()): boolean {
    let changed = false;
    for (const carry of this.carries.values()) {
      if (now - carry.lastSeen > 8000) {
        this.remove(carry.id);
        changed = true;
      }
    }
    for (const pointer of this.pointers.values()) {
      if (now - pointer.updatedAt > 3000) {
        this.pointers.delete(pointer.connectionId);
        changed = true;
      }
    }
    return changed;
  }

  private remove(id: string) {
    this.carries.delete(id);
    for (const [pieceId, owner] of this.reservations) {
      if (owner === id) {
        this.reservations.delete(pieceId);
      }
    }
  }

  publicCarries(): PublicCarry[] {
    return [...this.carries.values()].flatMap((carry) => {
      const held = heldPieceFor(tableForViewer(this.snapshot, carry.viewerSeat), carry.draft);
      if (!held) {
        return [];
      }
      const withdrawnCounts: Record<string, number> = {};
      for (const withdrawal of carry.draft.withdrawals) {
        withdrawnCounts[withdrawal.sourcePieceId] = (withdrawnCounts[withdrawal.sourcePieceId] ?? 0) + 1;
      }
      const canonical = this.snapshot.table.pieces.find((piece) => piece.id === carry.draft.pieceId);
      if (canonical) {
        withdrawnCounts[canonical.id] = canonical.items.length;
      }
      return [
        {
          id: carry.id,
          connectionId: carry.connectionId,
          viewerSeat: carry.viewerSeat,
          displayName: carry.displayName,
          color: carry.color,
          held,
          withdrawnCounts,
          reservedIds: [...carry.versions.keys()],
          expiresAt: carry.lastSeen + 8000,
        },
      ];
    });
  }
}
