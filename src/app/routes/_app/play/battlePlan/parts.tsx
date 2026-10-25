import { Button, Popover, Slider, Tooltip, UnstyledButton } from '@mantine/core';
import type { BattleFace, BattlePlan, Disclosure } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import clsx from 'clsx';
import { Check, Diff, Eye, EyeOff, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { ReactNode, WheelEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import compassStyles from '../compass/CompassControls.module.css';
import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import styles from './parts.module.css';
import { FREE_SUPPORT_HELP, MODE_HELP, formatStrength, isShown, spiceMatters } from './planView';
import type { BattlePlanViewProps, Opponent, WheelArt } from './planView';

/**
 * The rare strength adjustment, folded into a small button beside the strength it changes: it reads ± until set, then the adjustment itself, and opens a half-step stepper.
 */
export function AdjustButton({
  plan,
  disabled,
  onEdit,
}: {
  plan: BattlePlan;
  disabled: boolean;
  onEdit: BattlePlanViewProps['onEdit'];
}) {
  const { adjustment } = plan;
  const shown = adjustment ? `${adjustment > 0 ? '+' : '−'}${formatStrength(Math.abs(adjustment))}` : null;
  return (
    <Popover position="bottom" withArrow shadow="md">
      <Tooltip label="Adjust the strength by hand, for what the plan does not count" withArrow>
        <Popover.Target>
          <UnstyledButton
            className={styles.adjustButton}
            data-set={shown ? true : undefined}
            aria-label={`Adjust the strength by hand${shown ? `, now ${shown}` : ''}`}
          >
            {shown ?? <Diff size={13} />}
          </UnstyledButton>
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown className={styles.adjust}>
        <span>Adjust</span>
        <Stepper
          size="sm"
          label="Adjustment"
          value={adjustment}
          min={-20}
          max={20}
          step={0.5}
          format={formatStrength}
          disabled={disabled}
          onChange={(next) => onEdit({ adjustment: next })}
        />
      </Popover.Dropdown>
    </Popover>
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
function Stepper({
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
    stepBy(event.deltaY < 0 ? step : -step);
  };
  /* What the field holds now: a valid typed count, or the plan's own. */
  const current = () => {
    const typed = draft === null || draft.trim() === '' ? NaN : Number(draft);
    return Number.isFinite(typed) ? Math.round(typed / step) * step : value;
  };
  /* A step from the wheel, a key or a button starts from what the field shows, typed or not, and settles the field. */
  const stepBy = (delta: number) => {
    go(current() + delta);
    setDraft(null);
  };
  const commit = () => {
    if (draft !== null) {
      go(current());
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
        onClick={() => stepBy(-step)}
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
            stepBy(event.key === 'ArrowUp' ? step : -step);
          }
        }}
      />
      {suffix ? <span className={styles.stepSuffix}>{suffix}</span> : null}
      <UnstyledButton
        className={styles.stepButton}
        aria-label={`More: ${label}`}
        disabled={disabled}
        onClick={() => stepBy(step)}
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
  free,
  onChange,
}: {
  mode: BattlePlan['mode'];
  disabled?: boolean;
  /** No troop needs spice to fight at full strength, so there is nothing to choose. */
  free?: boolean;
  onChange: (mode: BattlePlan['mode']) => void;
}) {
  const custom = mode === 'custom';
  return (
    <Tooltip label={free ? FREE_SUPPORT_HELP : MODE_HELP} multiline w={260} withArrow>
      <button
        type="button"
        className={clsx(compassStyles.iconButton, styles.modeToggle)}
        aria-pressed={custom}
        aria-label={custom ? 'Custom support: on' : 'Custom support: off, spice supports as many troops as it can'}
        disabled={disabled || free}
        onClick={() => onChange(custom ? 'max' : 'custom')}
      >
        <SlidersHorizontal size={16} />
        {custom ? 'Custom' : null}
      </button>
    </Tooltip>
  );
}

/** The dial's rows, lined up in shared columns. */
export function DialGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className={styles.dial} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** One row of the dial: a slider to sweep a count and a stepper to nudge it, both on the same value. */
export function DialRow({
  label,
  sub,
  name,
  value,
  max,
  disabled,
  onChange,
  spice,
}: {
  /** The row's label, such as the troop's token; a second row of the same troop leaves it out. */
  label?: ReactNode;
  /** Beside the label: plain or spiced in Custom mode, or a quick button. */
  sub?: ReactNode;
  name: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
  spice?: boolean;
}) {
  /* The slider's value follows the thumb and is sent once, when the thumb is let go; the stepper sends each step. */
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className={styles.dialRow} data-spice={spice || undefined}>
      <span className={styles.dialLabel}>{label}</span>
      <span className={styles.dialSub}>{sub}</span>
      <Slider
        className={styles.dialSlider}
        aria-label={name}
        thumbLabel={name}
        min={0}
        max={Math.max(max, 1)}
        step={1}
        value={Math.min(shown, Math.max(max, 1))}
        disabled={disabled || max === 0}
        label={null}
        size="sm"
        onChange={setDraft}
        onChangeEnd={(next) => {
          setDraft(null);
          if (next !== value) {
            onChange(next);
          }
        }}
      />
      <span className={styles.dialStep}>
        <Stepper size="sm" label={name} value={shown} max={max} disabled={disabled} onChange={onChange} />
      </span>
    </div>
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

/** Who the plan is against, and whether they are ready yet. */
export function OpponentLine({ opponent }: { opponent: Opponent | null }) {
  return (
    <div className={styles.battleLine}>
      {opponent ? (
        <span className={styles.opponent} data-ready={opponent.ready || undefined}>
          <span
            className={styles.readyDot}
            aria-label={opponent.ready ? 'ready' : 'preparing'}
            title={opponent.ready ? `${opponent.name} is ready` : `${opponent.name} is still planning`}
            role="img"
          />
          <span>against {opponent.name}</span>
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
  adjust,
}: {
  props: Pick<BattlePlanViewProps, 'plan' | 'leaderStrength'>;
  /** The adjustment button, beside the total it changes. */
  adjust?: ReactNode;
}) {
  const { plan } = props;
  const leader = plan.leaderId ? props.leaderStrength?.[plan.leaderId] : undefined;
  const total = plan.strength + (leader ?? 0);
  return (
    <div className={styles.sum} aria-live="polite">
      <span className={styles.sumTop}>
        <span className={styles.sumValue}>
          <RollingNumber value={total} />
        </span>
        {adjust}
      </span>
      <span className={styles.sumParts}>
        <span>
          troops {formatStrength(plan.strength - plan.adjustment)}
          {plan.adjustment ? ` ${plan.adjustment > 0 ? '+' : '−'} ${formatStrength(Math.abs(plan.adjustment))}` : ''}
        </span>
        {leader !== undefined ? <span>leader {leader}</span> : null}
        {spiceMatters(plan) ? <span>{plan.spice} spice</span> : null}
      </span>
    </div>
  );
}
