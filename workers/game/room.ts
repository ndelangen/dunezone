import { applyPieceAction, nextSnapshot, requireAccepted } from '../../src/shared/play/commands';
import { loadSnapshot } from '../../src/shared/play/loadFixture';
import type { LoadProfile } from '../../src/shared/play/loadFixture';
import { gestureBlockReason } from '../../src/shared/play/model';
import type { DraftMove, TablePiece, TableState, Vector3Tuple } from '../../src/shared/play/model';
import { phaseForTurn, stepPhase } from '../../src/shared/play/phases';
import { PIECE_FLIP_DURATION_MS } from '../../src/shared/play/pieceFlip';
import { carryPieceId, tableForViewer } from '../../src/shared/play/protocol';
import type {
  ClientMessage,
  GameSnapshot,
  PieceAction,
  Viewer,
  PublicCarry,
  PublicPointer,
} from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
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
type CarryInput<T extends 'begin' | 'pose' | 'take'> = Omit<Extract<ClientMessage, { type: T }>, 'type'>;

export class Room {
  readonly epoch = crypto.randomUUID();
  readonly carries = new Map<string, Carry>();
  readonly reservations = new Map<string, string>();
  readonly pointers = new Map<string, PublicPointer>();
  private readonly usedCarryIds = new Map<string, Set<string>>();
  private readonly flipUntil = new Map<string, number>();
  constructor(
    public snapshot: GameSnapshot,
    private readonly loadProfile?: LoadProfile
  ) {}

  private player(identity: Identity) {
    if (identity.viewerSeat === 'neutral') {
      throw new GameRejection('Spectators can watch but cannot change the table or publish a cursor.');
    }
  }

  private available(pieceId: string, carryId?: string) {
    const owner = this.reservations.get(pieceId);
    if (owner !== undefined && owner !== carryId) {
      throw new GameRejection('Another player is carrying that piece.');
    }
  }

  private carry(identity: Identity, carryId: string): Carry {
    this.player(identity);
    const carry = this.carries.get(carryId);
    if (!carry || carry.connectionId !== identity.connectionId) {
      throw new GameRejection('That carry has ended. Pick the piece up again.');
    }
    this.assertCarrySources(carry);
    return carry;
  }

  private assertCarrySources(carry: Carry) {
    for (const [id, version] of carry.versions) {
      if (this.reservations.get(id) !== carry.id || this.snapshot.versions[id] !== version) {
        throw new GameRejection('A carried source changed. Pick the piece up again.');
      }
    }
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

  begin(identity: Identity, input: CarryInput<'begin'>, now = Date.now()): DraftMove {
    const { carryId: id, sourcePieceId: sourceId, expectedVersion, pickup } = input;
    this.player(identity);
    const payload = JSON.stringify({ sourceId, expectedVersion, pickup });
    const existing = this.carries.get(id);
    if (existing) {
      if (existing.connectionId !== identity.connectionId || existing.beginPayload !== payload) {
        throw new GameRejection('That carry ID was already used.');
      }
      existing.lastSeen = now;
      return existing.draft;
    }
    const draft = this.newCarryDraft(identity, input);
    this.rememberCarryId(identity, input);
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

  private assertCarryHistory(identity: Identity, input: CarryInput<'begin'>) {
    const used = this.usedCarryIds.get(identity.connectionId);
    if (used?.has(input.carryId)) {
      throw new GameRejection('That carry ID has ended. Start a new carry.');
    }
    if (used && used.size >= 1024) {
      throw new GameRejection('Reconnect to the table before starting another carry.');
    }
  }

  private assertCarryCapacity(identity: Identity) {
    if ([...this.carries.values()].some((carry) => carry.connectionId === identity.connectionId)) {
      throw new GameRejection('Finish the current carry first.');
    }
    if (this.carries.size >= (this.loadProfile ? 18 : 16)) {
      throw new GameRejection('The table already has too many active carries.');
    }
  }

  private rememberCarryId(identity: Identity, input: CarryInput<'begin'>) {
    const used = this.usedCarryIds.get(identity.connectionId) ?? new Set<string>();
    used.add(input.carryId);
    this.usedCarryIds.set(identity.connectionId, used);
  }

  private newCarryDraft(identity: Identity, input: CarryInput<'begin'>): DraftMove {
    const { carryId: id, sourcePieceId: sourceId, pickup } = input;
    this.assertCarryHistory(identity, input);
    this.assertCarryCapacity(identity);
    this.available(sourceId);
    const state = tableForViewer(this.snapshot, identity.viewerSeat);
    const source = this.pickupSource(state, input);
    const draft = draftForGesture(source, pickup);
    if (!draft) {
      throw new GameRejection('There is nothing to carry.');
    }
    if (draft.withdrawals.length) {
      draft.pieceId = carryPieceId(id);
    }
    if (state.pieces.some((piece) => piece.id === draft.pieceId && piece.id !== source.id)) {
      throw new GameRejection('That carried piece ID already exists.');
    }
    return draft;
  }

  private pickupSource(state: TableState, input: CarryInput<'begin'>): TablePiece {
    const source = state.pieces.find((piece) => piece.id === input.sourcePieceId);
    if (!source || this.snapshot.versions[input.sourcePieceId] !== input.expectedVersion) {
      throw new GameRejection('That piece changed. Try again from the current table.');
    }
    const blocked = gestureBlockReason(state, source);
    if (blocked) {
      throw new GameRejection(blocked);
    }
    return source;
  }

  pose(identity: Identity, input: CarryInput<'pose'>, now = Date.now()): boolean {
    const { carryId: id, seq, position, orientation } = input;
    const carry = this.carry(identity, id);
    if (seq <= carry.seq) {
      return false;
    }
    const draft = projectCarryAtPosition(this.table(identity, id), { ...carry.draft, orientation }, position);
    if (!draft) {
      throw new GameRejection('That carried piece is no longer available.');
    }
    carry.draft = draft;
    carry.seq = seq;
    carry.lastSeen = now;
    return true;
  }

  take(identity: Identity, input: CarryInput<'take'>, now = Date.now()): DraftMove {
    const { carryId: id, requestId, donorPieceId: donorId } = input;
    const carry = this.carry(identity, id);
    const previous = carry.takes.get(requestId);
    if (previous !== undefined) {
      if (previous !== donorId) {
        throw new GameRejection('That take ID was already used for another donor.');
      }
      return carry.draft;
    }
    const next = this.takeDraft(identity, carry, input);
    this.reservations.set(donorId, id);
    carry.versions.set(donorId, this.snapshot.versions[donorId]);
    carry.draft = next;
    carry.takes.set(requestId, donorId);
    carry.lastSeen = now;
    return next;
  }

  private takeDraft(identity: Identity, carry: Carry, input: CarryInput<'take'>): DraftMove {
    const { carryId: id, donorPieceId: donorId } = input;
    if (carry.takes.size >= 128) {
      throw new GameRejection('Finish this carry before taking more items.');
    }
    this.available(donorId, id);
    const state = this.table(identity, id);
    const projected = projectCarryAtPosition(state, carry.draft, carry.draft.position);
    if (projected?.targetPieceId !== donorId) {
      throw new GameRejection('Move the carried piece over that donor first.');
    }
    const next = draftWithAdditionalTop(state, projected);
    if (!next) {
      throw new GameRejection('That donor has no compatible top item available.');
    }
    return next;
  }

  drop(identity: Identity, id: string, position: Vector3Tuple, orientation: number): GameSnapshot {
    const carry = this.carry(identity, id);
    const guarded = this.table(identity, id);
    const settled = settleCarryAtPosition(guarded, { ...carry.draft, orientation }, position);
    if (!settled) {
      throw new GameRejection('There is no clear space for that object.');
    }
    if (settled.targetPieceId) {
      this.available(settled.targetPieceId, id);
    }
    const raw = tableForViewer(this.snapshot, identity.viewerSeat);
    // Apply to the real table so temporary reservation locks are never persisted.
    const table = requireAccepted(raw, applyDraftToState(raw, settled, identity.displayName));
    return nextSnapshot(this.snapshot, table);
  }

  command(identity: Identity, action: PieceAction, expectedRevision: number, now = Date.now()): GameSnapshot {
    this.assertCommand(identity, action, expectedRevision);
    if (action.kind === 'flip' && (this.flipUntil.get(action.pieceId) ?? 0) > now) {
      throw new GameRejection('Wait for that piece to finish flipping.');
    }
    const raw = tableForViewer(this.snapshot, identity.viewerSeat);
    const guarded = this.table(identity);
    const guardedNext =
      action.kind === 'reset' && this.loadProfile
        ? tableForViewer(loadSnapshot(this.loadProfile), identity.viewerSeat)
        : applyPieceAction(guarded, action, this.snapshot.phase, identity.displayName);
    // Any command touching a reserved donor or target must be rejected, even
    // when the acting player owns the carry in another tab.
    if (!['reset', 'enforcement', 'phase', 'turn'].includes(action.kind)) {
      this.assertReservationsUnchanged(guarded, guardedNext);
    }
    const table = action.kind === 'reset' ? guardedNext : this.restoreReservationLocks(raw, guardedNext);
    return nextSnapshot(this.snapshot, table, this.nextPhase(action), action.kind === 'reset');
  }

  private assertCommand(identity: Identity, action: PieceAction, expectedRevision: number) {
    this.player(identity);
    if (
      expectedRevision !== this.snapshot.revision &&
      (action.kind !== 'spice-spawn' || expectedRevision > this.snapshot.revision)
    ) {
      throw new GameRejection('The table changed. Try the action again.');
    }
    if ('pieceId' in action) {
      this.available(action.pieceId);
    }
  }

  private assertReservationsUnchanged(before: TableState, after: TableState) {
    for (const reserved of this.reservations.keys()) {
      const original = before.pieces.find((piece) => piece.id === reserved);
      const updated = after.pieces.find((piece) => piece.id === reserved);
      if (JSON.stringify(original) !== JSON.stringify(updated)) {
        throw new GameRejection('Finish the carry before changing that piece.');
      }
    }
  }

  private nextPhase(action: PieceAction): number {
    if (action.kind === 'reset') {
      return 0;
    }
    if (action.kind === 'turn') {
      return phaseForTurn(this.snapshot.phase, action.turn);
    }
    return action.kind === 'phase' ? stepPhase(this.snapshot.phase, action.direction) : this.snapshot.phase;
  }

  private restoreReservationLocks(raw: TableState, guardedNext: TableState): TableState {
    const table = {
      ...guardedNext,
      pieces: guardedNext.pieces.map((piece) => {
        const original = raw.pieces.find((candidate) => candidate.id === piece.id);
        return this.reservations.has(piece.id) && original ? { ...piece, locked: original.locked } : piece;
      }),
    };
    return table;
  }

  accept(snapshot: GameSnapshot, carryId?: string, clearAll = false, now = Date.now()) {
    this.updateFlipDeadlines(snapshot, now);
    this.snapshot = snapshot;
    if (clearAll) {
      for (const id of this.carries.keys()) {
        this.remove(id);
      }
    } else if (carryId) {
      this.remove(carryId);
    }
  }

  private updateFlipDeadlines(snapshot: GameSnapshot, now: number) {
    for (const piece of snapshot.table.pieces) {
      this.updateFlipDeadline(piece, now);
    }
    for (const id of this.flipUntil.keys()) {
      if (!snapshot.table.pieces.some((piece) => piece.id === id)) {
        this.flipUntil.delete(id);
      }
    }
  }

  private updateFlipDeadline(piece: TablePiece, now: number) {
    const before = this.snapshot.table.pieces.find((candidate) => candidate.id === piece.id);
    const revision = piece.flipRevision ?? 0;
    const previousRevision = before?.flipRevision ?? 0;
    if (before && revision === previousRevision + 1) {
      this.flipUntil.set(piece.id, now + PIECE_FLIP_DURATION_MS);
    } else if (!before || revision !== previousRevision) {
      this.flipUntil.delete(piece.id);
    }
  }

  cancel(identity: Identity, id: string) {
    const carry = this.carries.get(id);
    if (carry && carry.connectionId !== identity.connectionId) {
      throw new GameRejection('That carry belongs to another connection.');
    }
    if (carry) {
      this.remove(id);
    }
  }

  renew(identity: Identity, id: string, now = Date.now()) {
    this.carry(identity, id).lastSeen = now;
  }

  pointer(identity: Identity, position: Vector3Tuple | null, now = Date.now(), sourceSeq?: number) {
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
        ...(sourceSeq === undefined ? {} : { sourceSeq }),
      });
    }
  }

  clearActivity(connectionId: string) {
    for (const carry of this.carries.values()) {
      if (carry.connectionId === connectionId) {
        this.remove(carry.id);
      }
    }
    this.pointers.delete(connectionId);
  }

  disconnect(connectionId: string) {
    this.clearActivity(connectionId);
    this.usedCarryIds.delete(connectionId);
  }

  sweep(now = Date.now()): boolean {
    const carriesChanged = this.sweepCarries(now);
    const pointersChanged = this.sweepPointers(now);
    return carriesChanged || pointersChanged;
  }

  private sweepCarries(now: number): boolean {
    let changed = false;
    for (const carry of this.carries.values()) {
      if (now - carry.lastSeen > 8000) {
        this.remove(carry.id);
        changed = true;
      }
    }
    return changed;
  }

  private sweepPointers(now: number): boolean {
    let changed = false;
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
    return [...this.carries.values()].flatMap((carry) => this.publicCarry(carry));
  }

  private publicCarry(carry: Carry): PublicCarry[] {
    const held = heldPieceFor(tableForViewer(this.snapshot, carry.viewerSeat), carry.draft);
    if (!held) {
      return [];
    }
    return [
      {
        id: carry.id,
        connectionId: carry.connectionId,
        viewerSeat: carry.viewerSeat,
        displayName: carry.displayName,
        color: carry.color,
        held,
        withdrawnCounts: this.withdrawnCounts(carry),
        reservedIds: [...carry.versions.keys()],
        expiresAt: carry.lastSeen + 8000,
        sourceSeq: carry.seq,
      },
    ];
  }

  private withdrawnCounts(carry: Carry): PublicCarry['withdrawnCounts'] {
    const counts: PublicCarry['withdrawnCounts'] = {};
    for (const withdrawal of carry.draft.withdrawals) {
      counts[withdrawal.sourcePieceId] = (counts[withdrawal.sourcePieceId] ?? 0) + 1;
    }
    const canonical = this.snapshot.table.pieces.find((piece) => piece.id === carry.draft.pieceId);
    if (canonical) {
      counts[canonical.id] = canonical.items.length;
    }
    return counts;
  }
}
