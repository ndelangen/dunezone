import { Slider, UnstyledButton } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { TopicIcon } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import type { DragEvent, ReactNode } from 'react';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import { AdjustField, Stepper, TroopLabel } from './parts';
import { PlanHead } from './PlanHead';
import {
  availableSpice,
  capableFaces,
  cardsOf,
  leadersOf,
  planLocks,
  planPieces,
  setTotal,
  supportedMax,
  toggleCard,
  totalOf,
  troopLimitOf,
  troopsOf,
  withTroops,
} from './planView';
import type { BattlePlanViewProps } from './planView';
import styles from './TrayPlan.module.css';

const DRAG_TYPE = 'application/dune-plan-piece';

/**
 * Pieces glide from where they were to where they are now: each tile's box is noted before a change, and once the change has drawn, a piece that moved plays from its old box to its new one (first, last, invert, play).
 */
function useGlide() {
  const motion = useMotionAllowed();
  const nodes = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, DOMRect>());
  const note = () => {
    before.current = new Map([...nodes.current].map(([id, node]) => [id, node.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    if (!motion || !before.current.size) {
      return;
    }
    for (const [id, node] of nodes.current) {
      const first = before.current.get(id);
      if (!first) {
        continue;
      }
      const last = node.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) + Math.abs(dy) < 2) {
        continue;
      }
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${first.width / last.width})` },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.3, 1.2, 0.4, 1)' }
      );
    }
    before.current = new Map();
  });
  const ref = (id: string) => (node: HTMLElement | null) => {
    if (node) {
      nodes.current.set(id, node);
    } else {
      nodes.current.delete(id);
    }
  };
  return { note, ref };
}

/**
 * Variant D, the tray: the plan's slots sit above the hand.
 * One click, or a drag, moves a piece across, and the piece glides there;
 * sliders set the troops and the spice in one sweep.
 */
export function TrayPlan(props: BattlePlanViewProps) {
  const { plan, hand, balance, onEdit } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const faces = capableFaces(plan);
  const glide = useGlide();
  const [over, setOver] = useState<'plan' | 'hand' | null>(null);
  const inHand = [...leadersOf(pieces), ...cardsOf(pieces)].filter(
    (entry) => entry.id !== plan.leaderId && !plan.cardIds.includes(entry.id)
  );
  const move = (piece: TablePiece, into: 'plan' | 'hand') => {
    glide.note();
    if (piece.kind === 'card') {
      if (plan.cardIds.includes(piece.id) !== (into === 'plan')) {
        onEdit(toggleCard(plan, piece.id));
      }
    } else {
      onEdit({ leaderId: into === 'plan' ? piece.id : null });
    }
  };
  const lockedFor = (piece: TablePiece) => (piece.kind === 'card' ? locks.cardLocked(piece.id) : locks.leaderLocked);
  const drop = (into: 'plan' | 'hand') => (event: DragEvent) => {
    event.preventDefault();
    setOver(null);
    const piece = pieces.find((entry) => entry.id === event.dataTransfer.getData(DRAG_TYPE));
    if (piece && !lockedFor(piece)) {
      move(piece, into);
    }
  };
  const zone = (into: 'plan' | 'hand') => ({
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes(DRAG_TYPE)) {
        event.preventDefault();
        setOver(into);
      }
    },
    onDragLeave: () => setOver(null),
    onDrop: drop(into),
    'data-over': over === into || undefined,
  });
  /* A piece on the wheel fills the wheel's own slot; one in the hand is a small tile. */
  const tile = (piece: TablePiece, into: 'plan' | 'hand', onWheel = false) => (
    <div key={piece.id} ref={glide.ref(piece.id)} className={clsx(styles.piece, onWheel && styles.onWheel)}>
      <UnstyledButton
        className={clsx(styles.pieceButton, piece.kind !== 'card' && styles.round)}
        draggable={!lockedFor(piece)}
        onDragStart={(event) => event.dataTransfer.setData(DRAG_TYPE, piece.id)}
        disabled={lockedFor(piece)}
        aria-label={`${into === 'plan' ? 'Put' : 'Take'} ${pieceName(piece)} ${into === 'plan' ? 'into the plan' : 'back into your hand'}`}
        title={pieceName(piece)}
        onClick={() => move(piece, into)}
      >
        {onWheel ? (
          <PieceImage piece={piece} />
        ) : (
          <PieceImage piece={piece} width={piece.kind === 'card' ? 40 : 44} height={piece.kind === 'card' ? 56 : 44} />
        )}
      </UnstyledButton>
    </div>
  );
  return (
    <div className={styles.tray}>
      <PlanHead view={props} wheelBox={zone('plan')} renderPiece={(piece) => tile(piece, 'hand', true)} reveals />
      <section className={styles.dial} aria-label="Dial">
        {plan.mode === 'max' ? (
          <>
            {faces.map((face) => (
              <PlanSlider
                key={face.id}
                label={<TroopLabel face={face} wheelArt={props.wheelArt} />}
                name={face.name}
                value={totalOf(plan, face.id)}
                max={troopLimitOf(props, face.id)}
                disabled={locks.dialLocked}
                onCommit={(total) => onEdit(setTotal(plan, face.id, total))}
              />
            ))}
            <PlanSlider
              label={<TopicIcon topic="spice" size={18} className={styles.spiceIcon} />}
              name="Spice"
              value={plan.spice}
              max={availableSpice(plan, balance)}
              disabled={locks.dialLocked}
              onCommit={(spice) => onEdit({ spice })}
              spice
            />
          </>
        ) : (
          faces.map((face) => {
            const own = troopsOf(plan, face.id);
            const limit = troopLimitOf(props, face.id);
            return (
              <Fragment key={face.id}>
                <PlanSlider
                  label={<TroopLabel face={face} wheelArt={props.wheelArt} />}
                  sub="plain"
                  rows={2}
                  name={`${face.name} plain`}
                  value={own.undialed}
                  max={limit - own.dialed}
                  disabled={locks.dialLocked}
                  onCommit={(undialed) => onEdit({ troops: withTroops(plan, face.id, { undialed }) })}
                />
                <PlanSlider
                  sub="spiced"
                  name={`${face.name} spiced`}
                  value={own.dialed}
                  max={Math.min(limit - own.undialed, supportedMax(plan, face, balance) ?? limit)}
                  disabled={locks.dialLocked}
                  onCommit={(dialed) => onEdit({ troops: withTroops(plan, face.id, { dialed }) })}
                  spice
                />
              </Fragment>
            );
          })
        )}
        <div className={styles.adjust}>
          <AdjustField plan={plan} disabled={locks.dialLocked} onEdit={onEdit} />
        </div>
      </section>
      <section className={styles.hand} aria-label="Your hand" {...zone('hand')}>
        {inHand.map((piece) => tile(piece, 'plan'))}
        {inHand.length ? null : <span className={styles.empty}>Everything is in the plan</span>}
      </section>
    </div>
  );
}

/**
 * One row of the dial: a slider to sweep a count and a stepper to nudge it, both on the same value.
 * The slider's value follows the thumb and is sent once, when the thumb is let go;
 * the stepper sends each step.
 */
function PlanSlider({
  label,
  sub,
  rows = 1,
  name,
  value,
  max,
  disabled,
  onCommit,
  spice,
}: {
  /** The row's label, such as the troop token; a second row of the same troop leaves it out. */
  label?: ReactNode;
  /** Plain or spiced, in Custom mode. */
  sub?: string;
  /** How many rows the label spans. */
  rows?: number;
  name: string;
  value: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  spice?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className={styles.row} data-spice={spice || undefined}>
      {label ? (
        <span className={styles.rowLabel} style={{ gridRow: `span ${rows}` }}>
          {label}
        </span>
      ) : null}
      <span className={styles.sub}>{sub}</span>
      <Slider
        className={styles.slider}
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
            onCommit(next);
          }
        }}
      />
      <span className={styles.nudge}>
        <Stepper size="sm" label={name} value={shown} max={max} disabled={disabled} onChange={onCommit} />
      </span>
    </div>
  );
}
