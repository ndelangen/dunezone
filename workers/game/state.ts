import { createHmac } from 'node:crypto';

import { z } from 'zod';

import {
  publicBattleSchema,
  battleFaceSchema,
  storedBattlePlanSchema,
  storedBattleResultSchema,
} from '../../src/shared/play/battle';
import { treacheryHandCounts } from '../../src/shared/play/handCounts';
import { storedControlsSchema } from '../../src/shared/play/inventory';
import type { SpawnContents } from '../../src/shared/play/inventory';
import type { DraftMove, StoredPiece, TableItem, TablePiece } from '../../src/shared/play/model';
import { showsPeeker } from '../../src/shared/play/peeking';
import { gameSnapshotSchema } from '../../src/shared/play/protocol';
import type { GameSnapshot, PublicCarry, PieceAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { gameEndingSchema, gameResultSchema } from '../../src/shared/play/result';
import { storedPieceSchema, storedTableSchema, tableCountSchema, tableIdSchema } from '../../src/shared/play/schema';
import { predictionSchema, predictionChoiceSchema } from '../../src/shared/play/setup';

/** The board layout a stored game's positions are laid out for; see boardLayout.ts. */
export const BOARD_LAYOUT = 2;

const storedBattleSchema = publicBattleSchema.omit({ revealed: true }).extend({
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
export type PeekGrant = z.infer<typeof peekGrantSchema>;

export const storedSnapshotSchema = gameSnapshotSchema
  .omit({
    bank: true,
    battle: true,
    battlePlan: true,
    hand: true,
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
    /* The board size the stored positions were laid out for; every snapshot read through this schema is on the current one. */
    boardLayout: z.literal(BOARD_LAYOUT).default(BOARD_LAYOUT),
  });
export type StoredSnapshot = z.infer<typeof storedSnapshotSchema>;

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

/** Every delivery uses this projection before serialization or delta computation. */
export class RoomProjection {
  private readonly snapshots = new WeakMap<StoredSnapshot, Map<string | undefined, GameSnapshot>>();
  private readonly pieces = new WeakMap<TablePiece, Map<string, TablePiece>>();

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

  snapshot(snapshot: StoredSnapshot, factionId?: string): GameSnapshot {
    let audiences = this.snapshots.get(snapshot);
    if (!audiences) {
      audiences = new Map();
      this.snapshots.set(snapshot, audiences);
    }
    let projected = audiences.get(factionId);
    if (!projected) {
      const { revision, table, versions, phase, phases, roster, stage, draft, swapping, controls, spiceTransfers } =
        snapshot;
      const battle = snapshot.battleState;
      /* An empty side has no faction, so a viewer without one must not match it. */
      const ownSide =
        factionId === undefined ? -1 : (battle?.sides.findIndex((side) => side?.factionId === factionId) ?? -1);
      const plan = (plan: NonNullable<typeof battle>['plans'][number], revealId?: string) => {
        if (!plan) {
          return null;
        }
        const pieceHandles = revealId
          ? Object.fromEntries(
              plan.pieces
                .filter((piece) => piece.kind === 'card')
                .map((piece) => [
                  piece.id,
                  table.pieces.some(
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
      };
      /* Early-revealed cards travel under fresh handles, so nobody can tie them to a hand or to the cards the reveal later lays out. */
      const disclosed = (plan: NonNullable<typeof battle>['plans'][number], battleId: string) => {
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
        const leaderPiece = leader ? plan.pieces.find((piece) => piece.id === plan.leaderId) : undefined;
        return {
          cards,
          ...(leaderPiece ? { leader: leaderPiece } : {}),
          ...(dial
            ? {
                dial: {
                  mode: plan.mode,
                  troops: plan.troops,
                  spice: plan.spice,
                  adjustment: plan.adjustment,
                  strength: plan.strength,
                  faces: plan.faces,
                },
              }
            : {}),
        };
      };
      projected = {
        battle: battle
          ? {
              id: battle.id,
              anchor: battle.anchor,
              territory: battle.territory,
              stage: battle.stage,
              sides: battle.sides,
              deadline: battle.deadline,
              ...(battle.stage === 'revealed'
                ? { revealed: [plan(battle.plans[0], battle.id)!, plan(battle.plans[1], battle.id)!] }
                : { disclosed: [disclosed(battle.plans[0], battle.id), disclosed(battle.plans[1], battle.id)] }),
            }
          : null,
        battlePlan:
          ownSide >= 0 ? plan(battle!.plans[ownSide], battle!.stage === 'revealed' ? battle!.id : undefined) : null,
        ...(factionId
          ? {
              hand: (snapshot.factionInventories[factionId] ?? []).map((piece) =>
                this.piece(piece, true, snapshot.cardHandles, snapshot.pieceHandles)
              ),
            }
          : {}),
        ...(roster
          ? {
              handCounts: treacheryHandCounts(
                heldCards(snapshot),
                roster.seats.flatMap(({ faction }) => (faction ? [faction.id] : []))
              ),
            }
          : {}),
        ...(factionId ? { peek: this.peek(snapshot, factionId) } : {}),
        ...(snapshot.setup ? { setup: snapshot.setup } : {}),
        ...(snapshot.setup
          ? {
              predictions: Object.fromEntries(
                Object.entries(snapshot.privatePredictions).map(([id, prediction]) => {
                  const { choice: _choice, ...publicFacts } = prediction;
                  return [
                    id,
                    prediction.factionId === factionId || prediction.revealedAt !== null ? prediction : publicFacts,
                  ];
                })
              ),
            }
          : {}),
        factionArtwork: snapshot.factionArtwork,
        combatFaces: snapshot.combatFaces,
        battleResults: snapshot.battleResults.map((result) => ({
          ...result,
          plans: [plan(result.plans[0], result.id)!, plan(result.plans[1], result.id)!],
        })),
        revision,
        table: {
          ...table,
          pieces: table.pieces.map((piece) => this.piece(piece, false, snapshot.cardHandles, snapshot.pieceHandles)),
        },
        versions: Object.fromEntries(
          Object.entries(versions).map(([id, version]) => [snapshot.pieceHandles[id] ?? id, version])
        ),
        phase,
        ...(phases ? { phases } : {}),
        ...(roster ? { roster } : {}),
        ...(stage ? { stage } : {}),
        ...(draft ? { draft } : {}),
        ...(swapping ? { swapping } : {}),
        ...(snapshot.bidding ? { bidding: snapshot.bidding } : {}),
        controls: controls && {
          ...controls,
          requests: controls.requests.map((request) => ({ ...request, contents: this.contents(request.contents) })),
        },
        ...(spiceTransfers ? { spiceTransfers } : {}),
        ...(snapshot.ending ? { ending: { ...snapshot.ending, by: publicActor(snapshot.ending.by) } } : {}),
        ...(snapshot.result ? { result: { ...snapshot.result, by: publicActor(snapshot.result.by) } } : {}),
        ...(factionId ? { bank: { factionId, balance: snapshot.factionBanks[factionId] ?? 0 } } : {}),
      };
      audiences.set(factionId, projected);
    }
    return projected;
  }
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
