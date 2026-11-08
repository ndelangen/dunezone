import { Popover, Slider, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
/* oxlint-disable-next-line no-restricted-imports -- The battle plan's Ready toggle stacks its state over Undo, a shape no kit action has. */
import { Button } from '@mantine/core';
import type { BattleFace, BattlePlan, Disclosure } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { Stepper } from '@ui/control/Stepper';
import { TooltipTarget } from '@ui/control/TooltipTarget';
import clsx from 'clsx';
import { Check, Diff, Eye, EyeOff, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import compassStyles from '../../compass/CompassControls.module.css';
import { PieceImage, pieceName } from '../../multiplayer/HandPiece';
import styles from './parts.module.css';
import { FREE_SUPPORT_HELP, MODE_HELP, formatStrength, isShown, spiceBonus, spiceMatters } from './planView';
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
    <Popover position="bottom" withArrow shadow="md" withinPortal={false}>
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
          label="Adjustment"
          value={adjustment}
          min={-20}
          max={20}
          step={0.5}
          snap={false}
          wheel="focus"
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

/*
 * The strength as rolling wheels, like an odometer: a wheel per whole place, then a half that opens beside them.
 * Everything follows one count of halves, which a spring carries towards the plan's total, so a quick run of changes keeps rolling from wherever the wheels are.
 */
const HALF = ['', '½'];
const FIGURES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
/* About half a second to settle, with a hair of overshoot so the wheels land rather than stop. */
const STIFFNESS = 150;
const DAMPING = 19;

/* Where a wheel worth `size` stands for the whole number `whole`: it turns only while the wheel below it rolls over from 9. */
function wheelPosition(whole: number, size: number) {
  if (size === 1) {
    return whole;
  }
  const below = whole % size;
  return Math.floor(whole / size) + Math.max(0, below - (size - 1));
}

/* How open a leading place is: shut below its first step, open from it on, opening as its wheel rolls in. */
function leadOpen(position: number) {
  return Math.min(1, Math.max(0, position));
}

function useSpring(target: number, motion: boolean) {
  /* `live` is the verdict the shown value belongs to: one that motion turned back on for starts from the target, not from where it was left. */
  const [shown, setShown] = useState({ at: target, live: motion });
  if (shown.live !== motion) {
    setShown({ at: target, live: motion });
  }
  const state = useRef({ at: target, speed: 0 });
  useEffect(() => {
    if (!motion) {
      state.current = { at: target, speed: 0 };
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const spring = state.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      spring.speed += (STIFFNESS * (target - spring.at) - DAMPING * spring.speed) * dt;
      spring.at += spring.speed * dt;
      const settled = Math.abs(target - spring.at) < 0.002 && Math.abs(spring.speed) < 0.01;
      if (settled) {
        spring.at = target;
        spring.speed = 0;
      }
      setShown({ at: spring.at, live: true });
      if (!settled) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, motion]);
  return motion && shown.live === motion ? shown.at : target;
}

function Wheel({ faces, position, open, slot }: { faces: string[]; position: number; open: number; slot: string }) {
  const turn = ((position % faces.length) + faces.length) % faces.length;
  return (
    <span className={styles.wheel} aria-hidden="true" style={{ width: `calc(${slot} * ${open})`, opacity: open }}>
      <span className={styles.wheelFaces} style={{ translate: `0 calc(${-turn} * var(--wheel-face))` }}>
        {[...faces, faces[0]].map((face, index) => (
          <span key={index}>{face}</span>
        ))}
      </span>
    </span>
  );
}

/** The strength on rolling wheels that carry it smoothly to each new total; a negative total, or reduced motion, shows as plain text. */
function SlidingNumber({ value }: { value: number }) {
  const motion = useMotionAllowed();
  /* The wheels hold wholes and halves; a total with a finer fraction (a typed adjustment of a quarter, say), or a negative one, is plain text. */
  const wheeled = value >= 0 && Number.isInteger(value * 2);
  const halves = useSpring(value * 2, motion && wheeled);
  const [roll, setRoll] = useState({ to: value * 2, from: value * 2 });
  /* The half opens only near an end of the roll that has one, so a roll between whole numbers never flickers a half on the way. */
  const near = (end: number) => (Math.abs(end % 2) === 1 ? Math.max(0, 1 - Math.abs(end - halves)) : 0);
  const half = Math.max(near(roll.to), near(roll.from));
  /* A new total sets off from where the wheels stand: on a half if it shows, otherwise on the nearest whole. */
  if (roll.to !== value * 2) {
    setRoll({ to: value * 2, from: half > 0.5 ? Math.round(halves) : 2 * Math.round(halves / 2) });
  }
  if (!motion || !wheeled || halves < 0) {
    return <>{formatStrength(value)}</>;
  }
  /* The whole number the wheels stand on: it rolls smoothly between wholes and rests while the half opens or closes. */
  const whole = Math.max(0, (halves - half) / 2);
  const places = Math.max(1, String(Math.floor(Math.max(value, whole + 1))).length);
  return (
    <span className={styles.wheels}>
      <VisuallyHidden>{formatStrength(value)}</VisuallyHidden>
      {Array.from({ length: places }, (_, index) => {
        const place = places - 1 - index;
        const position = wheelPosition(whole, 10 ** place);
        /* Below one, a bare half drops its nought, as the plain strength writes it. */
        const open = place === 0 ? (whole < 1 ? 1 - half : 1) : leadOpen(position);
        return <Wheel key={place} faces={FIGURES} position={position} open={open} slot="1ch" />;
      })}
      <Wheel faces={HALF} position={1} open={half} slot="1.35ch" />
    </span>
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
  /*
   * The slider sends each step as the thumb crosses it, so the strength follows the drag live; the battle queue merges
   * steps sent while one is still unanswered. The draft holds the thumb where it is until the plan catches up.
   * Mantine keeps the drag listeners it installed when the gesture began, so the handlers read the plan and the last
   * step sent through refs rather than from the render that started the drag.
   */
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const latest = useRef({ value, onChange });
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });
  const sent = useRef<number | null>(null);
  const send = (next: number) => {
    if (next !== (sent.current ?? latest.current.value)) {
      sent.current = next;
      latest.current.onChange(next);
    }
  };
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
        onChange={(next) => {
          setDraft(next);
          send(next);
        }}
        /* Letting go makes sure the endpoint was sent, then hands the thumb back to the plan. */
        onChangeEnd={(end) => {
          send(end);
          sent.current = null;
          setDraft(null);
        }}
      />
      <span className={styles.dialStep}>
        <Stepper size="sm" label={name} value={shown} max={max} disabled={disabled} wheel="focus" onChange={onChange} />
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
        {artwork ? (
          <TroopToken {...artwork} />
        ) : (
          /* Without the faction's artwork the token is the troop's initial, so the label keeps its round size. */
          <span className={styles.troopInitial} aria-hidden="true">
            {face.name.slice(0, 1)}
          </span>
        )}
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
      <Tooltip label={name} withArrow>
        <TooltipTarget>
          <UnstyledButton
            className={styles.tileButton}
            aria-pressed={selected}
            aria-label={`${selected ? 'Take' : 'Put'} ${name} ${selected ? 'out of' : 'into'} the plan`}
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
        </TooltipTarget>
      </Tooltip>
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
          <Tooltip
            label={opponent.ready ? `${opponent.name} is ready` : `${opponent.name} is still planning`}
            withArrow
          >
            <span className={styles.readyDot} aria-label={opponent.ready ? 'ready' : 'preparing'} role="img" />
          </Tooltip>
          <Tooltip label={`against ${opponent.name}`} withArrow>
            <span className={styles.opponentName}>against {opponent.name}</span>
          </Tooltip>
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
  const waiting = ready && opponent && !opponent.ready ? 'Waiting' : null;
  return (
    <Tooltip
      label={`${waiting && opponent ? `Waiting for ${opponent.name}. ` : ''}Undo to reopen the plan`}
      disabled={!ready}
      withArrow
    >
      <Button
        className={styles.ready}
        data-ready={ready || undefined}
        data-bump={bump}
        fullWidth={fullWidth}
        variant={ready ? 'default' : 'filled'}
        disabled={!canAct}
        onClick={() => onReady(!ready)}
        /* One name per action, however the label reads: Ready for battle, or Undo Ready. */
        aria-label={ready ? 'Undo Ready' : 'Ready for battle'}
      >
        {ready ? (
          /* The state on top and Undo under it, so the label never runs wider than its longest word. */
          <span className={styles.readyStack}>
            <span>{waiting ?? (stage === 'countdown' ? 'Revealing…' : 'Ready')}</span>
            <small>Undo</small>
          </span>
        ) : (
          (children ?? 'Ready for battle')
        )}
      </Button>
    </Tooltip>
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
  /* A leader's printed strength counts only where the faction names it; otherwise the token on the wheel shows it. */
  const strengths = plan.leaderIds.map((id) => props.leaderStrength?.[id]);
  const leader =
    strengths.length && strengths.every((value) => value !== undefined)
      ? strengths.reduce((total, value) => total + value, 0)
      : undefined;
  const total = plan.strength + (leader ?? 0);
  const bonus = spiceBonus(plan);
  return (
    <div className={styles.sum} aria-live="polite">
      <span className={styles.sumTop}>
        <span className={styles.sumValue}>
          <SlidingNumber value={total} />
        </span>
        {adjust}
      </span>
      <span className={styles.sumParts}>
        <span>
          troops {formatStrength(plan.strength - plan.adjustment - bonus)}
          {plan.adjustment ? ` ${plan.adjustment > 0 ? '+' : '−'} ${formatStrength(Math.abs(plan.adjustment))}` : ''}
        </span>
        {leader !== undefined ? (
          <span>
            {plan.leaderIds.length > 1 ? 'leaders' : 'leader'} {leader}
          </span>
        ) : null}
        {bonus ? <span>spice strength +{bonus}</span> : null}
        {spiceMatters(plan) ? <span>{plan.spice} spice</span> : null}
      </span>
    </div>
  );
}
