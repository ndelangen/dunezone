import { factionOfToken, factionTokenPieceUnder, factionTokenSeenOver } from '@shared/play/bribes';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { gestureBlockReason } from '@shared/play/model';
import type { DraftMove, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { carryPieceId } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, PublicCarry, ServerMessage } from '@shared/play/protocol';
import { CARRY_FLIPS_LIMIT } from '@shared/play/schema';
import { isSpicePiece } from '@shared/play/spice';
import type { SpiceGift, SpiceGiftChoice } from '@shared/play/spiceReserve';
import type { PointerRay } from '@shared/play/tableGeometry';
import { canFlipInHand, draftForGesture, heldPieceFor, projectCarryAtPosition } from '@shared/play/tableState';
import { troopFactionOf } from '@shared/play/troopReserves';

import type { TableProjection } from './tableProjection';

/* Where the pointer let go, and its ray from the camera into the table. */
export type GiftPointer = { x: number; y: number; ray?: PointerRay };

export type LocalCarry = {
  id: string;
  sourceId: string;
  draft: DraftMove;
  granted: boolean;
  pendingDrop?: string;
  /* The drop was released while the table could not send it, such as during a resync; it goes out once the table can act again. */
  dropUnsent?: true;
  /* The held piece as the room last answered a flip with it, which shows any face turned up in hand. */
  revealed?: TablePiece;
  /* A resync completed the drop before the tab holds its snapshot, so the draft keeps the piece where it landed until the fresh view. */
  landed?: true;
  /* Spice let go over another faction's token waits in hand, over it, while the placer picks a bribe or a payment; `x` and `y` are where the pointer let go. */
  offer?: { factionId: string; position: Vector3Tuple; x: number; y: number };
  /* What the placer picked for that spice, sent with the drop. */
  give?: SpiceGiftChoice;
};

type CarryMessage = Extract<ClientMessage, { type: 'begin' | 'pose' | 'drop' | 'cancel' | 'take' | 'flip' | 'renew' }>;

type CarryHost = {
  send: (message: CarryMessage) => boolean;
  /* The next sequence number of this page's moving messages, shared with its pointer. */
  nextSeq: () => number;
  /* The room's live table. */
  snapshot: () => GameSnapshot;
  /* The table as the last update derived it. */
  table: () => TableProjection | null;
  /* Whether this viewer may handle the table's pieces now. */
  canHandle: () => boolean;
  connectionId: () => string | undefined;
  /* Every carry the room reports, this page's own among them. */
  roomCarries: () => readonly PublicCarry[];
  /* Whether a turn this page sent of the piece has not been answered yet. */
  turnSending: (pieceId: string) => boolean;
  finishRotation: () => void;
  select: (pieceId: string | null) => void;
  setError: (error: string | null) => void;
  emit: (coalesce?: boolean) => void;
};

/* A carry the table ended before its piece left the hand; the player has to pick it up again. */
export const pausedWhileHeld = 'The table paused while you held a piece. Pick it up again to continue.';

/** A face-up item this page has no front for yet. */
function lacksShownFace(item: TablePiece['items'][number]) {
  return item.faceUp && !item.artwork?.front;
}

/* A drop that never flipped in hand sends no count, as it did before flipping in hand. */
function flipsOf(draft: DraftMove) {
  return draft.flips ? { flips: draft.flips } : {};
}

/**
 * The piece this page holds: picking it up, moving and turning it in hand, letting go of it, gifting spice and returning troops, and how the room's answers grant, land or end the carry.
 */
export class CarryController {
  private carry: LocalCarry | null = null;
  private poseTimer: ReturnType<typeof setTimeout> | undefined;
  /* The turn-over a piece in hand is playing, kept apart from the table's flips: a drawn card's id is the carry's own, and a cancelled carry's turn no longer matters. */
  private handFlip: { carryId: string; pieceId: string; revision: number } | null = null;
  /* Set when a held piece went back to the table without a drop; the next view shows it, since a fresh view clears older errors. */
  private droppedNotice: string | null = null;

  constructor(private readonly host: CarryHost) {}

  /* The carry this page holds, or null. */
  get current(): LocalCarry | null {
    return this.carry;
  }

  /* The piece the held gesture began on while it is still held, not yet let go of. */
  gestureActivePieceId() {
    return this.carry && !this.carry.pendingDrop ? this.carry.sourceId : null;
  }

  begin(sourceId: string, pickup: 'top' | 'whole') {
    this.host.finishRotation();
    /* A piece picks up as the room has it, so one whose turn is still on its way waits for it, as a flipping one does. */
    if (
      this.host.turnSending(sourceId) ||
      !this.host.canHandle() ||
      this.carry ||
      this.requireTable().reservedPieceIds.has(sourceId) ||
      this.requireTable().flippingPieceIds.has(sourceId)
    ) {
      return;
    }
    const snapshot = this.host.snapshot();
    const piece = snapshot.table.pieces.find((candidate) => candidate.id === sourceId);
    if (!piece || gestureBlockReason(piece)) {
      return;
    }
    const draft = draftForGesture(piece, pickup);
    if (!draft) {
      return;
    }
    const id = crypto.randomUUID();
    if (draft.pieceId !== sourceId) {
      draft.pieceId = carryPieceId(id);
    }
    this.carry = { id, sourceId, draft, granted: false };
    this.host.select(draft.pieceId);
    this.host.setError(null);
    this.host.send({
      type: 'begin',
      carryId: id,
      sourcePieceId: sourceId,
      pickup,
      expectedVersion: snapshot.versions[sourceId] ?? 0,
    });
    this.host.emit();
  }

  update(position: Vector3Tuple) {
    const carry = this.inHand();
    if (!carry) {
      return;
    }
    const draft = projectCarryAtPosition(this.requireTable().state, carry.draft, position);
    if (!draft) {
      return;
    }
    this.carry = { ...carry, draft };
    if (!this.poseTimer) {
      this.poseTimer = setTimeout(this.flushPose, 50);
    }
    /* A mouse can report several moves a frame, and the scene only draws the last of them. */
    this.host.emit(true);
  }

  /**
   * Lets go of the held piece at `position`.
   * `pointer` is where the pointer let go, and its ray from the camera.
   * Spice let go over another faction's token waits there for the placer to say what it is.
   */
  finish(position: Vector3Tuple, pointer?: GiftPointer) {
    if (!this.inHand()) {
      return;
    }
    this.update(position);
    const offer = pointer && this.giftOffer(position, pointer);
    /* Gifted spice waits where the room will take the gift from; troops seen over their own token are let go over its middle, where the room returns them to their reserves. */
    const settled = offer?.position ?? (pointer && this.reserveTokenPosition(position, pointer));
    if (settled) {
      this.update(settled);
    }
    this.flushPose();
    if (offer) {
      this.carry = { ...this.carry!, offer };
      this.host.emit();
      return;
    }
    this.carry = { ...this.carry!, pendingDrop: crypto.randomUUID(), dropUnsent: true };
    this.flushDrop();
    this.host.emit();
  }

  /** Gives the spice waiting over a faction's token to that faction, as a bribe or a payment. */
  giveSpice(as: SpiceGift) {
    const carry = this.carry;
    if (!carry?.offer || carry.pendingDrop) {
      return;
    }
    const { offer: _offer, ...rest } = carry;
    this.carry = {
      ...rest,
      draft: { ...rest.draft, position: carry.offer.position },
      give: { as, factionId: carry.offer.factionId },
      pendingDrop: crypto.randomUUID(),
      dropUnsent: true,
    };
    this.flushDrop();
    this.host.emit();
  }

  /* A drop let go of while the table could not send it goes out once it can. */
  flushDrop() {
    const carry = this.carry;
    if (!carry?.pendingDrop || !carry.dropUnsent) {
      return;
    }
    const sent = this.host.send({
      type: 'drop',
      carryId: carry.id,
      commandId: carry.pendingDrop,
      position: carry.draft.position,
      orientation: carry.draft.orientation,
      ...flipsOf(carry.draft),
      ...(carry.give ? { give: carry.give } : {}),
    });
    if (sent) {
      const { dropUnsent: _unsent, ...rest } = carry;
      this.carry = rest;
    }
  }

  cancel() {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    this.host.send({ type: 'cancel', carryId: this.carry.id });
    this.host.select(this.carry.sourceId);
    this.carry = null;
    this.host.emit();
  }

  takeAdditionalFromTarget() {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    const donorPieceId = this.carry.draft.targetPieceId;
    if (!donorPieceId) {
      return;
    }
    this.flushPose();
    this.host.send({ type: 'take', carryId: this.carry.id, requestId: crypto.randomUUID(), donorPieceId });
  }

  /* Turns the piece in hand a step; a piece let go of turns no more. */
  rotate(direction: -1 | 1) {
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    this.carry = {
      ...this.carry,
      draft: { ...this.carry.draft, orientation: this.carry.draft.orientation - (direction * Math.PI) / 12 },
    };
    this.update(this.carry.draft.position);
    this.flushPose();
    this.host.emit();
  }

  /* A piece in hand turns over where it is held at once; the room answers with any face it turned up, and the table logs the flip when it lands. */
  flip() {
    const carry = this.carry;
    const held = carry && !carry.pendingDrop ? this.pieceToFlip(carry) : null;
    if (!carry || !held) {
      return;
    }
    const flips = (carry.draft.flips ?? 0) + 1;
    this.handFlip = { carryId: carry.id, pieceId: held.id, revision: (held.flipRevision ?? 0) + 1 };
    this.carry = { ...carry, draft: { ...carry.draft, flips } };
    this.host.send({ type: 'flip', carryId: carry.id, flips });
    this.host.emit();
  }

  /* The scene finished turning over a piece; one in hand may turn again. */
  finishFlip(pieceId: string, revision: number) {
    if (this.handFlip?.pieceId === pieceId && this.handFlip.revision === revision) {
      this.handFlip = null;
    }
  }

  /* Carries expire on the Worker unless renewed while held. */
  renew() {
    if (this.carry && !this.carry.pendingDrop) {
      this.host.send({ type: 'renew', carryId: this.carry.id });
    }
  }

  /*
   * A face-down card turned face up in hand has no face on this page until the room answers the flip,
   * so the held piece borrows each face the room's answer shows.
   */
  withRevealedFaces(held: TablePiece): TablePiece {
    const shown = this.carry?.revealed;
    if (!shown || !held.items.some(lacksShownFace)) {
      return held;
    }
    const faces = new Map(shown.items.map((item) => [item.id, item.artwork]));
    return {
      ...held,
      items: held.items.map((item) => {
        const face = faces.get(item.id);
        return lacksShownFace(item) && face?.front ? { ...item, artwork: face } : item;
      }),
    };
  }

  /* The bribe-or-payment question for spice waiting over a faction's token; none while a look back in time shows. */
  spiceGift(displayed: GameSnapshot, state: TableState, showsHistory: boolean): TableProjection['spiceGift'] {
    const offer = this.carry?.offer;
    if (!offer || showsHistory) {
      return undefined;
    }
    const held = this.carry && heldPieceFor(state, this.carry.draft);
    return {
      factionId: offer.factionId,
      name: snapshotFactionLabels(displayed)[offer.factionId] ?? 'a faction',
      artwork: displayed.factionArtwork?.[offer.factionId],
      amount: held?.items.length ?? 0,
      x: offer.x,
      y: offer.y,
    };
  }

  /* The room granted the carry, with the piece as it holds it; this page keeps where the piece is in hand. */
  receive(message: Extract<ServerMessage, { type: 'carry' }>) {
    if (this.carry?.id !== message.carryId) {
      return;
    }
    const current = this.carry.draft;
    this.carry = {
      ...this.carry,
      granted: true,
      /* A flip made since this answer left the room is still counted here, and goes out on its own. */
      draft: {
        ...message.draft,
        position: current.position,
        orientation: current.orientation,
        flips: Math.max(current.flips ?? 0, message.draft.flips ?? 0),
      },
      ...(message.held ? { revealed: message.held } : {}),
    };
  }

  settle(id: string, outcome: 'completed' | 'rejected', viewFollows: boolean) {
    if (viewFollows && this.carry?.pendingDrop === id) {
      this.carry = { ...this.carry, landed: true };
    } else if (this.carry && (this.carry.pendingDrop === id || (outcome === 'rejected' && this.carry.id === id))) {
      if (outcome === 'rejected') {
        this.host.send({ type: 'cancel', carryId: this.carry.id });
      }
      this.carry = null;
    }
  }

  /* A drop a resync completed is on the fresh table now. */
  viewArrived() {
    if (this.carry?.landed) {
      this.carry = null;
    }
  }

  /* A drop already sent may or may not have landed, so it asks the player to look; a drop still waiting to go out never left the hand, and one the server confirmed needs no notice. */
  noteEnded(notice: { held: string; placing: string }) {
    if (this.carry && !this.carry.landed) {
      this.droppedNotice = this.carry.pendingDrop && !this.carry.dropUnsent ? notice.placing : notice.held;
    }
  }

  /* The notice of a carry that ended without a drop, once; null when there is none. */
  takeNotice() {
    const notice = this.droppedNotice;
    this.droppedNotice = null;
    return notice;
  }

  /* Squares the carry with the room's: a granted carry the room no longer holds ends, and an ungranted one another player beat ends too. */
  reconcile() {
    const local = this.carry;
    if (!local) {
      return;
    }
    const carries = this.host.roomCarries();
    if (local.granted) {
      if (!carries.some((carry) => carry.id === local.id)) {
        /* A drop still waiting to go out never reached the Worker, so the piece snaps back and the player is told why. */
        if (local.dropUnsent) {
          this.host.setError(pausedWhileHeld);
        }
        this.carry = null;
      }
      return;
    }
    if (this.competing(local, carries)) {
      this.host.send({ type: 'cancel', carryId: local.id });
      this.host.select(local.sourceId);
      this.carry = null;
      this.host.setError('Another player picked up that source first.');
    }
  }

  /* The room resumed without the carry, so the piece is no longer in hand. */
  end() {
    this.carry = null;
  }

  /* The carry ended with the room's activity, as when the connection dropped or the viewer's seat changed. */
  clear() {
    this.carry = null;
    clearTimeout(this.poseTimer);
    this.poseTimer = undefined;
    this.handFlip = null;
  }

  private readonly flushPose = () => {
    clearTimeout(this.poseTimer);
    this.poseTimer = undefined;
    if (!this.carry || this.carry.pendingDrop) {
      return;
    }
    this.host.send({
      type: 'pose',
      carryId: this.carry.id,
      seq: this.host.nextSeq(),
      position: this.carry.draft.position,
      orientation: this.carry.draft.orientation,
    });
  };

  private requireTable(): TableProjection {
    const table = this.host.table();
    if (!table) {
      throw new Error('The table is not authorized.');
    }
    return table;
  }

  /* A carry still following the pointer: not yet let go, nor waiting over a token for a bribe or a payment. */
  private inHand(): LocalCarry | null {
    return this.carry && !this.carry.pendingDrop && !this.carry.offer ? this.carry : null;
  }

  private competing(local: LocalCarry, carries: readonly PublicCarry[]) {
    const sources = new Set([local.sourceId, ...local.draft.withdrawals.map((withdrawal) => withdrawal.sourcePieceId)]);
    const own = this.host.connectionId();
    return carries.some((carry) => carry.connectionId !== own && carry.reservedIds.some((id) => sources.has(id)));
  }

  /*
   * Spice let go over another faction's token waits there for the placer to say what it is; undefined when it is not such a drop.
   * The whole token counts: the spice is over it when it is seen over it, or when it would land on it.
   * The held piece rides on the pointer's ray above the table, so from a low camera it is seen over a token well before it would land on it;
   * what it is seen over wins, and seen over a token it does not land on, it waits over that token's middle, where the room finds it too.
   */
  private giftOffer(position: Vector3Tuple, pointer: GiftPointer): LocalCarry['offer'] {
    const recipients = this.giftRecipients();
    if (recipients.size === 0) {
      return undefined;
    }
    const pieces = this.requireTable().state.pieces;
    const token = factionTokenSeenOver(pieces, (factionId) => recipients.has(factionId), position, pointer.ray);
    if (!token) {
      return undefined;
    }
    const landing = factionTokenPieceUnder(pieces, position);
    const over: Vector3Tuple = token === landing ? [...position] : [token.position[0], position[1], token.position[2]];
    return { factionId: factionOfToken(token)!, position: over, x: pointer.x, y: pointer.y };
  }

  /*
   * The middle of the faction token troops in hand belong to, when they are seen over it or would land on it; undefined otherwise.
   * Read as a gift's token is, so troops seen over their token from a low camera go home as well.
   */
  private reserveTokenPosition(position: Vector3Tuple, pointer: GiftPointer): Vector3Tuple | undefined {
    const table = this.carry && this.host.canHandle() ? this.host.table()?.state : undefined;
    const factionId = table && troopFactionOf(heldPieceFor(table, this.carry!.draft));
    const token = factionId && factionTokenSeenOver(table.pieces, (id) => id === factionId, position, pointer.ray);
    return token ? [token.position[0], position[1], token.position[2]] : undefined;
  }

  /* The factions spice in hand can go to: every other seated faction, while this viewer holds a spice reserve. */
  private giftRecipients() {
    const snapshot = this.host.snapshot();
    const giver = snapshot.bank?.factionId;
    if (!giver || !this.carryingSpice()) {
      return new Set<string>();
    }
    const seated = new Set(Object.keys(snapshotFactionLabels(snapshot)));
    seated.delete(giver);
    return seated;
  }

  /* Whether this page holds spice in hand at a table it can handle. */
  private carryingSpice() {
    const table = this.host.table()?.state;
    return Boolean(table && this.carry && this.host.canHandle() && isSpicePiece(heldPieceFor(table, this.carry.draft)));
  }

  /* The piece in hand when it may turn over once more: one the room would let turn, below the carry's cap, and not still turning. */
  private pieceToFlip(carry: LocalCarry) {
    const held = heldPieceFor(this.requireTable().state, carry.draft);
    /* The room never counts back, so a carry stops turning at its cap rather than send a count it refuses. */
    const unrevealed = (stepId: string) => this.host.snapshot().predictions?.[stepId]?.revealedAt === null;
    if (!held || !canFlipInHand(held, unrevealed) || (carry.draft.flips ?? 0) >= CARRY_FLIPS_LIMIT) {
      return null;
    }
    /* A piece still turning over in hand finishes that turn before it takes another, as one on the table does. */
    return this.handFlip?.carryId === carry.id ? null : held;
  }
}
