import type {
  ActivityChange,
  GameSnapshot,
  PublicCarry,
  PublicPointer,
  ServerMessage,
  SnapshotChange,
} from './protocol';

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

function snapshotChange(base: GameSnapshot, next: GameSnapshot): SnapshotChange | undefined {
  if (base === next) {
    return;
  }
  const before = new Map(base.table.pieces.map((piece) => [piece.id, piece]));
  const order = next.table.pieces.map((piece) => piece.id);
  const ids = new Set(order);
  const { pieces: _pieces, ...metadata } = next.table;
  return {
    baseRevision: base.revision,
    revision: next.revision,
    phase: next.phase,
    table: Object.fromEntries(
      Object.entries(metadata).filter(([key, value]) => !same(base.table[key as keyof typeof metadata], value))
    ),
    pieces: next.table.pieces.filter((piece) => !same(before.get(piece.id), piece)),
    removedPieces: [...before.keys()].filter((id) => !ids.has(id)),
    ...(same(
      base.table.pieces.map((piece) => piece.id),
      order
    )
      ? {}
      : { pieceOrder: order }),
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

function carryChanges(base: PublicCarry[], next: PublicCarry[]) {
  const before = new Map(base.map((carry) => [carry.id, carry]));
  const carries: ActivityChange['carries'] = [];
  const carryMoves: ActivityChange['carryMoves'] = [];
  for (const carry of next) {
    const previous = before.get(carry.id);
    before.delete(carry.id);
    if (!previous || !same(carryDefinition(previous), carryDefinition(carry))) {
      carries.push(carry);
    } else if (!same(previous, carry)) {
      carryMoves.push({
        id: carry.id,
        position: carry.held.position,
        orientation: carry.held.orientation,
        expiresAt: carry.expiresAt,
        sourceSeq: carry.sourceSeq,
      });
    }
  }
  return { carries, carryMoves, removedCarries: [...before.keys()] };
}

function pointerChanges(base: PublicPointer[], next: PublicPointer[]) {
  const before = new Map(base.map((pointer) => [pointer.connectionId, pointer]));
  const pointers: ActivityChange['pointers'] = [];
  const pointerMoves: ActivityChange['pointerMoves'] = [];
  for (const pointer of next) {
    const previous = before.get(pointer.connectionId);
    before.delete(pointer.connectionId);
    if (!previous || !same(pointerDefinition(previous), pointerDefinition(pointer))) {
      pointers.push(pointer);
    } else if (!same(previous, pointer)) {
      pointerMoves.push({
        connectionId: pointer.connectionId,
        position: pointer.position,
        updatedAt: pointer.updatedAt,
        sourceSeq: pointer.sourceSeq,
      });
    }
  }
  return { pointers, pointerMoves, removedPointers: [...before.keys()] };
}

/** Transport changes contain only server-owned public state, never client commands or authority. */
export function frameChange(base: RoomFrame, next: RoomFrame): Pick<Update, 'snapshot' | 'activity'> {
  return {
    snapshot: snapshotChange(base.snapshot, next.snapshot),
    activity: { ...carryChanges(base.carries, next.carries), ...pointerChanges(base.pointers, next.pointers) },
  };
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

function applyPieces(base: GameSnapshot['table']['pieces'], change: SnapshotChange) {
  const pieces = patchEntries(
    base.map((piece) => [piece.id, piece]),
    change.removedPieces,
    change.pieces.map((piece) => [piece.id, piece])
  );
  const order = change.pieceOrder ?? [...pieces.keys()];
  if (order.length !== pieces.size || new Set(order).size !== order.length) {
    return null;
  }
  if (order.some((id) => !pieces.has(id))) {
    return null;
  }
  return order.map((id) => pieces.get(id)!);
}

function applySnapshot(base: GameSnapshot, change: SnapshotChange): GameSnapshot | null {
  if (base.revision !== change.baseRevision || change.revision < change.baseRevision) {
    return null;
  }
  const pieces = applyPieces(base.table.pieces, change);
  if (!pieces) {
    return null;
  }
  const versions = { ...base.versions, ...change.versions };
  for (const id of change.removedVersions) {
    delete versions[id];
  }
  return {
    revision: change.revision,
    phase: change.phase,
    versions,
    table: { ...base.table, ...change.table, pieces },
  };
}

function applyCarries(base: PublicCarry[], change: ActivityChange): PublicCarry[] | null {
  const carries = patchEntries(
    base.map((carry) => [carry.id, carry]),
    change.removedCarries,
    change.carries.map((carry) => [carry.id, carry])
  );
  for (const move of change.carryMoves) {
    const carry = carries.get(move.id);
    if (!carry) {
      return null;
    }
    carries.set(move.id, {
      ...carry,
      expiresAt: move.expiresAt,
      sourceSeq: move.sourceSeq,
      held: { ...carry.held, position: move.position, orientation: move.orientation },
    });
  }
  return [...carries.values()];
}

function applyPointers(base: PublicPointer[], change: ActivityChange): PublicPointer[] | null {
  const pointers = patchEntries(
    base.map((pointer) => [pointer.connectionId, pointer]),
    change.removedPointers,
    change.pointers.map((pointer) => [pointer.connectionId, pointer])
  );
  for (const move of change.pointerMoves) {
    const pointer = pointers.get(move.connectionId);
    if (!pointer) {
      return null;
    }
    pointers.set(move.connectionId, { ...pointer, ...move });
  }
  return [...pointers.values()];
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
  if (!snapshot) {
    return null;
  }
  if (!carries || !pointers) {
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
