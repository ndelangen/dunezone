import { Button, Tooltip, UnstyledButton } from '@mantine/core';
import type { BattleFace, BattlePlan, Disclosure } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import clsx from 'clsx';
import { Check, Eye, EyeOff, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { ReactNode, WheelEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import compassStyles from '../compass/CompassControls.module.css';
import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import styles from './parts.module.css';
import { MODE_HELP, formatStrength, isShown } from './planView';
import type { BattlePlanViewProps, Opponent, WheelArt } from './planView';

/** The rare strength adjustment, kept small beside the mode switch: a half-step stepper with its name. */
export function AdjustField({
  plan,
  disabled,
  onEdit,
}: {
  plan: BattlePlan;
  disabled: boolean;
  onEdit: BattlePlanViewProps['onEdit'];
}) {
  return (
    <span className={styles.adjust} title="Strength added or taken by hand, for what the plan does not count">
      <span>Adjust</span>
      <Stepper
        size="sm"
        label="Adjustment"
        value={plan.adjustment}
        min={-20}
        max={20}
        step={0.5}
        format={formatStrength}
        disabled={disabled}
        onChange={(adjustment) => onEdit({ adjustment })}
      />
    </span>
  );
}

/** A value that replays an animation each time it changes: alternates 0 and 1, so the attribute changes on every bump. */
export function useBump(value: unknown) {
  const [bump, setBump] = useState<number | undefined>(undefined);
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setBump((before) => (before === 0 ? 1 : 0));
  }
  return bump;
}

/** A number that counts to its new value instead of jumping, so a change reads as a change. */
function RollingNumber({ value, format = formatStrength }: { value: number; format?: (value: number) => string }) {
  const motion = useMotionAllowed();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!motion) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 260);
      const eased = 1 - (1 - t) ** 3;
      const next = origin + (value - origin) * eased;
      from.current = next;
      setShown(t === 1 ? value : Math.round(next * 2) / 2);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, motion]);
  return <>{format(motion ? shown : value)}</>;
}

type StepperProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** Shown after the value, such as "of 12". */
  suffix?: ReactNode;
  format?: (value: number) => string;
  size?: 'sm' | 'md';
};

/**
 * A count with − and + either side: one click per step, the wheel over it steps too, and typing commits on Enter or blur.
 * At either end the value knocks against its limit instead of silently refusing.
 */
export function Stepper({
  label,
  value,
  min = 0,
  max = Infinity,
  step = 1,
  disabled,
  onChange,
  suffix,
  format = String,
  size = 'md',
}: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [knock, setKnock] = useState<number | undefined>(undefined);
  const bump = useBump(value);
  const go = (next: number) => {
    const bounded = Math.min(max, Math.max(min, next));
    if (bounded === value) {
      setKnock((before) => (before === 0 ? 1 : 0));
      return;
    }
    onChange(bounded);
  };
  const wheel = (event: WheelEvent) => {
    if (disabled || !event.deltaY) {
      return;
    }
    go(value + (event.deltaY < 0 ? step : -step));
  };
  const commit = () => {
    if (draft !== null) {
      const typed = Number(draft);
      if (draft.trim() !== '' && Number.isFinite(typed)) {
        go(Math.round(typed / step) * step);
      }
      setDraft(null);
    }
  };
  return (
    <div
      className={clsx(styles.stepper, size === 'sm' && styles.stepperSmall)}
      data-knock={knock}
      data-disabled={disabled || undefined}
      onWheel={wheel}
      role="group"
      aria-label={label}
    >
      <UnstyledButton
        className={styles.stepButton}
        aria-label={`Fewer: ${label}`}
        disabled={disabled}
        onClick={() => go(value - step)}
      >
        <Minus size={14} />
      </UnstyledButton>
      <input
        className={styles.stepValue}
        data-bump={bump}
        aria-label={label}
        inputMode="decimal"
        disabled={disabled}
        value={draft ?? format(value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            go(value + (event.key === 'ArrowUp' ? step : -step));
          }
        }}
      />
      {suffix ? <span className={styles.stepSuffix}>{suffix}</span> : null}
      <UnstyledButton
        className={styles.stepButton}
        aria-label={`More: ${label}`}
        disabled={disabled}
        onClick={() => go(value + step)}
      >
        <Plus size={14} />
      </UnstyledButton>
    </div>
  );
}

/**
 * Max or Custom as one icon button for the window's title bar: pressed is Custom, where the player sets the plain and spiced troops themselves.
 */
export function ModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: BattlePlan['mode'];
  disabled?: boolean;
  onChange: (mode: BattlePlan['mode']) => void;
}) {
  const custom = mode === 'custom';
  return (
    <Tooltip label={MODE_HELP} multiline w={260} withArrow>
      <button
        type="button"
        className={clsx(compassStyles.iconButton, styles.modeToggle)}
        aria-pressed={custom}
        aria-label={custom ? 'Custom support: on' : 'Custom support: off, spice supports as many troops as it can'}
        disabled={disabled}
        onClick={() => onChange(custom ? 'max' : 'custom')}
      >
        <SlidersHorizontal size={16} />
        {custom ? 'Custom' : null}
      </button>
    </Tooltip>
  );
}

/** A troop type named by its own token, as on the faction sheet; hovering it tells its name and what it does. */
export function TroopLabel({ face, wheelArt }: { face: BattleFace; wheelArt: WheelArt }) {
  const artwork = wheelArt.troops[face.id];
  const description = wheelArt.descriptions?.[face.id];
  return (
    <Tooltip
      label={
        <span className={styles.troopTip}>
          <b>{face.name}</b>
          {description ? <span>{description}</span> : null}
        </span>
      }
      multiline
      w={240}
      withArrow
    >
      <span className={styles.troopLabel} role="img" aria-label={face.name}>
        {artwork ? <TroopToken {...artwork} /> : face.name}
      </span>
    </Tooltip>
  );
}

/** Shows or hides one part of the plan for everyone before the reveal. */
export function RevealToggle({
  plan,
  part,
  name,
  disabled,
  onDisclose,
  className,
}: {
  plan: BattlePlan;
  part: Disclosure;
  name: string;
  disabled?: boolean;
  onDisclose: BattlePlanViewProps['onDisclose'];
  className?: string;
}) {
  const shown = isShown(plan, part);
  const label = shown ? `Hide ${name} again` : `Show ${name} to everyone now`;
  return (
    <Tooltip label={label} withArrow>
      <UnstyledButton
        className={clsx(styles.reveal, className)}
        data-shown={shown || undefined}
        aria-label={label}
        aria-pressed={shown}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onDisclose(part, !shown);
        }}
      >
        {shown ? <Eye size={13} /> : <EyeOff size={13} />}
      </UnstyledButton>
    </Tooltip>
  );
}

/** A leader or card the plan can take: one click puts it in, another takes it out. */
export function PieceTile({
  piece,
  selected,
  disabled,
  onToggle,
  width,
  reveal,
  className,
}: {
  piece: TablePiece;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  width?: number;
  /** The tile's reveal toggle, shown while the piece is in the plan. */
  reveal?: ReactNode;
  className?: string;
}) {
  const name = pieceName(piece);
  const leader = piece.kind !== 'card';
  const size = width ?? (leader ? 44 : 42);
  return (
    <div
      className={clsx(styles.tile, className)}
      data-selected={selected || undefined}
      data-leader={leader || undefined}
    >
      <UnstyledButton
        className={styles.tileButton}
        aria-pressed={selected}
        aria-label={`${selected ? 'Take' : 'Put'} ${name} ${selected ? 'out of' : 'into'} the plan`}
        title={name}
        disabled={disabled}
        onClick={onToggle}
      >
        <PieceImage piece={piece} width={size} height={leader ? size : Math.round(size * 1.4)} />
        {selected ? (
          <span className={styles.tileCheck} aria-hidden="true">
            <Check size={11} strokeWidth={3} />
          </span>
        ) : null}
      </UnstyledButton>
      {selected && reveal ? reveal : null}
    </div>
  );
}

/** The battle this plan is for, and whether the other side is ready yet. */
export function BattleLine({ territory, opponent }: { territory: string; opponent: Opponent | null }) {
  return (
    <div className={styles.battleLine}>
      <span className={styles.territory}>{territory}</span>
      {opponent ? (
        <span className={styles.opponent} data-ready={opponent.ready || undefined}>
          against {opponent.name}
          <span className={styles.readyDot} aria-label={opponent.ready ? 'ready' : 'preparing'} role="img" />
        </span>
      ) : (
        <span className={styles.opponent}>waiting for a second side</span>
      )}
    </div>
  );
}

/** Locks the plan in, or reopens it; once both sides are ready the countdown to the reveal starts. */
export function ReadyButton({
  ready,
  stage,
  canAct,
  opponent,
  onReady,
  fullWidth,
  children,
}: Pick<BattlePlanViewProps, 'ready' | 'stage' | 'canAct' | 'opponent' | 'onReady'> & {
  fullWidth?: boolean;
  children?: ReactNode;
}) {
  const bump = useBump(ready);
  if (stage === 'revealed') {
    return null;
  }
  /* The battle line already names the opponent and shows their readiness, so the button stays short enough for a slot. */
  const waiting = ready && opponent && !opponent.ready ? 'Waiting · Undo' : null;
  return (
    <Button
      className={styles.ready}
      data-ready={ready || undefined}
      data-bump={bump}
      fullWidth={fullWidth}
      variant={ready ? 'default' : 'filled'}
      disabled={!canAct}
      leftSection={ready ? <Check size={15} /> : null}
      onClick={() => onReady(!ready)}
      title={
        ready ? `${waiting && opponent ? `Waiting for ${opponent.name}. ` : ''}Undo to reopen the plan` : undefined
      }
    >
      {ready
        ? (waiting ?? (stage === 'countdown' ? 'Revealing… Undo' : 'Ready · Undo'))
        : (children ?? 'Ready for battle')}
    </Button>
  );
}

/** The strength the plan adds up to, with its parts underneath. */
export function StrengthSum({
  props,
  className,
  compact,
}: {
  props: Pick<BattlePlanViewProps, 'plan' | 'leaderStrength'>;
  className?: string;
  compact?: boolean;
}) {
  const { plan } = props;
  const leader = plan.leaderId ? props.leaderStrength?.[plan.leaderId] : undefined;
  const total = plan.strength + (leader ?? 0);
  return (
    <div className={clsx(styles.sum, compact && styles.sumCompact, className)} aria-live="polite">
      <span className={styles.sumValue}>
        <RollingNumber value={total} />
      </span>
      <span className={styles.sumParts}>
        <span>
          troops {formatStrength(plan.strength - plan.adjustment)}
          {plan.adjustment ? ` ${plan.adjustment > 0 ? '+' : '−'} ${formatStrength(Math.abs(plan.adjustment))}` : ''}
          {leader !== undefined ? ` + leader ${leader}` : ''}
        </span>
        <span>{plan.spice} spice</span>
      </span>
    </div>
  );
}
