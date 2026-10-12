import type {
  ActivityChange,
  GameSnapshot,
  PublicCarry,
  PublicPointer,
  ServerMessage,
  SnapshotChange,
} from './protocol';
import { gameSnapshotSchema, snapshotStateKeys } from './protocol';

export type RoomFrame = Pick<Extract<ServerMessage, { type: 'view' }>, 'epoch' | 'snapshot' | 'carries' | 'pointers'>;
export type RoomView = Extract<ServerMessage, { type: 'view' }>;
type Update = Extract<ServerMessage, { type: 'update' }>;
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (!isObject(a) || !isObject(b)) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const left = Object.entries(a);
  return (
    left.length === Object.keys(b).length && left.every(([key, value]) => Object.hasOwn(b, key) && same(value, b[key]))
  );
}

function pieceDefinition(piece: GameSnapshot['table']['pieces'][number]) {
  const {
    position: _position,
    orientation: _orientation,
    zoneId: _zoneId,
    flipRevision: _flipRevision,
    ...definition
  } = piece;
  /* Optional fields set to undefined are absent on the wire, just like omitted fields. */
  return Object.fromEntries(Object.entries(definition).filter(([, value]) => value !== undefined));
}

/** The pieces whose definition changed, in full, and the ones that only moved, as their moves. */
function pieceChanges(base: GameSnapshot['table']['pieces'], next: GameSnapshot['table']['pieces']) {
  const before = new Map(base.map((piece) => [piece.id, piece]));
  const pieces: SnapshotChange['pieces'] = [];
  const pieceMoves: NonNullable<SnapshotChange['pieceMoves']> = [];
  for (const piece of next) {
    const previous = before.get(piece.id);
    if (same(previous, piece)) {
      continue;
    }
    if (previous && same(pieceDefinition(previous), pieceDefinition(piece))) {
      const { id, position, orientation, zoneId } = piece;
      pieceMoves.push({ id, position, orientation, zoneId, flipRevision: piece.flipRevision ?? null });
    } else {
      pieces.push(piece);
    }
  }
  return { pieces, pieceMoves };
}

function stateChanges(base: GameSnapshot, next: GameSnapshot) {
  const state: Record<string, unknown> = {};
  for (const key of snapshotStateKeys) {
    if (!same(base[key], next[key])) {
      state[key] = next[key] ?? null;
    }
  }
  return state as Pick<SnapshotChange, (typeof snapshotStateKeys)[number]>;
}

function snapshotChange(base: GameSnapshot, next: GameSnapshot): SnapshotChange | undefined {
  if (same(base, next)) {
    return;
  }
  const order = next.table.pieces.map((piece) => piece.id);
  const ids = new Set(order);
  const { pieces: _pieces, ...metadata } = next.table;
  const { pieces, pieceMoves } = pieceChanges(base.table.pieces, next.table.pieces);
  const baseOrder = base.table.pieces.map((piece) => piece.id);
  return {
    baseRevision: base.revision,
    revision: next.revision,
    phase: next.phase,
    ...stateChanges(base, next),
    table: Object.fromEntries(
      Object.entries(metadata).filter(([key, value]) => !same(base.table[key as keyof typeof metadata], value))
    ),
    pieces,
    ...(pieceMoves.length ? { pieceMoves } : {}),
    removedPieces: [...new Set(baseOrder)].filter((id) => !ids.has(id)),
    ...(same(baseOrder, order) ? {} : { pieceOrder: order }),
    versions: Object.fromEntries(
      Object.entries(next.versions).filter(([id, version]) => base.versions[id] !== version)
    ),
    removedVersions: Object.keys(base.versions).filter((id) => !Object.hasOwn(next.versions, id)),
  };
}

function carryDefinition(carry: PublicCarry) {
  const { expiresAt: _expiresAt, sourceSeq: _sourceSeq, held, ...identity } = carry;
  const { position: _position, orientation: _orientation, ...piece } = held;
  return { ...identity, held: piece };
}
function pointerDefinition(pointer: PublicPointer) {
  const { position: _position, updatedAt: _updatedAt, sourceSeq: _sourceSeq, ...identity } = pointer;
  return identity;
}

/** A keyed list's diff: a new entry or one whose definition changed goes in full, one that only moved goes as its move. */
function keyedChanges<T, M>(
  base: readonly T[],
  next: readonly T[],
  key: (entry: T) => string,
  definition: (entry: T) => unknown,
  move: (entry: T) => M
) {
  const before = new Map(base.map((entry) => [key(entry), entry]));
  const upserts: T[] = [];
  const moves: M[] = [];
  for (const entry of next) {
    const previous = before.get(key(entry));
    before.delete(key(entry));
    if (!previous || !same(definition(previous), definition(entry))) {
      upserts.push(entry);
    } else if (!same(previous, entry)) {
      moves.push(move(entry));
    }
  }
  return { upserts, moves, removed: [...before.keys()] };
}

function carryChanges(base: PublicCarry[], next: PublicCarry[]) {
  const { upserts, moves, removed } = keyedChanges(
    base,
    next,
    (carry) => carry.id,
    carryDefinition,
    (carry): ActivityChange['carryMoves'][number] => ({
      id: carry.id,
      position: carry.held.position,
      orientation: carry.held.orientation,
      expiresAt: carry.expiresAt,
      sourceSeq: carry.sourceSeq,
    })
  );
  return { carries: upserts, carryMoves: moves, removedCarries: removed };
}

function pointerChanges(base: PublicPointer[], next: PublicPointer[]) {
  const { upserts, moves, removed } = keyedChanges(
    base,
    next,
    (pointer) => pointer.connectionId,
    pointerDefinition,
    (pointer): ActivityChange['pointerMoves'][number] => ({
      connectionId: pointer.connectionId,
      position: pointer.position,
      updatedAt: pointer.updatedAt,
      sourceSeq: pointer.sourceSeq,
    })
  );
  return { pointers: upserts, pointerMoves: moves, removedPointers: removed };
}

type FrameChange = Pick<Update, 'snapshot' | 'activity'>;

/** A frame's change from its three parts' comparisons. Each frame has already been filtered for its recipient. */
function frameChangeOf(
  snapshots: typeof snapshotChange,
  carries: typeof carryChanges,
  pointers: typeof pointerChanges
): (base: RoomFrame, next: RoomFrame) => FrameChange {
  return (base, next) => ({
    snapshot: snapshots(base.snapshot, next.snapshot),
    activity: { ...carries(base.carries, next.carries), ...pointers(base.pointers, next.pointers) },
  });
}

/** The change between two frames, compared afresh. */
export const frameChange = frameChangeOf(snapshotChange, carryChanges, pointerChanges);

/** Remembers each comparison by the two objects it compared, so callers that pass the same pair share one result. */
function pairwise<T extends object, R>(compare: (base: T, next: T) => R) {
  const results = new WeakMap<T, WeakMap<T, { result: R }>>();
  return (base: T, next: T) => {
    let byBase = results.get(next);
    if (!byBase) {
      byBase = new WeakMap();
      results.set(next, byBase);
    }
    let entry = byBase.get(base);
    if (!entry) {
      entry = { result: compare(base, next) };
      byBase.set(base, entry);
    }
    return entry.result;
  };
}

/**
 * `frameChange` with each part remembered by the base and next parts it compared.
 * A room builds one carries list and one pointers list per broadcast, and viewers in one audience share a snapshot, so viewers that received the same last frame share every comparison.
 */
export function frameChanges() {
  return frameChangeOf(pairwise(snapshotChange), pairwise(carryChanges), pairwise(pointerChanges));
}

function patchEntries<T>(base: Iterable<[string, T]>, removed: string[], upserts: Iterable<[string, T]>) {
  const entries = new Map(base);
  for (const id of removed) {
    entries.delete(id);
  }
  for (const [id, value] of upserts) {
    entries.set(id, value);
  }
  return entries;
}

function movedPiece(
  piece: GameSnapshot['table']['pieces'][number],
  move: NonNullable<SnapshotChange['pieceMoves']>[number]
) {
  const { flipRevision, ...pose } = move;
  const moved = { ...piece, ...pose };
  if (flipRevision === null) {
    delete moved.flipRevision;
  } else {
    moved.flipRevision = flipRevision;
  }
  return moved;
}

/* An order must name every piece exactly once. */
function isCompleteOrder(order: string[], pieces: ReadonlyMap<string, unknown>): boolean {
  return order.length === pieces.size && new Set(order).size === order.length && order.every((id) => pieces.has(id));
}

function applyPieces(base: GameSnapshot['table']['pieces'], change: SnapshotChange) {
  const pieces = patchEntries(
    base.map((piece) => [piece.id, piece]),
    change.removedPieces,
    change.pieces.map((piece) => [piece.id, piece])
  );
  for (const move of change.pieceMoves ?? []) {
    const piece = pieces.get(move.id);
    if (!piece) {
      return null;
    }
    pieces.set(move.id, movedPiece(piece, move));
  }
  const order = change.pieceOrder ?? [...pieces.keys()];
  return isCompleteOrder(order, pieces) ? order.map((id) => pieces.get(id)!) : null;
}

/* A key whose snapshot schema admits null keeps it, as the fresh view sends it; any other key is deleted. */
const keepsNull = new Set(snapshotStateKeys.filter((key) => gameSnapshotSchema.shape[key].safeParse(null).success));

function applyVersions(base: GameSnapshot['versions'], change: SnapshotChange): GameSnapshot['versions'] {
  const versions = { ...base, ...change.versions };
  for (const id of change.removedVersions) {
    delete versions[id];
  }
  return versions;
}

function applyState(base: GameSnapshot, change: SnapshotChange): GameSnapshot {
  const state: Record<string, unknown> = { ...base };
  for (const key of snapshotStateKeys) {
    const value = change[key];
    switch (true) {
      case value === undefined:
        break;
      case value === null && !keepsNull.has(key):
        delete state[key];
        break;
      default:
        state[key] = value;
    }
  }
  return state as GameSnapshot;
}

function applySnapshot(base: GameSnapshot, change: SnapshotChange): GameSnapshot | null {
  if (base.revision !== change.baseRevision || change.revision < change.baseRevision) {
    return null;
  }
  const pieces = applyPieces(base.table.pieces, change);
  if (!pieces) {
    return null;
  }
  return {
    ...applyState(base, change),
    revision: change.revision,
    phase: change.phase,
    versions: applyVersions(base.versions, change),
    table: { ...base.table, ...change.table, pieces },
  };
}

/* An update that leaves the carries or the pointers alone keeps the same list, so the tab can tell a pointer-only update from one that moved a piece. */
function applyKeyed<T, M>(
  base: T[],
  [removed, upserts, moves]: [string[], T[], M[]],
  key: (entry: T) => string,
  moveKey: (move: M) => string,
  moved: (entry: T, move: M) => T
): T[] | null {
  if (!removed.length && !upserts.length && !moves.length) {
    return base;
  }
  const entries = patchEntries(
    base.map((entry) => [key(entry), entry]),
    removed,
    upserts.map((entry) => [key(entry), entry])
  );
  for (const move of moves) {
    const entry = entries.get(moveKey(move));
    if (!entry) {
      return null;
    }
    entries.set(moveKey(move), moved(entry, move));
  }
  return [...entries.values()];
}

function applyCarries(base: PublicCarry[], change: ActivityChange): PublicCarry[] | null {
  return applyKeyed(
    base,
    [change.removedCarries, change.carries, change.carryMoves],
    (carry) => carry.id,
    (move) => move.id,
    (carry, move) => ({
      ...carry,
      expiresAt: move.expiresAt,
      sourceSeq: move.sourceSeq,
      held: { ...carry.held, position: move.position, orientation: move.orientation },
    })
  );
}

function applyPointers(base: PublicPointer[], change: ActivityChange): PublicPointer[] | null {
  return applyKeyed(
    base,
    [change.removedPointers, change.pointers, change.pointerMoves],
    (pointer) => pointer.connectionId,
    (move) => move.connectionId,
    (pointer, move) => ({ ...pointer, ...move })
  );
}

function matchesBase(base: RoomView, update: Update): boolean {
  if (base.epoch !== update.epoch) {
    return false;
  }
  if (base.sequence !== update.baseSequence) {
    return false;
  }
  return update.sequence === update.baseSequence + 1;
}

/** A gap requests a full view; partially applied changes never reach the table. */
export function applyRoomUpdate(base: RoomView | undefined, update: Update): RoomView | null {
  if (!base || !matchesBase(base, update)) {
    return null;
  }
  const snapshot = update.snapshot ? applySnapshot(base.snapshot, update.snapshot) : base.snapshot;
  const carries = applyCarries(base.carries, update.activity);
  const pointers = applyPointers(base.pointers, update.activity);
  if (!snapshot || !carries || !pointers) {
    return null;
  }
  return {
    ...base,
    carries,
    pointers,
    snapshot,
    sequence: update.sequence,
    completedCommandId: update.completedCommandId,
  };
}
