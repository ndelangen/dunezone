import type { ClientMessage, ServerMessage } from '@shared/play/protocol';
import { reviewRunning } from '@shared/play/review';
import type { TableReview } from '@shared/play/review';

import type { TableProjection } from './tableProjection';

type HistoryFrame = Extract<ServerMessage, { type: 'history' }>;

type TablePlaybackHost = {
  send: (message: Extract<ClientMessage, { type: 'history' }>) => boolean;
  monotonicNow: () => number;
  serverNow: () => number;
  /* Takes this page's cursor off the table, as a look back in time shows no live hands. */
  hidePointer: () => void;
  /* Sends what waited for the live table to show again. */
  flushQueues: () => void;
};

/* How long a requested checkpoint may take before the page gives up on it. */
const HISTORY_TIMEOUT_MS = 15_000;

/**
 * Looking back in time: the checkpoint this page asked for or shows, and the running table review it follows.
 * A review shows its checkpoint to everyone at once, so the page asks for it without being asked, and goes back to the live table when it ends.
 */
export class TablePlayback {
  private frame: HistoryFrame | null = null;
  private clock: (() => number) | null = null;
  private pendingStep: number | null = null;
  private requestedAt = 0;
  private requestId: string | null = null;
  /* The running table review this page follows, by id and step; null when none holds it. */
  private followed: string | null = null;
  /* The live room's newest history step, which grows while a viewer sits in playback. */
  private liveSteps = 0;

  constructor(private readonly host: TablePlaybackHost) {}

  /* The checkpoint shown, or null at the live table. */
  get shown() {
    return this.frame;
  }

  /* Whether a checkpoint was asked for and has not arrived. */
  get pending() {
    return this.pendingStep !== null;
  }

  /** Whether a running table review holds this page on its checkpoint. */
  holds() {
    return this.followed !== null;
  }

  /* Whether this page shows the running review's own checkpoint, as every viewer of the review does. */
  showsReview(review: TableReview | null | undefined) {
    return reviewRunning(review) && this.frame?.step === review.step && this.pendingStep === null;
  }

  playback(): TableProjection['playback'] {
    return this.frame
      ? {
          step: this.frame.step,
          lastStep: Math.max(this.frame.lastStep, this.liveSteps),
          recordedAt: this.frame.recordedAt,
        }
      : null;
  }

  /* The clock a checkpoint shows, stopped where it was recorded; undefined at the live table. */
  shownClock() {
    return this.frame ? this.clock! : undefined;
  }

  /** Records the live room's newest history step, and answers whether it moved. */
  recordLiveSteps(steps: number | undefined) {
    const next = steps ?? this.liveSteps;
    const moved = next !== this.liveSteps;
    this.liveSteps = next;
    return moved;
  }

  /* Follows the running review's checkpoint, once per review step; a held piece waits until it is let go of. */
  follow(review: TableReview | null | undefined, carrying: boolean) {
    if (!reviewRunning(review)) {
      if (this.followed !== null) {
        this.followed = null;
        this.frame = null;
        this.pendingStep = null;
        this.host.flushQueues();
      }
      return;
    }
    const selected = `${review.id}:${review.step}`;
    if (this.followed === selected || carrying) {
      return;
    }
    this.followed = selected;
    this.host.hidePointer();
    this.pendingStep = review.step;
    this.requestId = `history-${crypto.randomUUID()}`;
    this.requestedAt = this.host.monotonicNow();
    if (!this.host.send({ type: 'history', step: review.step, requestId: this.requestId })) {
      this.pendingStep = null;
      this.followed = null;
    }
  }

  /* Asks for the review's checkpoint again, as after it failed to arrive. */
  refollow(review: TableReview | null | undefined, carrying: boolean) {
    this.followed = null;
    this.follow(review, carrying);
  }

  /* Asks for one checkpoint of this viewer's own choosing. */
  request(step: number) {
    this.host.hidePointer();
    this.pendingStep = step;
    this.requestId = null;
    this.requestedAt = this.host.monotonicNow();
    if (!this.host.send({ type: 'history', step })) {
      this.pendingStep = null;
    }
  }

  /** Goes back to the live table, unless a running review holds this page; answers whether it did. */
  leave() {
    if (this.holds()) {
      return false;
    }
    this.frame = null;
    this.pendingStep = null;
    return true;
  }

  /** Shows the checkpoint asked for; answers whether this was it. */
  receive(message: HistoryFrame) {
    if (this.pendingStep !== message.step) {
      return false;
    }
    if (message.requestId !== undefined && message.requestId !== this.requestId) {
      return false;
    }
    this.frame = message;
    const recordedAt = message.recordedAt ?? this.host.serverNow();
    this.clock = () => recordedAt;
    this.pendingStep = null;
    return true;
  }

  /* A refused checkpoint read this page no longer waits for, which shows nothing. */
  ignores(rejection: Extract<ServerMessage, { type: 'rejected' }>) {
    return (
      rejection.requestId.startsWith('history-') &&
      (this.pendingStep === null || rejection.requestId !== this.requestId)
    );
  }

  rejected(rejection: Extract<ServerMessage, { type: 'rejected' }>) {
    if (this.pendingStep !== null && rejection.requestId === (this.requestId ?? 'message')) {
      /* A refused read keeps the previous checkpoint and exposes the reason for retry. */
      this.pendingStep = null;
    }
  }

  /** Gives up on a checkpoint that took too long; answers whether it did. */
  expire() {
    if (this.pendingStep === null || this.host.monotonicNow() - this.requestedAt < HISTORY_TIMEOUT_MS) {
      return false;
    }
    this.pendingStep = null;
    return true;
  }

  clear() {
    this.frame = null;
    this.pendingStep = null;
    this.followed = null;
    this.liveSteps = 0;
  }
}
