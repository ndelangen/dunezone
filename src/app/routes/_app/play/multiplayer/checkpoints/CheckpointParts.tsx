import { Tooltip, UnstyledButton } from '@mantine/core';
import type { ReviewCheckpoint } from '@shared/play/review';

import { useAssetResolver } from '@game/assets/assetRenderMode';

import styles from './CheckpointPicker.module.css';
import type { CheckpointPhase } from './checkpointTurns';
import { momentLabel, momentMark } from './checkpointTurns';

/** A phase's symbol on a sand disc, as the turn tracker draws it; a setup step without one shows its initial. */
export function PhaseDisc({
  symbol,
  label,
  size = 20,
}: Readonly<{ symbol: string | null; label: string; size?: number }>) {
  const resolve = useAssetResolver();
  return (
    <span className={styles.disc} style={{ width: size, height: size }} aria-hidden>
      {symbol ? <img src={resolve(symbol)} alt="" /> : label.slice(0, 1)}
    </span>
  );
}

/** A phase as one button: its disc, which picks the phase's start. */
export function PhaseButton({
  phase,
  value,
  onChange,
  turnLabel,
  size,
}: Readonly<{
  phase: CheckpointPhase;
  value: number | null;
  onChange: (step: number) => void;
  turnLabel: string;
  size?: number;
}>) {
  const selected = phase.checkpoints[0]!.step === value;
  return (
    <Tooltip label={`${turnLabel}, ${phase.label}`} withinPortal>
      <UnstyledButton
        className={styles.phase}
        data-selected={selected || undefined}
        aria-pressed={selected}
        aria-label={`${turnLabel}, ${phase.label}`}
        onClick={() => onChange(phase.checkpoints[0]!.step)}
      >
        <PhaseDisc symbol={phase.symbol} label={phase.label} size={size} />
      </UnstyledButton>
    </Tooltip>
  );
}

/** The moments a phase holds after its start, beside its disc: each settled battle's number, and R for a result. */
export function MomentDots({
  phase,
  value,
  onChange,
}: Readonly<{ phase: CheckpointPhase; value: number | null; onChange: (step: number) => void }>) {
  const later = phase.checkpoints.slice(1);
  if (later.length === 0) {
    return null;
  }
  return (
    <span className={styles.moments} role="group" aria-label={`Moments in ${phase.label}`}>
      {later.map((checkpoint: ReviewCheckpoint) => (
        <Tooltip key={checkpoint.step} label={momentLabel(phase, checkpoint)} withinPortal>
          <UnstyledButton
            className={styles.moment}
            data-selected={checkpoint.step === value || undefined}
            aria-pressed={checkpoint.step === value}
            aria-label={momentLabel(phase, checkpoint)}
            onClick={() => onChange(checkpoint.step)}
          >
            {momentMark(phase, checkpoint)}
          </UnstyledButton>
        </Tooltip>
      ))}
    </span>
  );
}
