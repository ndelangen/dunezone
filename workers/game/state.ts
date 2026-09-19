import { createHmac } from 'node:crypto';

import { z } from 'zod';

import {
  publicBattleSchema,
  battlePlanSchema,
  combatFaceSchema,
  fixtureCombatFaces,
  battleResultSchema,
} from '../../src/shared/play/battle';
import type { BattlePlan, CombatFace } from '../../src/shared/play/battle';
import type { SpawnContents } from '../../src/shared/play/inventory';
import type { DraftMove, TablePiece } from '../../src/shared/play/model';
import { gameSnapshotSchema } from '../../src/shared/play/protocol';
import type { GameSnapshot, PublicCarry } from '../../src/shared/play/protocol';
import { tableCountSchema, tableIdSchema, tablePieceSchema } from '../../src/shared/play/schema';

const storedBattleSchema = publicBattleSchema.omit({ revealed: true }).extend({
  plans: z.tuple([battlePlanSchema.nullable(), battlePlanSchema.nullable()]),
});
export type StoredBattle = z.infer<typeof storedBattleSchema>;

/** Storage owns the complete bank collection; transport owns only a projected bank. */
const storedSnapshotBaseSchema = gameSnapshotSchema
  .omit({ bank: true, battle: true, battlePlan: true, hand: true })
  .extend({
    battleState: storedBattleSchema.nullable().default(null),
    factionInventories: z.record(tableIdSchema, z.array(tablePieceSchema)).default({}),
    /* Banks and combat faces are seeded per faction when a game fixes its seating, never by the schema. */
    combatFaces: z.record(tableIdSchema, z.array(combatFaceSchema)).default({}),
    battleResults: z.array(battleResultSchema).default([]),
    factionBanks: z.record(tableIdSchema, tableCountSchema).default({}),
    /* Public card handles change independently of retained card identity. Never serialized. */
    cardHandles: z.record(tableIdSchema, tableIdSchema).default({}),
  });

function isLegacyFixturePair(factionId: string, faces: CombatFace[]) {
  if (faces.length !== 2) {
    return false;
  }
  return ['front', 'reverse'].every((faceName, index) => {
    const face = faces[index];
    return (
      face.id === `${factionId}-${faceName}` &&
      face.name === `${factionId} ${faceName}` &&
      face.capable &&
      face.strength === 0.5 &&
      face.fundedStrength === 1 &&
      face.fundingCost === 1 &&
      face.image === `/vector/troop/${factionId}.svg`
    );
  });
}

function currentFixtureFaces(factionId: string, faces: CombatFace[]) {
  return isLegacyFixturePair(factionId, faces) ? fixtureCombatFaces(factionId) : faces;
}

function currentFixturePlan(factionId: string, plan: BattlePlan | null) {
  if (!plan || !isLegacyFixturePair(factionId, plan.faces)) {
    return plan;
  }
  const troops = plan.troops.reduce(
    (total, troop) => ({
      faceId: `${factionId}-front`,
      undialed: total.undialed + troop.undialed,
      dialed: total.dialed + troop.dialed,
    }),
    { faceId: `${factionId}-front`, undialed: 0, dialed: 0 }
  );
  return {
    ...plan,
    faces: fixtureCombatFaces(factionId),
    troops: troops.undialed || troops.dialed ? [troops] : [],
  };
}

/** Legacy hosted fixtures duplicated one physical troop type as front and reverse. Parsing folds that exact current default before reveal without rewriting stored battle history or authored combat data. */
export const storedSnapshotSchema = storedSnapshotBaseSchema.transform((snapshot) => ({
  ...snapshot,
  combatFaces: Object.fromEntries(
    Object.entries(snapshot.combatFaces).map(([factionId, faces]) => [factionId, currentFixtureFaces(factionId, faces)])
  ),
  battleState:
    snapshot.battleState?.stage === 'revealed'
      ? snapshot.battleState
      : snapshot.battleState && {
          ...snapshot.battleState,
          plans: snapshot.battleState.plans.map((plan, side) =>
            currentFixturePlan(snapshot.battleState!.sides[side]?.factionId ?? '', plan)
          ) as typeof snapshot.battleState.plans,
        },
}));
export type StoredSnapshot = z.infer<typeof storedSnapshotSchema>;

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

  piece(piece: TablePiece, visible = false, handles: StoredSnapshot['cardHandles'] = {}): TablePiece {
    if (piece.kind !== 'card') {
      return piece;
    }
    const handleKey = piece.items.map((item) => handles[item.id] ?? item.id).join(',');
    let projected = visible ? undefined : this.pieces.get(piece)?.get(handleKey);
    if (!projected) {
      projected = {
        ...piece,
        items: piece.items.map((item) => {
          const hidden = !visible && (!!piece.inventory || !item.faceUp);
          return {
            id: this.cardId(item.id, handles),
            faceUp: !hidden,
            ...(item.artwork
              ? { artwork: hidden ? { back: item.artwork.back, type: item.artwork.type } : item.artwork }
              : {}),
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

  contents(contents: SpawnContents): SpawnContents {
    return { ...contents, pieces: contents.pieces.map((piece) => this.piece(piece)) };
  }

  carries(carries: PublicCarry[], handles: StoredSnapshot['cardHandles']) {
    return carries.map((carry) => ({ ...carry, held: this.piece(carry.held, false, handles) }));
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
      pickedUpItemIds: draft.pickedUpItemIds.map(id),
      withdrawals: draft.withdrawals.map((withdrawal) => ({ ...withdrawal, itemId: id(withdrawal.itemId) })),
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
      const { revision, table, versions, phase, roster, stage, draft, swapping, controls, spiceTransfers } = snapshot;
      const battle = snapshot.battleState;
      const ownSide = battle?.sides.findIndex((side) => side?.factionId === factionId) ?? -1;
      const plan = (plan: NonNullable<typeof battle>['plans'][number], historyRevision?: number) =>
        plan && {
          ...plan,
          pieces: plan.pieces.map((piece) =>
            this.piece(
              piece,
              true,
              historyRevision === undefined
                ? snapshot.cardHandles
                : Object.fromEntries(piece.items.map((item) => [item.id, `history-${historyRevision}-${item.id}`]))
            )
          ),
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
              ...(battle.stage === 'revealed' ? { revealed: [plan(battle.plans[0])!, plan(battle.plans[1])!] } : {}),
            }
          : null,
        battlePlan: ownSide >= 0 ? plan(battle!.plans[ownSide]) : null,
        ...(factionId
          ? {
              hand: (snapshot.factionInventories[factionId] ?? []).map((piece) =>
                this.piece(piece, true, snapshot.cardHandles)
              ),
            }
          : {}),
        combatFaces: snapshot.combatFaces,
        battleResults: snapshot.battleResults.map((result) => ({
          ...result,
          plans: [plan(result.plans[0], result.revision)!, plan(result.plans[1], result.revision)!],
        })),
        revision,
        table: { ...table, pieces: table.pieces.map((piece) => this.piece(piece, false, snapshot.cardHandles)) },
        versions,
        phase,
        ...(roster ? { roster } : {}),
        ...(stage ? { stage } : {}),
        ...(draft ? { draft } : {}),
        ...(swapping ? { swapping } : {}),
        controls: controls && {
          ...controls,
          requests: controls.requests.map((request) => ({ ...request, contents: this.contents(request.contents) })),
        },
        ...(spiceTransfers ? { spiceTransfers } : {}),
        ...(factionId ? { bank: { factionId, balance: snapshot.factionBanks[factionId] ?? 0 } } : {}),
      };
      audiences.set(factionId, projected);
    }
    return projected;
  }
}
