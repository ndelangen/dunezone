import { createHmac } from 'node:crypto';

import { z } from 'zod';

import {
  publicBattleSchema,
  battleFaceSchema,
  storedBattlePlanSchema,
  storedBattleResultSchema,
} from '../../src/shared/play/battle';
import { nextSnapshot } from '../../src/shared/play/commands';
import { treacheryHandCounts } from '../../src/shared/play/handCounts';
import { storedControlsSchema } from '../../src/shared/play/inventory';
import type { SpawnContents } from '../../src/shared/play/inventory';
import type { DraftMove, StoredPiece, TableItem, TablePiece } from '../../src/shared/play/model';
import { showsPeeker } from '../../src/shared/play/peeking';
import { gameSnapshotSchema, rosterFactionIds, tableForViewer } from '../../src/shared/play/protocol';
import type { GameSnapshot, PublicCarry, PieceAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { gameEndingSchema, gameResultSchema } from '../../src/shared/play/result';
import {
  SPECTATOR_SEAT,
  storedPieceSchema,
  storedTableSchema,
  tableCountSchema,
  tableIdSchema,
} from '../../src/shared/play/schema';
import { predictionSchema, predictionChoiceSchema } from '../../src/shared/play/setup';

/** The board layout a stored game's positions are laid out for; see boardLayout.ts. */
export const BOARD_LAYOUT = 4;

const storedBattleSchema = publicBattleSchema.omit({ revealed: true, disclosed: true }).extend({
  plans: z.tuple([storedBattlePlanSchema.nullable(), storedBattlePlanSchema.nullable()]),
});
export type StoredBattle = z.infer<typeof storedBattleSchema>;

const storedActorSchema = gameResultSchema.shape.by.extend({ userId: tableIdSchema.nullable() });

/** Storage owns the complete spice reserve collection; transport owns only a projected spice reserve. */
/*
 * A peek as it was granted: the piece by its stored id and public handle, its cards by id in order, and its shuffle.
 * The faces show only while all of it still holds, so no command, drop or restore can show the peeker a card it was not granted.
 * A piece that leaves the table through a hand comes back under a new handle, so an old peek cannot follow it.
 */
const peekGrantSchema = z.object({
  pieceId: tableIdSchema,
  handle: tableIdSchema,
  items: z.array(tableIdSchema).default([]),
  shuffleRevision: z.number().int().nullable().default(null),
});
type PeekGrant = z.infer<typeof peekGrantSchema>;

export const storedSnapshotSchema = gameSnapshotSchema
  .omit({
    board: true,
    bank: true,
    battle: true,
    battlePlan: true,
    hand: true,
    handOrder: true,
    peek: true,
    predictions: true,
    ending: true,
    result: true,
  })
  .extend({
    /* The acting account stays in storage for authorization, the directory and deletion; the wire carries seat and name. */
    ending: gameEndingSchema.extend({ by: storedActorSchema }).nullable().default(null),
    result: gameResultSchema.extend({ by: storedActorSchema }).nullable().default(null),
    /* Every stored piece keeps its whole artwork, type included; only a viewer's copy of a hidden card leaves any of it out. */
    table: storedTableSchema,
    controls: storedControlsSchema.optional(),
    privatePredictions: z
      .record(tableIdSchema, predictionSchema.extend({ choice: predictionChoiceSchema }))
      .default({}),
    pendingTraitors: z.array(tableIdSchema).default([]),
    battleState: storedBattleSchema.nullable().default(null),
    factionInventories: z.record(tableIdSchema, z.array(storedPieceSchema)).default({}),
    /*
     * Each faction's own order of its hand and the pieces it has put in a battle plan, by stored id.
     * It is kept apart from the inventory, whose order is the side-table's stacking, so a piece back from a plan takes its old place.
     */
    handOrders: z.record(tableIdSchema, z.array(tableIdSchema)).default({}),
    /* The piece each faction holds open by peeking, as it was granted; projected only to that faction. */
    peeks: z.record(tableIdSchema, peekGrantSchema).default({}),
    /* The faces a faction's prediction card is dealt with when its prediction locks (#1753); stored only, never projected. */
    predictionFaces: z
      .record(tableIdSchema, z.object({ front: z.string().url().nullable(), back: z.string().url() }))
      .default({}),
    /* Spice reserves and battle faces are seeded per faction when a game fixes its seating, never by the schema. */
    /* Persisted key in Durable Object storage, kept as `combatFaces`; the glossary says battle. */
    combatFaces: z.record(tableIdSchema, z.array(battleFaceSchema)).default({}),
    battleResults: z.array(storedBattleResultSchema).default([]),
    /* Each faction's spice reserve (see CONTEXT.md); the `factionBanks` key is kept for stored game state. */
    factionBanks: z.record(tableIdSchema, tableCountSchema).default({}),
    /* Public card handles change independently of retained card identity. Never serialized. */
    cardHandles: z.record(tableIdSchema, tableIdSchema).default({}),
    pieceHandles: z.record(tableIdSchema, tableIdSchema).default({}),
    /* Every card front the game has held, sorted; it only grows, so a hidden card that leaves the game never tells which one it was. */
    cardFaces: z.array(z.string().url()).default([]),
    /* The board size the stored positions were laid out for; every snapshot read through this schema is on the current one. */
    boardLayout: z.literal(BOARD_LAYOUT).default(BOARD_LAYOUT),
  });
export type StoredSnapshot = z.infer<typeof storedSnapshotSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function idOf(entry: unknown) {
  const id = isPlainObject(entry) ? entry.id : undefined;
  return typeof id === 'string' ? id : undefined;
}

/* The entries by id when every entry carries a distinct one, so an entry that moved in its list is still found. */
function entriesById(entries: readonly unknown[]): Map<string, unknown> | undefined {
  const byId = new Map<string, unknown>();
  for (const entry of entries) {
    const id = idOf(entry);
    if (id === undefined || byId.has(id)) {
      return undefined;
    }
    byId.set(id, entry);
  }
  return byId;
}

/* A list with each entry matched to the previous entry at its index, or to the previous entry with its id when that one has moved. */
function listWithUnchangedParts(previous: readonly unknown[], next: readonly unknown[]): readonly unknown[] {
  let byId: Map<string, unknown> | undefined | null;
  let entries: unknown[] | undefined;
  for (let index = 0; index < next.length; index++) {
    const entry = next[index];
    let before = previous[index];
    const id = idOf(entry);
    if (id !== undefined && idOf(before) !== id) {
      byId ??= entriesById(previous) ?? null;
      before = byId?.get(id);
    }
    const kept = withUnchangedParts(before, entry);
    /* Every entry before the first one that changed is the previous list's own. */
    entries ??= index < previous.length && kept === previous[index] ? undefined : previous.slice(0, index);
    entries?.push(kept);
  }
  return entries ?? (previous.length === next.length ? previous : previous.slice(0, next.length));
}

/* An object whose keys come in the order `next` has them, each part kept from `previous` where it deep-equals. */
function objectWithUnchangedParts(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = Object.keys(next);
  const previousKeys = Object.keys(previous);
  let parts: Record<string, unknown> | undefined;
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]!;
    const kept = Object.hasOwn(previous, key) ? withUnchangedParts(previous[key], next[key]) : next[key];
    if (!parts && (previousKeys[index] !== key || kept !== previous[key])) {
      parts = {};
      for (const earlier of keys.slice(0, index)) {
        parts[earlier] = previous[earlier];
      }
    }
    if (parts) {
      parts[key] = kept;
    }
  }
  if (parts || keys.length === previousKeys.length) {
    return parts ?? previous;
  }
  return Object.fromEntries(keys.map((key) => [key, previous[key]]));
}

/**
 * `next` with every part that deep-equals the matching part of `previous` replaced by that part, so it stays the same object.
 * Projection caches and the delta's identity check then see an unchanged part as unchanged, however it was rebuilt.
 * Objects match by key, with key order and keys set to undefined counted.
 * Lists match by index, or by id for an entry that moved.
 */
export function withUnchangedParts<T>(previous: unknown, next: T): T {
  if (Object.is(previous, next)) {
    return next;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    return listWithUnchangedParts(previous, next) as T;
  }
  /* A key named `__proto__` would set the copy's prototype instead of a property, so such an object is left as it is. */
  if (!isPlainObject(previous) || !isPlainObject(next) || Object.hasOwn(next, '__proto__')) {
    return next;
  }
  return objectWithUnchangedParts(previous, next) as T;
}

/**
 * A command's next snapshot, validated, with every part the command left alone still the object the previous snapshot held.
 * The parse rebuilds every object, so without this an untouched piece would miss the projection's cache and look changed to every delta.
 */
export function validatedSnapshot(previous: StoredSnapshot, next: unknown): StoredSnapshot {
  return withUnchangedParts(previous, storedSnapshotSchema.parse(next));
}

/** The next revision of a snapshot whose table changed at most in its pieces, with no event of its own. */
export function revised(snapshot: StoredSnapshot, pieces = snapshot.table.pieces): StoredSnapshot {
  return nextSnapshot(snapshot, { ...tableForViewer(snapshot, SPECTATOR_SEAT), pieces });
}

/** The faction a seat holds by its id, as the roster fixed it; nothing when no seat holds it. */
export function seatedFaction(snapshot: GameSnapshot, factionId: string) {
  return snapshot.roster?.seats.find((seat) => seat.faction?.id === factionId)?.faction;
}

/** The pieces a faction orders by hand: its plain hand, leaving the side-table out, and what it put in its own battle plan. */
export function orderablePieces(snapshot: StoredSnapshot, factionId: string): StoredPiece[] {
  const battle = snapshot.battleState;
  /* Once revealed, the plan's pieces are everyone's to see and take, so they leave the faction's order. */
  const side =
    battle && battle.stage !== 'revealed'
      ? battle.sides.findIndex((candidate) => candidate?.factionId === factionId)
      : -1;
  return [
    ...(snapshot.factionInventories[factionId] ?? []).filter((piece) => !piece.hiddenZone),
    ...(side >= 0 ? (battle!.plans[side]?.pieces ?? []) : []),
  ];
}

/* The viewer's own order, by wire id, naming only pieces it still holds or planned; absent until the faction first orders its hand. */
function handOrderFor(snapshot: StoredSnapshot, factionId: string) {
  const held = new Set(orderablePieces(snapshot, factionId).map((piece) => piece.id));
  const order = (snapshot.handOrders[factionId] ?? []).filter((id) => held.has(id));
  return order.length ? { handOrder: order.map((id) => snapshot.pieceHandles[id] ?? id) } : {};
}

/** Retired wire handles never name a live piece again; storage and receipts keep their identities. */
export function internalPieceId(snapshot: StoredSnapshot, wireId: string): string {
  for (const [id, handle] of Object.entries(snapshot.pieceHandles)) {
    if (handle === wireId) {
      return id;
    }
  }
  if (snapshot.pieceHandles[wireId]) {
    throw new GameRejection('That card handle has expired.');
  }
  return wireId;
}

export function internalAction<Action extends PieceAction>(snapshot: StoredSnapshot, action: Action): Action {
  if (action.kind === 'hand-order') {
    return {
      ...action,
      pieceId: internalPieceId(snapshot, action.pieceId),
      before: action.before && internalPieceId(snapshot, action.before),
    };
  }
  if ('pieceId' in action) {
    return { ...action, pieceId: internalPieceId(snapshot, action.pieceId) };
  }
  if (action.kind === 'battle-plan') {
    return {
      ...action,
      plan: { ...action.plan, cardIds: action.plan.cardIds.map((id) => internalPieceId(snapshot, id)) },
    };
  }
  if (action.kind === 'battle-disclose' && action.disclosure.element === 'card') {
    return {
      ...action,
      disclosure: { ...action.disclosure, cardId: internalPieceId(snapshot, action.disclosure.cardId) },
    };
  }
  return action;
}

/**
 * A hidden card as a viewer receives it: its back and the word printed on that back.
 * Its front, name and type stay behind, so face-down cards in one stack look alike even when their fronts differ in kind.
 */
function concealed({ back, backName }: NonNullable<TableItem['artwork']>) {
  return { back, ...(backName ? { backName } : {}) };
}

/** The grant a peek at a piece holds: what the faction may see of it, exactly as the piece stands now. */
export function peekGrant(snapshot: StoredSnapshot, piece: StoredPiece): PeekGrant {
  return {
    pieceId: piece.id,
    handle: snapshot.pieceHandles[piece.id] ?? piece.id,
    items: piece.items.map((item) => item.id),
    shuffleRevision: piece.shuffleRevision ?? null,
  };
}

function sameOrder(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/* Whether a piece still stands as its peek was granted, with everyone able to see that the faction peeked. */
function grantHolds(snapshot: StoredSnapshot, grant: PeekGrant, piece: StoredPiece, factionId: string) {
  const now = peekGrant(snapshot, piece);
  const samePiece = now.handle === grant.handle && now.shuffleRevision === grant.shuffleRevision;
  return samePiece && sameOrder(now.items, grant.items) && showsPeeker(piece, factionId);
}

/**
 * The piece a faction holds open by peeking, while it lies on the table exactly as the peek was granted.
 * A shuffle, a card added, drawn or moved, a new handle or a new phase each end it;
 * the peeker's own arrangement and pull renew the grant.
 */
export function openPeek(snapshot: StoredSnapshot, factionId: string, pieceId?: string): StoredPiece | undefined {
  const grant = snapshot.peeks[factionId];
  if (!grant || (pieceId !== undefined && grant.pieceId !== pieceId)) {
    return undefined;
  }
  const piece = snapshot.table.pieces.find((candidate) => candidate.id === grant.pieceId && !candidate.inventory);
  return piece && grantHolds(snapshot, grant, piece, factionId) ? piece : undefined;
}

function cardFronts(pieces: readonly StoredPiece[]) {
  return pieces.flatMap((piece) =>
    piece.kind === 'card' ? piece.items.flatMap((item) => (item.artwork?.front ? [item.artwork.front] : [])) : []
  );
}

/** The fronts of every card a snapshot holds: on the table, in a hand and in a battle plan. */
function heldCardFronts(snapshot: StoredSnapshot) {
  return [
    ...cardFronts(snapshot.table.pieces),
    ...Object.values(snapshot.factionInventories).flatMap(cardFronts),
    ...(snapshot.battleState?.plans.flatMap((plan) => (plan ? cardFronts(plan.pieces) : [])) ?? []),
  ];
}

function sortedFaces(faces: Iterable<string>) {
  return [...new Set(faces)].sort((a, b) => (a < b ? -1 : Number(a > b)));
}

/**
 * The faces a commit leaves known: those known before, the fronts the table held before and those it holds after.
 * A card the commit took out of the game stays among them, so the list never tells which hidden card left.
 */
export function withKnownCardFaces(before: StoredSnapshot, next: StoredSnapshot): StoredSnapshot {
  return {
    ...next,
    cardFaces: sortedFaces([
      ...before.cardFaces,
      ...heldCardFronts(before),
      ...next.cardFaces,
      ...heldCardFronts(next),
    ]),
  };
}

/** Every delivery uses this projection before serialization or delta computation. */
export class RoomProjection {
  private readonly snapshots = new WeakMap<StoredSnapshot, Map<string | undefined, GameSnapshot>>();
  private readonly pieces = new WeakMap<TablePiece, Map<string, TablePiece>>();
  private readonly shared = new WeakMap<StoredSnapshot, SharedProjection>();
  /* The audience-independent parts last projected, kept so a part a command left alone stays the same object for every delta. */
  private lastShared: SharedProjection | undefined;
  /* The last list of card faces sent, kept so an unchanged list is the same array and a delta leaves it out. */
  private knownFaces: string[] = [];

  constructor(private readonly secret: string) {}

  private cardId(id: string, handles: StoredSnapshot['cardHandles'] = {}) {
    return `card-${createHmac('sha256', this.secret)
      .update(handles[id] ?? id)
      .digest('hex')}`;
  }

  piece(
    piece: TablePiece,
    visible = false,
    handles: StoredSnapshot['cardHandles'] = {},
    pieceHandles: StoredSnapshot['pieceHandles'] = {}
  ): TablePiece {
    if (piece.kind !== 'card') {
      return piece;
    }
    const handleKey = [
      pieceHandles[piece.id] ?? piece.id,
      ...piece.items.map((item) => handles[item.id] ?? item.id),
    ].join(',');
    let projected = visible ? undefined : this.pieces.get(piece)?.get(handleKey);
    if (!projected) {
      projected = {
        ...piece,
        id: pieceHandles[piece.id] ?? piece.id,
        items: piece.items.map((item) => {
          const hidden = !visible && (!!piece.inventory || !item.faceUp);
          return {
            id: this.cardId(item.id, handles),
            faceUp: !hidden,
            ...(item.artwork ? { artwork: hidden ? concealed(item.artwork) : item.artwork } : {}),
            ...(item.peekedBy?.length ? { peekedBy: item.peekedBy } : {}),
          };
        }),
      };
      if (!visible) {
        const variants = this.pieces.get(piece) ?? new Map<string, TablePiece>();
        variants.set(handleKey, projected);
        this.pieces.set(piece, variants);
      }
    }
    return projected;
  }

  /** Every card face a page may load ahead of showing it: the whole set, in no order that ties a face to a card. */
  private cardFaces(snapshot: StoredSnapshot) {
    const faces = sortedFaces([...snapshot.cardFaces, ...heldCardFronts(snapshot)]);
    if (faces.length !== this.knownFaces.length || faces.some((face, index) => face !== this.knownFaces[index])) {
      this.knownFaces = faces;
    }
    return this.knownFaces;
  }

  /** The piece a faction holds open, every face showing, while it still lies on the table. */
  private peek(snapshot: StoredSnapshot, factionId: string) {
    const piece = openPeek(snapshot, factionId);
    return piece ? { piece: this.piece(piece, true, snapshot.cardHandles, snapshot.pieceHandles) } : null;
  }

  contents(contents: SpawnContents): SpawnContents {
    return { ...contents, pieces: contents.pieces.map((piece) => this.piece(piece)) };
  }

  carries(carries: PublicCarry[], snapshot: StoredSnapshot) {
    const id = (id: string) => snapshot.pieceHandles[id] ?? id;
    return carries.map((carry) => ({
      ...carry,
      held: this.piece(carry.held, false, snapshot.cardHandles, snapshot.pieceHandles),
      reservedIds: carry.reservedIds.map(id),
      ...(carry.riderIds ? { riderIds: carry.riderIds.map(id) } : {}),
      withdrawnCounts: Object.fromEntries(
        Object.entries(carry.withdrawnCounts).map(([key, count]) => [id(key), count])
      ),
    }));
  }

  draft(draft: DraftMove, snapshot: StoredSnapshot): DraftMove {
    const cards = new Set(
      snapshot.table.pieces
        .filter((piece) => piece.kind === 'card')
        .flatMap((piece) => piece.items.map((item) => item.id))
    );
    const id = (value: string) => (cards.has(value) ? this.cardId(value, snapshot.cardHandles) : value);
    return {
      ...draft,
      pieceId: snapshot.pieceHandles[draft.pieceId] ?? draft.pieceId,
      sourcePieceId: snapshot.pieceHandles[draft.sourcePieceId] ?? draft.sourcePieceId,
      targetPieceId: draft.targetPieceId && (snapshot.pieceHandles[draft.targetPieceId] ?? draft.targetPieceId),
      pickedUpItemIds: draft.pickedUpItemIds.map(id),
      withdrawals: draft.withdrawals.map((withdrawal) => ({
        ...withdrawal,
        sourcePieceId: snapshot.pieceHandles[withdrawal.sourcePieceId] ?? withdrawal.sourcePieceId,
        itemId: id(withdrawal.itemId),
      })),
    };
  }

  /** `faces` is the game whose card faces go along; a history step passes the live game (see Session.historyFor). */
  snapshot(snapshot: StoredSnapshot, factionId?: string, faces: StoredSnapshot = snapshot): GameSnapshot {
    let audiences = this.snapshots.get(snapshot);
    if (!audiences) {
      audiences = new Map();
      this.snapshots.set(snapshot, audiences);
    }
    let projected = audiences.get(factionId);
    if (!projected) {
      projected = this.project(snapshot, factionId, faces);
      audiences.set(factionId, projected);
    }
    return projected;
  }

  /**
   * The parts of a projection no audience changes, built once for each stored snapshot so every audience shares them.
   * Each part that deep-equals the one projected last is that object again, so a delta finds it unchanged at once.
   */
  private sharedParts(snapshot: StoredSnapshot): SharedProjection {
    let parts = this.shared.get(snapshot);
    if (!parts) {
      const { table, versions, controls, roster } = snapshot;
      parts = withUnchangedParts<SharedProjection>(this.lastShared, {
        battle: snapshot.battleState ? this.battle(snapshot, snapshot.battleState) : null,
        handCounts: roster ? treacheryHandCounts(heldCards(snapshot), rosterFactionIds(roster)) : undefined,
        battleResults: snapshot.battleResults.map((result) => ({
          ...result,
          plans: [this.plan(snapshot, result.plans[0], result.id)!, this.plan(snapshot, result.plans[1], result.id)!],
        })),
        table: {
          ...table,
          pieces: table.pieces.map((piece) => this.piece(piece, false, snapshot.cardHandles, snapshot.pieceHandles)),
        },
        versions: Object.fromEntries(
          Object.entries(versions).map(([id, version]) => [snapshot.pieceHandles[id] ?? id, version])
        ),
        controls: controls && {
          ...controls,
          requests: controls.requests.map((request) => ({ ...request, contents: this.contents(request.contents) })),
        },
      });
      this.lastShared = parts;
      this.shared.set(snapshot, parts);
    }
    return parts;
  }

  private project(snapshot: StoredSnapshot, factionId: string | undefined, faces: StoredSnapshot): GameSnapshot {
    const { revision, phase, phases, roster, stage, draft, swapping, spiceTransfers } = snapshot;
    const battle = snapshot.battleState;
    const shared = this.sharedParts(snapshot);
    /* An empty side has no faction, so a viewer without one must not match it. */
    const ownSide =
      factionId === undefined ? -1 : (battle?.sides.findIndex((side) => side?.factionId === factionId) ?? -1);
    return {
      battle: shared.battle,
      battlePlan:
        ownSide >= 0
          ? this.plan(snapshot, battle!.plans[ownSide], battle!.stage === 'revealed' ? battle!.id : undefined)
          : null,
      ...(factionId
        ? {
            hand: (snapshot.factionInventories[factionId] ?? []).map((piece) =>
              this.piece(piece, true, snapshot.cardHandles, snapshot.pieceHandles)
            ),
          }
        : {}),
      ...(factionId ? handOrderFor(snapshot, factionId) : {}),
      ...(shared.handCounts ? { handCounts: shared.handCounts } : {}),
      ...(factionId ? { peek: this.peek(snapshot, factionId) } : {}),
      ...(snapshot.setup ? { setup: snapshot.setup } : {}),
      ...(snapshot.setup ? { predictions: predictionsFor(snapshot, factionId) } : {}),
      factionArtwork: snapshot.factionArtwork,
      cardFaces: this.cardFaces(faces),
      combatFaces: snapshot.combatFaces,
      battleResults: shared.battleResults,
      revision,
      table: shared.table,
      versions: shared.versions,
      phase,
      ...(phases ? { phases } : {}),
      ...(roster ? { roster } : {}),
      ...(stage ? { stage } : {}),
      ...(draft ? { draft } : {}),
      ...(swapping ? { swapping } : {}),
      ...(snapshot.bidding ? { bidding: snapshot.bidding } : {}),
      ...(snapshot.alliances ? { alliances: snapshot.alliances } : {}),
      ...(snapshot.lastTurn ? { lastTurn: snapshot.lastTurn } : {}),
      ...(snapshot.movement ? { movement: snapshot.movement } : {}),
      ...(snapshot.tints?.length ? { tints: snapshot.tints } : {}),
      controls: shared.controls,
      ...(spiceTransfers ? { spiceTransfers } : {}),
      ...(snapshot.ending ? { ending: { ...snapshot.ending, by: publicActor(snapshot.ending.by) } } : {}),
      ...(snapshot.result ? { result: { ...snapshot.result, by: publicActor(snapshot.result.by) } } : {}),
      ...(factionId ? { bank: { factionId, balance: snapshot.factionBanks[factionId] ?? 0 } } : {}),
    };
  }

  /** The battle everyone sees: both plans once revealed, and until then only what each side disclosed early. */
  private battle(snapshot: StoredSnapshot, battle: BattleState): NonNullable<GameSnapshot['battle']> {
    return {
      id: battle.id,
      anchor: battle.anchor,
      territory: battle.territory,
      stage: battle.stage,
      sides: battle.sides,
      deadline: battle.deadline,
      ...(battle.stage === 'revealed'
        ? {
            revealed: [
              this.plan(snapshot, battle.plans[0], battle.id)!,
              this.plan(snapshot, battle.plans[1], battle.id)!,
            ],
          }
        : { disclosed: [this.disclosed(battle.plans[0], battle.id), this.disclosed(battle.plans[1], battle.id)] }),
    };
  }

  private plan(snapshot: StoredSnapshot, plan: BattlePlan, revealId?: string) {
    if (!plan) {
      return null;
    }
    const pieceHandles = revealId
      ? Object.fromEntries(
          plan.pieces
            .filter((piece) => piece.kind === 'card')
            .map((piece) => [
              piece.id,
              snapshot.table.pieces.some(
                (live) =>
                  live.id === piece.id &&
                  live.battleOverlay === revealId &&
                  live.items.length === piece.items.length &&
                  live.items.every((item, index) => item.faceUp && item.id === piece.items[index]?.id)
              )
                ? (snapshot.pieceHandles[piece.id] ?? piece.id)
                : this.cardId(`reveal-piece-${revealId}-${piece.id}`),
            ])
        )
      : snapshot.pieceHandles;
    return {
      ...plan,
      cardIds: plan.cardIds.map((id) => pieceHandles[id] ?? id),
      disclosed: { ...plan.disclosed, cardIds: plan.disclosed.cardIds.map((id) => pieceHandles[id] ?? id) },
      pieces: plan.pieces.map((piece) =>
        this.piece(
          piece,
          true,
          revealId === undefined
            ? snapshot.cardHandles
            : Object.fromEntries(piece.items.map((item) => [item.id, `reveal-${revealId}-${item.id}`])),
          pieceHandles
        )
      ),
    };
  }

  /* Early-revealed cards travel under fresh handles, so nobody can tie them to a hand or to the cards the reveal later lays out. */
  private disclosed(plan: BattlePlan, battleId: string) {
    if (!plan) {
      return null;
    }
    const { leader, dial, cardIds } = plan.disclosed;
    const cards = plan.pieces
      .filter((piece) => cardIds.includes(piece.id))
      .map((piece) =>
        this.piece(
          piece,
          true,
          Object.fromEntries(piece.items.map((item) => [item.id, `disclosed-${battleId}-${item.id}`])),
          { [piece.id]: this.cardId(`disclosed-piece-${battleId}-${piece.id}`) }
        )
      );
    const leaders = leader ? plan.pieces.filter((piece) => plan.leaderIds.includes(piece.id)) : [];
    return {
      cards,
      ...(leaders.length ? { leaders } : {}),
      ...(dial ? { dial: { strength: plan.strength } } : {}),
    };
  }
}

type BattleState = NonNullable<StoredSnapshot['battleState']>;
type BattlePlan = BattleState['plans'][number];
type SharedProjection = Pick<
  GameSnapshot,
  'battle' | 'handCounts' | 'battleResults' | 'table' | 'versions' | 'controls'
>;

/** Each prediction in full for its own faction or once revealed; everyone else sees it without its choice. */
function predictionsFor(snapshot: StoredSnapshot, factionId: string | undefined) {
  return Object.fromEntries(
    Object.entries(snapshot.privatePredictions).map(([id, prediction]) => {
      const { choice: _choice, ...publicFacts } = prediction;
      return [id, prediction.factionId === factionId || prediction.revealedAt !== null ? prediction : publicFacts];
    })
  );
}

/**
 * Every faction's hand as its count must read: a card committed to a battle plan stays in the count until the reveal puts it on the table.
 * So editing a secret plan never changes what opponents see (#2021).
 */
function heldCards(snapshot: StoredSnapshot): StoredSnapshot['factionInventories'] {
  const battle = snapshot.battleState;
  if (!battle || battle.stage === 'revealed') {
    return snapshot.factionInventories;
  }
  const held = { ...snapshot.factionInventories };
  battle.sides.forEach((side, index) => {
    const pieces = battle.plans[index]?.pieces ?? [];
    if (side && pieces.length) {
      held[side.factionId] = [...(held[side.factionId] ?? []), ...pieces];
    }
  });
  return held;
}

function publicActor({ seat, name }: { seat: string; name: string }) {
  return { seat, name };
}
