import type { ConversationMessage } from '@shared/play/conversations';
import { recallConversation } from '@shared/play/conversations';
import { TABLE_PHASES } from '@shared/play/phases';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { reviewThreshold } from '@shared/play/review';
import type { ReviewCheckpoint, TableReview } from '@shared/play/review';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { coreColors } from '@shared/uiPalette';

import { STORYBOOK_NOW } from '@db/storybook';

import { playingSnapshot, productTransport } from './product.stories.fixture';

/* The live table plays Turn 1's Battle; its checkpoints run from the end of setup through each phase of the turn so far. */
const BATTLE = TABLE_PHASES.findIndex((phase) => phase.id === 'battle');
const FIRST_PLAY_STEP = 8;

export function reviewCheckpoints(): ReviewCheckpoint[] {
  return [
    {
      step: FIRST_PLAY_STEP - 1,
      context: 'Setup, Starting troops',
      turn: null,
      label: 'Starting troops',
      symbol: '/vector/icon/shipment_disc.svg',
      moment: 'entered',
      faction: null,
    },
    ...TABLE_PHASES.slice(0, BATTLE + 1).map((phase, index) => ({
      step: FIRST_PLAY_STEP + index,
      context: `Turn 1, ${phase.label}`,
      turn: 1,
      label: phase.label,
      symbol: phase.symbol,
      moment: 'entered' as const,
      faction: null,
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

/** The checkpoint's public board and only the viewing seat's recorded private inventory. */
function checkpointSnapshot(step: number, viewerSeat: string): GameSnapshot {
  const { battlePlan: _plan, ...past } = playingSnapshot(viewerSeat === SPECTATOR_SEAT ? 'seat-2' : viewerSeat);
  past.phase = Math.max(0, step - FIRST_PLAY_STEP);
  if (viewerSeat === SPECTATOR_SEAT) {
    delete past.hand;
    delete past.handOrder;
    delete past.bank;
  } else if (past.phase >= TABLE_PHASES.findIndex((phase) => phase.id === 'shipment-and-movement') && past.hand?.[0]) {
    past.hand[0] = { ...past.hand[0], hiddenZone: { x: 0.3, y: 0.4, turn: 2 } };
  }
  return past;
}

/**
 * A table that answers the review as the room would: a proposal opens a vote, the other players agree a moment later, the shown checkpoint is sent to the page that asks for it, and Return to the game ends the review.
 */
export function reviewTransport(
  viewerSeat: string,
  review: TableReview | null = null,
  { agreeAfterMs = 1500 as number | null } = {}
) {
  let live = reviewableSnapshot(viewerSeat, review);
  let revision = live.revision;
  const messages: ConversationMessage[] = [];
  const pointers = (live.controls?.players ?? [])
    .filter((player) => player.seat !== viewerSeat)
    .slice(0, 2)
    .map((player, index) => ({
      connectionId: `recall-${index}`,
      viewerSeat: player.seat,
      displayName: player.name,
      color: coreColors.progress,
      position: [index * 2 - 1, 0.15, index - 1] as [number, number, number],
      updatedAt: STORYBOOK_NOW,
    }));
  /* The other players' agreement to the viewer's own proposal, until they have agreed. */
  let agree: (() => void) | null = null;
  const transport = productTransport(viewerSeat, live, {
    admitView: () => ({ ...transport.view(live), pointers }),
    receive: (message) => {
      if (message.type === 'conversation-send' || message.type === 'conversation-history') {
        return receiveConversation(message);
      }
      if (message.type === 'history') {
        return receiveHistory(message);
      }
      if (message.type === 'command') {
        return receiveReview(message);
      }
      return false;
    },
  });
  function receiveConversation(
    message: Extract<ClientMessage, { type: 'conversation-send' | 'conversation-history' }>
  ) {
    const current = live.review;
    if (!current || current.startedAt === null || message.peerId !== recallConversation(current.id)) {
      return false;
    }
    if (message.type === 'conversation-history') {
      queueMicrotask(() =>
        transport.deliver({
          ...message,
          entries: messages.filter((entry) => entry.sequence < message.before),
          more: false,
        })
      );
    } else {
      const saved = {
        sequence: messages.length + 1,
        requestId: message.requestId,
        senderFactionId: message.factionId,
        author: live.controls?.players.find((player) => player.seat === viewerSeat)?.name ?? 'Player',
        text: message.text,
        savedAt: STORYBOOK_NOW,
      };
      messages.push(saved);
      queueMicrotask(() =>
        transport.deliver({
          type: 'conversation-message',
          factionId: message.factionId,
          peerId: message.peerId,
          message: saved,
        })
      );
    }
    return true;
  }
  function receiveHistory(message: Extract<ClientMessage, { type: 'history' }>) {
    queueMicrotask(() =>
      transport.deliver({
        type: 'history',
        ...(message.requestId ? { requestId: message.requestId } : {}),
        step: message.step,
        lastStep: reviewCheckpoints().at(-1)!.step,
        snapshot: checkpointSnapshot(message.step, viewerSeat),
      })
    );
    return true;
  }
  function receiveReview(message: Extract<ClientMessage, { type: 'command' }>) {
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
    } else if (action.kind === 'review-seek' && current && current.startedAt !== null) {
      const checkpoint = reviewCheckpoints().find((entry) => entry.step === action.step);
      next = current && checkpoint ? { ...current, step: checkpoint.step, context: checkpoint.context } : undefined;
    } else if (action.kind === 'review-end') {
      agree = null;
      messages.length = 0;
      next = null;
    }
    if (next === undefined) {
      return false;
    }
    const answer = next;
    queueMicrotask(() => publish(answer, message.commandId));
    return true;
  }
  function publish(next: TableReview | null, commandId?: string) {
    revision += 1;
    live = { ...live, revision, review: next };
    transport.deliver({ ...transport.view(live, commandId), pointers });
  }
  return Object.assign(transport, {
    /** Has the other players agree to the viewer's open proposal now. */
    othersAgree: () => agree?.(),
  });
}
