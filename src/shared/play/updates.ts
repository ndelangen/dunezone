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
function same(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const left = Object.entries(a);
  return (
    left.length === Object.keys(b).length &&
    left.every(([key, value]) => Object.hasOwn(b, key) && same(value, b[key as keyof typeof b]))
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

function activityChange(base: RoomFrame, next: RoomFrame): ActivityChange {
  const carries = new Map(base.carries.map((carry) => [carry.id, carry]));
  const pointers = new Map(base.pointers.map((pointer) => [pointer.connectionId, pointer]));
  const result: ActivityChange = {
    carries: [],
    carryMoves: [],
    removedCarries: [],
    pointers: [],
    pointerMoves: [],
    removedPointers: [],
  };
  for (const carry of next.carries) {
    const previous = carries.get(carry.id);
    carries.delete(carry.id);
    if (!previous || !same(carryDefinition(previous), carryDefinition(carry))) {
      result.carries.push(carry);
    } else if (!same(previous, carry)) {
      result.carryMoves.push({
        id: carry.id,
        position: carry.held.position,
        orientation: carry.held.orientation,
        expiresAt: carry.expiresAt,
        sourceSeq: carry.sourceSeq,
      });
    }
  }
  for (const pointer of next.pointers) {
    const previous = pointers.get(pointer.connectionId);
    pointers.delete(pointer.connectionId);
    if (!previous || !same(pointerDefinition(previous), pointerDefinition(pointer))) {
      result.pointers.push(pointer);
    } else if (!same(previous, pointer)) {
      result.pointerMoves.push({
        connectionId: pointer.connectionId,
        position: pointer.position,
        updatedAt: pointer.updatedAt,
        sourceSeq: pointer.sourceSeq,
      });
    }
  }
  result.removedCarries = [...carries.keys()];
  result.removedPointers = [...pointers.keys()];
  return result;
}

/** Transport changes contain only server-owned public state, never client commands or authority. */
export function frameChange(base: RoomFrame, next: RoomFrame): Pick<Update, 'snapshot' | 'activity'> {
  return { snapshot: snapshotChange(base.snapshot, next.snapshot), activity: activityChange(base, next) };
}

function applySnapshot(base: GameSnapshot, change: SnapshotChange): GameSnapshot | null {
  if (base.revision !== change.baseRevision || change.revision < change.baseRevision) {
    return null;
  }
  const pieces = new Map(base.table.pieces.map((piece) => [piece.id, piece]));
  for (const id of change.removedPieces) {
    pieces.delete(id);
  }
  for (const piece of change.pieces) {
    pieces.set(piece.id, piece);
  }
  const order = change.pieceOrder ?? [...pieces.keys()];
  if (order.length !== pieces.size || new Set(order).size !== order.length || order.some((id) => !pieces.has(id))) {
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
    table: { ...base.table, ...change.table, pieces: order.map((id) => pieces.get(id)!) },
  };
}

function applyActivity(base: RoomFrame, change: ActivityChange): Pick<RoomFrame, 'carries' | 'pointers'> | null {
  const carries = new Map(base.carries.map((carry) => [carry.id, carry]));
  const pointers = new Map(base.pointers.map((pointer) => [pointer.connectionId, pointer]));
  for (const id of change.removedCarries) {
    carries.delete(id);
  }
  for (const id of change.removedPointers) {
    pointers.delete(id);
  }
  for (const carry of change.carries) {
    carries.set(carry.id, carry);
  }
  for (const pointer of change.pointers) {
    pointers.set(pointer.connectionId, pointer);
  }
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
  for (const move of change.pointerMoves) {
    const pointer = pointers.get(move.connectionId);
    if (!pointer) {
      return null;
    }
    pointers.set(move.connectionId, { ...pointer, ...move });
  }
  return { carries: [...carries.values()], pointers: [...pointers.values()] };
}

/** A gap requests a full view; partially applied changes never reach the table. */
export function applyRoomUpdate(base: RoomView | undefined, update: Update): RoomView | null {
  if (
    !base ||
    base.epoch !== update.epoch ||
    base.sequence !== update.baseSequence ||
    update.sequence !== update.baseSequence + 1
  ) {
    return null;
  }
  const snapshot = update.snapshot ? applySnapshot(base.snapshot, update.snapshot) : base.snapshot;
  const activity = applyActivity(base, update.activity);
  if (!snapshot || !activity) {
    return null;
  }
  return { ...base, ...activity, snapshot, sequence: update.sequence, completedCommandId: update.completedCommandId };
}
