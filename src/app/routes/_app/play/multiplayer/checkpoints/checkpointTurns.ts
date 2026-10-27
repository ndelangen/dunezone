import type { ReviewCheckpoint } from '@shared/play/review';

/** One phase or setup step of a turn, with every checkpoint saved in it: entering it, then each settled battle or result. */
export type CheckpointPhase = {
  key: string;
  label: string;
  symbol: string | null;
  checkpoints: ReviewCheckpoint[];
};

/** A turn's checkpoints by phase, or setup's by step. */
export type CheckpointTurn = {
  key: string;
  turn: number | null;
  label: string;
  phases: CheckpointPhase[];
};

/** Groups checkpoints, oldest first, into turns and their phases in the order they were played. */
export function checkpointTurns(checkpoints: readonly ReviewCheckpoint[]): CheckpointTurn[] {
  const turns: CheckpointTurn[] = [];
  for (const checkpoint of checkpoints) {
    let turn = turns.at(-1);
    if (!turn || turn.turn !== checkpoint.turn) {
      turn = {
        key: `turn-${checkpoint.turn ?? 'setup'}-${checkpoint.step}`,
        turn: checkpoint.turn,
        label: checkpoint.turn === null ? 'Setup' : `Turn ${checkpoint.turn}`,
        phases: [],
      };
      turns.push(turn);
    }
    const phase = turn.phases.at(-1);
    /* Only a battle or a result stays in the phase it was saved in; entering a phase starts a new group, even the same one again. */
    if (phase && checkpoint.moment !== 'entered' && phase.label === checkpoint.label) {
      phase.checkpoints.push(checkpoint);
    } else {
      turn.phases.push({
        key: `phase-${checkpoint.step}`,
        label: checkpoint.label,
        symbol: checkpoint.symbol,
        checkpoints: [checkpoint],
      });
    }
  }
  return turns;
}

/** What a checkpoint shows within its phase: the phase's start, after its nth battle, or a declared result. */
export function momentLabel(phase: CheckpointPhase, checkpoint: ReviewCheckpoint): string {
  if (checkpoint.moment === 'entered') {
    return 'Start';
  }
  if (checkpoint.moment === 'result') {
    return 'Result';
  }
  const battles = phase.checkpoints.filter((entry) => entry.moment === 'battle');
  return `After battle ${battles.indexOf(checkpoint) + 1}`;
}

/** A short name for a moment beside a phase's disc: the battle's number, or R for a result. */
export function momentMark(phase: CheckpointPhase, checkpoint: ReviewCheckpoint): string {
  const label = momentLabel(phase, checkpoint);
  return label === 'Result' ? 'R' : label.replace('After battle ', '');
}

/** The checkpoint as one line: where it is, and which moment of the phase when the phase holds more than one. */
export function checkpointTitle(turns: readonly CheckpointTurn[], step: number): string | null {
  for (const turn of turns) {
    for (const phase of turn.phases) {
      const checkpoint = phase.checkpoints.find((entry) => entry.step === step);
      if (checkpoint) {
        const moment = phase.checkpoints.length > 1 ? ` · ${momentLabel(phase, checkpoint).toLowerCase()}` : '';
        return `${checkpoint.context}${moment}`;
      }
    }
  }
  return null;
}

export type CheckpointPickerProps = Readonly<{
  checkpoints: readonly ReviewCheckpoint[];
  value: number | null;
  onChange: (step: number) => void;
}>;
