import { randomInt } from 'node:crypto';

import type { BankAction } from '../../src/shared/play/banks';
import type { BattleAction } from '../../src/shared/play/battle';
import { applyPieceAction, nextSnapshot, requireAccepted } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { PublicAction, PublicControls, SpawnContents } from '../../src/shared/play/inventory';
import { loadSnapshot } from '../../src/shared/play/loadFixture';
import type { LoadProfile } from '../../src/shared/play/loadFixture';
import { gestureBlockReason } from '../../src/shared/play/model';
import type { DraftMove, TablePiece, TableState, Vector3Tuple } from '../../src/shared/play/model';
import { PHASE_CHANGE_COOLDOWN_MS, phaseAt, phaseForTurn, stepPhase } from '../../src/shared/play/phases';
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
import { rosterSeat, SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { createSpiceStack, isSpicePiece } from '../../src/shared/play/spiceSupply';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '../../src/shared/play/tableSettings';
import {
  appendEvent,
  eventId,
  applyDraftToState,
  draftForGesture,
  draftWithAdditionalTop,
  heldPieceFor,
  projectCarryAtPosition,
  settleCarryAtPosition,
} from '../../src/shared/play/tableState';
import { battleCommand } from './battle';
import { concealCards, deckCommand } from './decks';
import { dealFixtureDeck } from './fixture';
import { setupCommand, gatherTraitors } from './setup-progress';
import { storedSnapshotSchema } from './state';
import type { StoredSnapshot } from './state';

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
  public snapshot: StoredSnapshot;
  readonly epoch = crypto.randomUUID();
  readonly carries = new Map<string, Carry>();
  readonly reservations = new Map<string, string>();
  readonly pointers = new Map<string, PublicPointer>();
  private readonly usedCarryIds = new Map<string, Set<string>>();
  private readonly flipUntil = new Map<string, number>();
  constructor(
    snapshot: GameSnapshot | StoredSnapshot,
    private readonly loadProfile: LoadProfile | undefined,
    private readonly seatedPlayers: () => Identity['viewerSeat'][],
    private readonly factionFor: (userId: string) => string | undefined = () => undefined,
    /** The catalogue deck the fixture deals on reset; a room adopts one after the fact when its catalogue answers late. */
    public fixtureDeck?: SpawnContents
  ) {
    this.snapshot = storedSnapshotSchema.parse(snapshot);
  }

  private player(identity: Identity) {
    if (identity.viewerSeat === SPECTATOR_SEAT) {
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
    this.assertTableAvailable();
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

  drop(identity: Identity, id: string, position: Vector3Tuple, orientation: number): StoredSnapshot {
    this.assertTableAvailable();
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

  /* Phase, battle and catalogue controls belong to play; setup opens only physical handling. */
  private assertPlaying() {
    if (this.snapshot.stage && this.snapshot.stage !== 'play') {
      throw new GameRejection('The game has not started playing yet.');
    }
  }

  private assertTableAvailable() {
    if (this.snapshot.stage !== 'setup') {
      this.assertPlaying();
    }
  }

  private assertActionStage(action: PieceAction) {
    this.assertTableAvailable();
    if (
      this.snapshot.stage === 'setup' &&
      ![
        'split',
        'stack',
        'flip',
        'lock',
        'rotate',
        'deck-draw',
        'deck-shuffle',
        'hand-take',
        'hand-play',
        'bank-withdraw',
        'bank-collect',
        'spice-spawn',
        'phase',
        'ready',
        'prediction-lock',
        'prediction-reveal',
        'traitors-gather',
      ].includes(action.kind)
    ) {
      throw new GameRejection('That control is not available during setup.');
    }
  }

  private requireFaction(identity: Identity): string {
    const factionId = this.factionFor(identity.userId);
    if (!factionId) {
      throw new GameRejection('Only a current faction player can use this control.');
    }
    return factionId;
  }

  command(identity: Identity, action: PieceAction, expectedRevision: number, now = Date.now()): StoredSnapshot {
    this.assertActionStage(action);
    this.assertCommand(identity, action, expectedRevision);
    if (
      ['prediction-lock', 'prediction-reveal', 'traitors-gather', 'storm-random'].includes(action.kind) ||
      (this.snapshot.stage === 'setup' && ['phase', 'ready'].includes(action.kind))
    ) {
      return setupCommand(this.snapshot, action, {
        factionId: this.requireFaction(identity),
        seat: identity.viewerSeat,
        seats: this.seatedPlayers(),
        reserved: new Set(this.reservations.keys()),
        now,
      });
    }
    if (action.kind === 'deck-draw' || action.kind === 'deck-shuffle') {
      const factionId = this.requireFaction(identity);
      return deckCommand(this.snapshot, factionId, action);
    }
    if (action.kind.startsWith('battle-') || action.kind.startsWith('hand-')) {
      const factionId = this.requireFaction(identity);
      const next = battleCommand(this.snapshot, factionId, action as BattleAction, now);
      if (action.kind !== 'battle-outcome') {
        this.assertReservationsUnchanged(this.snapshot.table as TableState, next.table as TableState);
      }
      if (action.kind === 'hand-take' || action.kind === 'hand-play') {
        const pieces = action.kind === 'hand-take' ? next.factionInventories[factionId] : next.table.pieces;
        return concealCards(
          next,
          pieces.filter((piece) => piece.id === action.pieceId),
          true
        );
      }
      return next;
    }
    if (
      action.kind === 'reset' &&
      (this.snapshot.battleState || Object.values(this.snapshot.factionInventories).some((pieces) => pieces.length))
    ) {
      throw new GameRejection('Finish the battle and return private pieces to the table before resetting the fixture.');
    }
    if (action.kind === 'bank-withdraw' || action.kind === 'bank-collect') {
      return this.bankCommand(identity, action);
    }
    if (action.kind === 'flip' && (this.flipUntil.get(action.pieceId) ?? 0) > now) {
      throw new GameRejection('Wait for that piece to finish flipping.');
    }
    if (['ready', 'spawn-request', 'spawn-approve', 'spawn-dismiss'].includes(action.kind)) {
      return this.publicCommand(identity, action as PublicAction);
    }
    this.assertPhaseChange(action, now);
    const raw = tableForViewer(this.snapshot, identity.viewerSeat);
    const guarded = this.table(identity);
    const guardedNext = this.nextTable(guarded, action, identity);
    // Any command touching a reserved donor or target must be rejected, even
    // when the acting player owns the carry in another tab.
    if (!['reset', 'enforcement', 'phase', 'turn'].includes(action.kind)) {
      this.assertReservationsUnchanged(guarded, guardedNext);
    }
    const table = action.kind === 'reset' ? guardedNext : this.restoreReservationLocks(raw, guardedNext);
    const phase = this.nextPhase(action);
    const next = nextSnapshot(this.snapshot, table, phase, action.kind === 'reset');
    const controls = this.snapshot.controls ?? emptyPublicControls();
    return {
      ...next,
      controls: {
        ...controls,
        seats: this.seatedPlayers(),
        ready: phase !== this.snapshot.phase || action.kind === 'reset' ? [] : controls.ready,
        phaseChangedAt: phase !== this.snapshot.phase ? now : controls.phaseChangedAt,
      },
    };
  }

  finishSetupCleanup(): StoredSnapshot | undefined {
    if (!this.snapshot.pendingTraitors.length) {
      return;
    }
    const next = gatherTraitors(this.snapshot, new Set(this.reservations.keys()));
    return next === this.snapshot ? undefined : next;
  }

  /** A reset rebuilds the fixture's table: the load fixture from its profile, the hosted one with its dealt deck. */
  private nextTable(guarded: TableState, action: PieceAction, identity: Identity): TableState {
    if (action.kind !== 'reset') {
      return applyPieceAction(guarded, action, this.snapshot.phase, identity.displayName);
    }
    if (this.loadProfile) {
      return tableForViewer(loadSnapshot(this.loadProfile), identity.viewerSeat);
    }
    const fresh = applyPieceAction(guarded, action, this.snapshot.phase, identity.displayName);
    return this.fixtureDeck ? dealFixtureDeck(fresh, this.fixtureDeck) : fresh;
  }

  private bankCommand(identity: Identity, action: BankAction): StoredSnapshot {
    const factionId = this.factionFor(identity.userId);
    if (!factionId || !Object.hasOwn(this.snapshot.factionBanks, factionId)) {
      throw new GameRejection("Only the faction's current player can use its bank.");
    }
    const balance = this.snapshot.factionBanks[factionId];
    const table = tableForViewer(this.snapshot, identity.viewerSeat);
    const change =
      action.kind === 'bank-withdraw'
        ? this.withdrawSpice(table, balance, action.amount, identity.viewerSeat)
        : this.collectSpice(table, balance, action.pieceId);
    const next = nextSnapshot(this.snapshot, {
      ...change.table,
      ...appendEvent(table, {
        id: eventId(table.nextEventNumber),
        command: action.kind,
        message: `${factionId} ${change.message}`,
        status: 'accepted',
      }),
    });
    return { ...next, factionBanks: { ...this.snapshot.factionBanks, [factionId]: change.balance } };
  }

  private withdrawSpice(table: TableState, balance: number, amount: number, seat: Identity['viewerSeat']) {
    if (amount > balance) {
      throw new GameRejection('There is not enough banked spice for that withdrawal.');
    }
    const piece = this.bankStack(table, amount, seat);
    return {
      balance: balance - amount,
      table: { ...table, pieces: [...table.pieces, piece] },
      message: `withdrew ${amount} spice onto the table.`,
    };
  }

  private collectSpice(table: TableState, balance: number, pieceId: string) {
    const piece = table.pieces.find((candidate) => candidate.id === pieceId);
    if (!isSpicePiece(piece) || piece.locked) {
      throw new GameRejection('Choose an unlocked spice stack on the table.');
    }
    if (!Number.isSafeInteger(balance + piece.items.length)) {
      throw new GameRejection('This collection exceeds the bank capacity.');
    }
    return {
      balance: balance + piece.items.length,
      table: { ...table, pieces: table.pieces.filter((candidate) => candidate.id !== piece.id) },
      message: `collected ${piece.items.length} spice from the table.`,
    };
  }

  /* A withdrawal lands in front of the acting seat's station, whichever station its seating fixed. */
  private bankStack(table: TableState, amount: number, seat: Identity['viewerSeat']): TablePiece {
    const piece = createSpiceStack(table.nextEventNumber, 1);
    piece.items = Array.from({ length: amount }, (_, index) => ({ id: `${piece.id}-${index + 1}`, faceUp: true }));
    const roster = this.snapshot.roster;
    const station = rosterSeat(roster, seat);
    if (!roster || !station) {
      throw new GameRejection('This seat has no station on the table.');
    }
    const angle = tableSeatAngles(roster.seatCount)[station.position];
    const radius = PLAYER_RING_RADIUS - 0.55;
    const origin = restingPositionAt([Math.cos(angle) * radius, 0, Math.sin(angle) * radius], piece);
    const position = nearestCollisionFreePosition(piece, origin, table.pieces);
    if (!position) {
      throw new GameRejection('Make room on the table before withdrawing spice.');
    }
    return { ...piece, position };
  }

  private assertPhaseChange(action: PieceAction, now: number) {
    if (action.kind !== 'phase' && action.kind !== 'turn') {
      return;
    }
    const phase = this.nextPhase(action);
    const controls = this.snapshot.controls ?? emptyPublicControls();
    if (phase !== this.snapshot.phase && now < controls.phaseChangedAt + PHASE_CHANGE_COOLDOWN_MS) {
      throw new GameRejection('Wait eight seconds between phase changes.');
    }
    if (
      phase > this.snapshot.phase &&
      phaseAt(this.snapshot.phase).id === 'mentat-pause' &&
      !this.seatedPlayers().every((seat) => controls.ready.includes(seat))
    ) {
      throw new GameRejection('Every seated player must be ready before advancing.');
    }
  }

  publicCommand(identity: Identity, action: PublicAction, contents?: SpawnContents): StoredSnapshot {
    this.assertPlaying();
    this.player(identity);
    const controls = structuredClone(this.snapshot.controls ?? emptyPublicControls());
    controls.seats = this.seatedPlayers();
    if (!controls.seats.includes(identity.viewerSeat)) {
      throw new GameRejection('Only a current seated player can use this control.');
    }
    const table = { ...tableForViewer(this.snapshot, identity.viewerSeat), pieces: [...this.snapshot.table.pieces] };
    let message: string;
    switch (action.kind) {
      case 'ready':
        message = this.setReadiness(identity, action.ready, controls);
        break;
      case 'spawn-request':
        message = this.requestSpawn(identity, controls, table, contents);
        break;
      default:
        message = this.resolveSpawn(identity, action, controls, table);
    }
    const next = nextSnapshot(this.snapshot, {
      ...table,
      ...appendEvent(table, {
        id: eventId(table.nextEventNumber),
        command: action.kind,
        message,
        status: 'accepted',
      }),
    });
    return { ...next, controls };
  }

  private setReadiness(identity: Identity, ready: boolean, controls: PublicControls): string {
    if (phaseAt(this.snapshot.phase).id !== 'mentat-pause') {
      throw new GameRejection('Ready applies only during Mentat pause.');
    }
    controls.ready = controls.ready.filter((seat) => seat !== identity.viewerSeat);
    if (ready) {
      controls.ready.push(identity.viewerSeat);
    }
    return `${identity.viewerSeat} ${ready ? 'is ready' : 'withdrew readiness'}.`;
  }

  private requestSpawn(
    identity: Identity,
    controls: PublicControls,
    table: TableState,
    contents?: SpawnContents
  ): string {
    if (!contents) {
      throw new GameRejection('Choose a complete published asset first.');
    }
    const requestId = `spawn-${this.snapshot.revision + 1}`;
    if (controls.seats.length === 1) {
      table.pieces.push(...this.spawnPieces(contents, requestId));
      return `${contents.name} requested and spawned.`;
    }
    controls.requests.push({
      id: requestId,
      requesterSeat: identity.viewerSeat,
      requesterName: identity.displayName,
      /* The live snapshot carries what approval spawns; the audit row keeps the captured definitions. */
      contents: { ...contents, definitions: [] },
    });
    return `${contents.name} requested.`;
  }

  private resolveSpawn(
    identity: Identity,
    action: Extract<PublicAction, { requestId: string }>,
    controls: PublicControls,
    table: TableState
  ): string {
    const request = controls.requests.find((request) => request.id === action.requestId);
    if (!request) {
      throw new GameRejection('That spawn request has already been resolved.');
    }
    if (action.kind === 'spawn-approve') {
      /* The requester never supplies the approval; a lone player spawns directly and dismisses leftovers. */
      if (request.requesterSeat === identity.viewerSeat) {
        throw new GameRejection('One different seated player must approve this request.');
      }
      /* A request persisted before requesters were named by seat has no known requester; dismiss it. */
      if (request.requesterSeat === null) {
        throw new GameRejection('This request has no known requester. Dismiss it and request again.');
      }
      table.pieces.push(...this.spawnPieces(request.contents, request.id));
    }
    controls.requests = controls.requests.filter((candidate) => candidate !== request);
    return `${request.contents.name} ${action.kind === 'spawn-approve' ? 'approved and spawned' : 'dismissed'}.`;
  }

  private spawnPieces(contents: SpawnContents, requestId: string): TablePiece[] {
    return contents.pieces.map((piece, index) => {
      const items = piece.items.map((item, itemIndex) => ({
        ...item,
        id: piece.kind === 'card' ? crypto.randomUUID() : `${requestId}-${index}-${itemIndex}`,
        faceUp: piece.kind !== 'card',
      }));
      /* A new deck's hidden runtime order is independent of its public catalogue recipe. */
      if (piece.kind === 'card') {
        for (let cursor = items.length - 1; cursor > 0; cursor--) {
          const other = randomInt(cursor + 1);
          [items[cursor], items[other]] = [items[other], items[cursor]];
        }
      }
      return { ...piece, id: `${requestId}-${index}`, inventory: 'shared', items };
    });
  }

  private assertCommand(identity: Identity, action: PieceAction, expectedRevision: number) {
    this.player(identity);
    if (
      expectedRevision !== this.snapshot.revision &&
      (!['spice-spawn', 'deck-draw'].includes(action.kind) || expectedRevision > this.snapshot.revision)
    ) {
      throw new GameRejection('The table changed. Try the action again.');
    }
    if ('pieceId' in action) {
      this.available(action.pieceId);
      if (this.snapshot.table.pieces.find((piece) => piece.id === action.pieceId)?.inventory) {
        throw new GameRejection('Drag this item onto the table before changing it.');
      }
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

  private invalidateChangedCarries(snapshot: StoredSnapshot) {
    for (const [id, carry] of this.carries) {
      if ([...carry.versions].some(([pieceId, version]) => snapshot.versions[pieceId] !== version)) {
        this.remove(id);
      }
    }
  }

  accept(snapshot: StoredSnapshot, carryId?: string, clearAll = false, now = Date.now()) {
    this.updateFlipDeadlines(snapshot, now);
    this.snapshot = snapshot;
    this.invalidateChangedCarries(snapshot);
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
