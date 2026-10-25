import { Slider, UnstyledButton } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import clsx from 'clsx';
import type { DragEvent } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import { BattleLine, ModeSwitch, ReadyButton, RevealToggle, Stepper, StrengthSum } from './parts';
import {
  availableSpice,
  capableFaces,
  cardsOf,
  disclosure,
  formatStrength,
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
  const { plan, hand, balance, onEdit, onDisclose } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const faces = capableFaces(plan);
  const glide = useGlide();
  const [over, setOver] = useState<'plan' | 'hand' | null>(null);
  const leader = pieces.find((entry) => entry.id === plan.leaderId);
  const planCards = plan.cardIds.flatMap((id) => pieces.filter((entry) => entry.id === id));
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
  const tile = (piece: TablePiece, into: 'plan' | 'hand', revealPart?: Parameters<typeof RevealToggle>[0]['part']) => (
    <div key={piece.id} ref={glide.ref(piece.id)} className={styles.piece}>
      <UnstyledButton
        className={clsx(styles.pieceButton, piece.kind !== 'card' && styles.round)}
        draggable={!lockedFor(piece)}
        onDragStart={(event) => event.dataTransfer.setData(DRAG_TYPE, piece.id)}
        disabled={lockedFor(piece)}
        aria-label={`${into === 'plan' ? 'Put' : 'Take'} ${pieceName(piece)} ${into === 'plan' ? 'into the plan' : 'back into your hand'}`}
        title={pieceName(piece)}
        onClick={() => move(piece, into)}
      >
        <PieceImage piece={piece} width={piece.kind === 'card' ? 40 : 44} height={piece.kind === 'card' ? 56 : 44} />
      </UnstyledButton>
      {revealPart ? (
        <RevealToggle
          plan={plan}
          part={revealPart}
          name={piece.kind === 'card' ? 'this card' : 'your leader'}
          disabled={locks.revealLocked}
          onDisclose={onDisclose}
        />
      ) : null}
    </div>
  );
  return (
    <div className={styles.tray}>
      <BattleLine territory={props.territory} opponent={props.opponent} />
      <section className={styles.plan} aria-label="Your plan" {...zone('plan')}>
        <div className={styles.leaderSlot} data-empty={!leader || undefined}>
          {leader ? tile(leader, 'hand', disclosure.leader) : <span>Leader</span>}
        </div>
        <div className={styles.cardSlots}>
          {planCards.map((card) => tile(card, 'hand', disclosure.card(card.id)))}
          <div className={styles.cardSlot} data-empty>
            <span>Card</span>
          </div>
        </div>
        <StrengthSum props={props} className={styles.sum} />
      </section>
      <section className={styles.sliders} aria-label="Dial">
        <div className={styles.dialHead}>
          <ModeSwitch mode={plan.mode} disabled={locks.dialLocked} onChange={(mode) => onEdit({ mode })} />
          <RevealToggle
            className={styles.dialReveal}
            plan={plan}
            part={disclosure.dial}
            name="your dial"
            disabled={locks.revealLocked}
            onDisclose={onDisclose}
          />
        </div>
        {plan.mode === 'max' ? (
          <>
            {faces.map((face) => (
              <PlanSlider
                key={face.id}
                label={faces.length === 1 ? 'Troops' : face.name}
                value={totalOf(plan, face.id)}
                max={troopLimitOf(props, face.id)}
                disabled={locks.dialLocked}
                onCommit={(total) => onEdit(setTotal(plan, face.id, total))}
              />
            ))}
            <PlanSlider
              label="Spice"
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
              <div key={face.id} className={styles.faceGroup}>
                {faces.length > 1 ? <span className={styles.faceName}>{face.name}</span> : null}
                <PlanSlider
                  label="Plain"
                  value={own.undialed}
                  max={limit - own.dialed}
                  disabled={locks.dialLocked}
                  onCommit={(undialed) => onEdit({ troops: withTroops(plan, face.id, { undialed }) })}
                />
                <PlanSlider
                  label="Spiced"
                  value={own.dialed}
                  max={Math.min(limit - own.undialed, supportedMax(plan, face, balance) ?? limit)}
                  disabled={locks.dialLocked}
                  onCommit={(dialed) => onEdit({ troops: withTroops(plan, face.id, { dialed }) })}
                  spice
                />
              </div>
            );
          })
        )}
        <div className={styles.adjust}>
          <span>Adjust</span>
          <Stepper
            size="sm"
            label="Adjustment"
            value={plan.adjustment}
            min={-20}
            max={20}
            step={0.5}
            format={formatStrength}
            disabled={locks.dialLocked}
            onChange={(adjustment) => onEdit({ adjustment })}
          />
        </div>
      </section>
      <section className={styles.hand} aria-label="Your hand" {...zone('hand')}>
        {inHand.map((piece) => tile(piece, 'plan'))}
        {inHand.length ? null : <span className={styles.empty}>Everything is in the plan</span>}
      </section>
      <div className={styles.readyBar}>
        <ReadyButton {...props} fullWidth />
      </div>
    </div>
  );
}

/** A count set in one sweep: the value follows the thumb and is sent once, when the thumb is let go. */
function PlanSlider({
  label,
  value,
  max,
  disabled,
  onCommit,
  spice,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  spice?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className={styles.slider} data-spice={spice || undefined}>
      <span className={styles.sliderLabel}>{label}</span>
      <Slider
        aria-label={label}
        thumbLabel={label}
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
      <span className={styles.sliderValue}>
        <b>{shown}</b>
        <small>/{max}</small>
      </span>
    </div>
  );
}
