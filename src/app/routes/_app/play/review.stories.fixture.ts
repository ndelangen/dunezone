import { TABLE_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { reviewThreshold } from '@shared/play/review';
import type { ReviewCheckpoint, TableReview } from '@shared/play/review';
import { SPECTATOR_SEAT } from '@shared/play/schema';

import { playingSnapshot, productTransport } from './product.stories.fixture';

/* The live table plays Turn 1's Battle; its checkpoints run from the end of setup through each phase of the turn so far. */
const BATTLE = TABLE_PHASES.findIndex((phase) => phase.id === 'battle');
const FIRST_PLAY_STEP = 8;

export function reviewCheckpoints(): ReviewCheckpoint[] {
  return [
    { step: FIRST_PLAY_STEP - 1, context: 'Setup, Traitors' },
    ...TABLE_PHASES.slice(0, BATTLE + 1).map((phase, index) => ({
      step: FIRST_PLAY_STEP + index,
      context: `Turn 1, ${phase.label}`,
    })),
  ];
}

/** The live table a review is asked from: Turn 1's Battle, nobody reviewing yet. */
export function reviewableSnapshot(viewerSeat = 'seat-2', review: TableReview | null = null): GameSnapshot {
  const snapshot = playingSnapshot(viewerSeat === SPECTATOR_SEAT ? 'seat-2' : viewerSeat);
  snapshot.phase = BATTLE;
  snapshot.review = review;
  snapshot.reviewCheckpoints = reviewCheckpoints();
  if (viewerSeat === SPECTATOR_SEAT) {
    delete snapshot.bank;
    delete snapshot.hand;
    delete snapshot.handOrder;
  }
  return snapshot;
}

/** A review of a checkpoint, asked by one seat; `agreed` seats have agreed, and it runs once they are a majority. */
export function reviewOf(
  snapshot: GameSnapshot,
  checkpoint: ReviewCheckpoint,
  proposer: string,
  agreed: readonly string[] = []
): TableReview {
  const players = snapshot.controls?.players ?? [];
  const ballots = players.map((player) => ({
    name: player.name,
    seat: player.seat,
    choice: player.seat === proposer || agreed.includes(player.seat) ? ('review' as const) : null,
  }));
  const threshold = reviewThreshold(players.length);
  return {
    id: `review-${checkpoint.step}`,
    step: checkpoint.step,
    context: checkpoint.context,
    proposer: { name: players.find((player) => player.seat === proposer)?.name ?? proposer, seat: proposer },
    openedAt: 0,
    threshold,
    ballots,
    startedAt: ballots.filter((ballot) => ballot.choice === 'review').length >= threshold ? 1 : null,
  };
}

/** The public table a checkpoint shows: the live table's phase then, with nothing private. */
export function checkpointSnapshot(step: number): GameSnapshot {
  const { hand: _hand, bank: _bank, handOrder: _order, battlePlan: _plan, ...past } = playingSnapshot();
  return { ...past, phase: Math.max(0, step - FIRST_PLAY_STEP) };
}

/**
 * A table that answers the review as the room would: a proposal opens a vote, the other players agree a moment later, the shown checkpoint is sent to the page that asks for it, and Resume play ends the review.
 */
export function reviewTransport(
  viewerSeat: string,
  review: TableReview | null = null,
  { agreeAfterMs = 1500 as number | null } = {}
) {
  let live = reviewableSnapshot(viewerSeat, review);
  let revision = live.revision;
  /* The other players' agreement to the viewer's own proposal, until they have agreed. */
  let agree: (() => void) | null = null;
  const transport = productTransport(viewerSeat, live, {
    receive: (message) => {
      if (message.type === 'history') {
        queueMicrotask(() =>
          transport.deliver({
            type: 'history',
            step: message.step,
            lastStep: reviewCheckpoints().at(-1)!.step,
            snapshot: checkpointSnapshot(message.step),
          })
        );
        return true;
      }
      if (message.type !== 'command') {
        return false;
      }
      const { action } = message;
      const current = live.review ?? null;
      let next: TableReview | null | undefined;
      if (action.kind === 'review-propose') {
        const checkpoint = reviewCheckpoints().find((entry) => entry.step === action.step)!;
        const proposed = reviewOf(live, checkpoint, viewerSeat);
        next = proposed;
        agree = () => {
          agree = null;
          const others = live.controls!.players.filter((player) => player.seat !== viewerSeat).map((p) => p.seat);
          publish(reviewOf(live, checkpoint, viewerSeat, others.slice(0, proposed.threshold - 1)));
        };
        if (agreeAfterMs !== null) {
          setTimeout(() => agree?.(), agreeAfterMs);
        }
      } else if (action.kind === 'review-ballot' && current) {
        next = {
          ...current,
          ballots: current.ballots.map((ballot) =>
            ballot.seat === viewerSeat ? { ...ballot, choice: action.choice } : ballot
          ),
        };
        const agreed = next.ballots.filter((ballot) => ballot.choice === 'review').length;
        const open = next.ballots.filter((ballot) => ballot.choice === null).length;
        next = agreed >= next.threshold ? { ...next, startedAt: 1 } : agreed + open < next.threshold ? null : next;
      } else if (action.kind === 'review-end') {
        agree = null;
        next = null;
      }
      if (next === undefined) {
        return false;
      }
      const answer = next;
      queueMicrotask(() => publish(answer, message.commandId));
      return true;
    },
  });
  function publish(next: TableReview | null, commandId?: string) {
    revision += 1;
    live = { ...live, revision, review: next };
    transport.deliver(transport.view(live, commandId));
  }
  return Object.assign(transport, {
    /** Has the other players agree to the viewer's open proposal now. */
    othersAgree: () => agree?.(),
  });
}
