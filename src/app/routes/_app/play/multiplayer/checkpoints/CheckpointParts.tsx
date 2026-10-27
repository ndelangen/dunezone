import { Tooltip, UnstyledButton } from '@mantine/core';

import { useAssetResolver } from '@game/assets/assetRenderMode';

import styles from './CheckpointPicker.module.css';
import type { CheckpointPhase, CheckpointTurn } from './checkpointTurns';
import { momentLabel, phaseHolding } from './checkpointTurns';

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

/** A phase as one button: its disc, which picks the phase's start, ringed while any of its moments is chosen and marked when it holds more than its start. */
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
  const selected = phase.checkpoints.some((checkpoint) => checkpoint.step === value);
  const later = phase.checkpoints.length - 1;
  return (
    <Tooltip label={`${turnLabel}, ${phase.label}${later > 0 ? ` · ${later + 1} checkpoints` : ''}`} withinPortal>
      <UnstyledButton
        className={styles.phase}
        data-selected={selected || undefined}
        aria-pressed={selected}
        aria-label={`${turnLabel}, ${phase.label}`}
        onClick={() => onChange(phase.checkpoints[0]!.step)}
      >
        <PhaseDisc symbol={phase.symbol} label={phase.label} size={size} />
        {later > 0 && <span className={styles.count}>{later}</span>}
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * The moments of the chosen checkpoint's phase, when it holds more than its start: each faction's Shipment and Movement, each settled battle, a result.
 * They sit under the picker, named in full, so a phase's discs stay one size however much it holds.
 */
export function MomentStrip({
  turns,
  value,
  onChange,
}: Readonly<{ turns: readonly CheckpointTurn[]; value: number | null; onChange: (step: number) => void }>) {
  const holding = phaseHolding(turns, value);
  if (!holding || holding.phase.checkpoints.length < 2) {
    return null;
  }
  const { turn, phase } = holding;
  return (
    <div className={styles.momentStrip} role="group" aria-label={`Moments in ${turn.label}, ${phase.label}`}>
      {phase.checkpoints.map((checkpoint) => (
        <UnstyledButton
          key={checkpoint.step}
          className={styles.moment}
          data-selected={checkpoint.step === value || undefined}
          aria-pressed={checkpoint.step === value}
          onClick={() => onChange(checkpoint.step)}
        >
          {momentLabel(phase, checkpoint)}
        </UnstyledButton>
      ))}
    </div>
  );
}
