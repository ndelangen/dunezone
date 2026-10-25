import { UnstyledButton } from '@mantine/core';
import type { BattlePlan } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import clsx from 'clsx';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { useRef, useState } from 'react';

import { Key } from '../compass/glyphs';
import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import { AdjustField, BattleLine, ModeSwitch, ReadyButton, RevealToggle, RollingNumber, useBump } from './parts';
import {
  availableSpice,
  capableFaces,
  cardsOf,
  disclosure,
  leadersOf,
  planLocks,
  planPieces,
  setTotal,
  supportedMax,
  toggleCard,
  toggleLeader,
  totalOf,
  totalStrength,
  troopLimitOf,
  troopsOf,
  withTroops,
} from './planView';
import type { BattlePlanViewProps } from './planView';
import styles from './WheelPlan.module.css';

/* The dial sweeps 270°, from bottom left round the top to bottom right, as a turned wheel reads. */
const SWEEP = 270;
const START = -135;
const SIZE = 200;
const CENTRE = SIZE / 2;
const OUTER = 86;
const INNER = 66;

function polar(radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [CENTRE + radius * Math.cos(radians), CENTRE + radius * Math.sin(radians)] as const;
}

function arc(radius: number, from: number, to: number) {
  const [x1, y1] = polar(radius, from);
  const [x2, y2] = polar(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

const angleOf = (value: number, max: number) => START + (max ? (Math.min(value, max) / max) * SWEEP : 0);

type Ring = 'outer' | 'inner';
type RingSpec = { value: number; max: number; set: (value: number) => void; label: string };

/**
 * Variant B, the wheel: the battle wheel is the editor.
 * The outer ring dials the troops, the inner ring the spice
 * (or, in Custom, how many of them are supported);
 * scroll over a ring or drag round it.
 * Leader and cards sit in the wheel's own slots, filled from the hand below with one click.
 */
export function WheelPlan(props: BattlePlanViewProps) {
  const { plan, hand, balance, onEdit, onDisclose } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const faces = capableFaces(plan);
  const [faceId, setFaceId] = useState(faces[0]?.id ?? '');
  const face = faces.find((entry) => entry.id === faceId) ?? faces[0];
  const leader = pieces.find((entry) => entry.id === plan.leaderId);
  const planCards = plan.cardIds.flatMap((id) => pieces.filter((entry) => entry.id === id));
  const loose = [...leadersOf(pieces), ...cardsOf(pieces)].filter(
    (entry) => entry.id !== plan.leaderId && !plan.cardIds.includes(entry.id)
  );
  if (!face) {
    return null;
  }
  const limit = troopLimitOf(props, face.id);
  const own = troopsOf(plan, face.id);
  const rings: Record<Ring, RingSpec> =
    plan.mode === 'max'
      ? {
          outer: {
            value: totalOf(plan, face.id),
            max: limit,
            set: (total) => onEdit(setTotal(plan, face.id, total)),
            label: `${face.name}`,
          },
          inner: {
            value: plan.spice,
            max: availableSpice(plan, balance),
            set: (spice) => onEdit({ spice }),
            label: 'Spice',
          },
        }
      : {
          outer: {
            value: own.undialed + own.dialed,
            max: limit,
            set: (total) =>
              onEdit({
                troops: withTroops(plan, face.id, {
                  undialed: Math.max(0, total - own.dialed),
                  dialed: Math.min(own.dialed, total),
                }),
              }),
            label: `${face.name}`,
          },
          inner: {
            value: own.dialed,
            max: Math.min(limit, supportedMax(plan, face, balance) ?? limit),
            set: (dialed) =>
              onEdit({
                troops: withTroops(plan, face.id, {
                  dialed,
                  undialed: Math.max(0, own.undialed + own.dialed - dialed),
                }),
              }),
            label: `${face.name} supported`,
          },
        };
  return (
    <div className={styles.wheelPlan}>
      <BattleLine territory={props.territory} opponent={props.opponent} />
      <div className={styles.controls}>
        {faces.length > 1 ? (
          <div className={styles.faces} role="tablist" aria-label="Troop type on the dial">
            {faces.map((entry) => (
              <UnstyledButton
                key={entry.id}
                role="tab"
                aria-selected={entry.id === face.id}
                className={styles.faceTab}
                onClick={() => setFaceId(entry.id)}
              >
                {entry.name} <b>{totalOf(plan, entry.id)}</b>
              </UnstyledButton>
            ))}
          </div>
        ) : null}
        <ModeSwitch mode={plan.mode} disabled={locks.dialLocked} onChange={(mode) => onEdit({ mode })} />
      </div>
      <div className={styles.stage}>
        <ul className={styles.fan} aria-label="Cards in the plan">
          {planCards.map((card, index) => {
            const offset = index - (planCards.length - 1) / 2;
            return (
              <li
                key={card.id}
                className={styles.fanCard}
                style={{ transform: `translateX(calc(-50% + ${offset * 34}px)) rotate(${offset * 12}deg)` }}
              >
                <UnstyledButton
                  aria-label={`Take ${pieceName(card)} back into your hand`}
                  disabled={locks.cardLocked(card.id)}
                  onClick={() => onEdit(toggleCard(plan, card.id))}
                >
                  <PieceImage piece={card} width={40} height={56} />
                </UnstyledButton>
                <RevealToggle
                  plan={plan}
                  part={disclosure.card(card.id)}
                  name="this card"
                  disabled={locks.revealLocked}
                  onDisclose={onDisclose}
                />
              </li>
            );
          })}
        </ul>
        <Dial rings={rings} locked={locks.dialLocked} total={totalStrength(props)} />
        <div className={styles.leaderSlot} data-filled={leader ? true : undefined}>
          {leader ? (
            <>
              <UnstyledButton
                aria-label={`Take ${pieceName(leader)} back into your hand`}
                disabled={locks.leaderLocked}
                onClick={() => onEdit(toggleLeader(plan, leader.id))}
              >
                <PieceImage piece={leader} width={48} height={48} />
              </UnstyledButton>
              <RevealToggle
                plan={plan}
                part={disclosure.leader}
                name="your leader"
                disabled={locks.revealLocked}
                onDisclose={onDisclose}
              />
            </>
          ) : (
            <span className={styles.slotHint}>Leader</span>
          )}
        </div>
        <RevealToggle
          className={styles.dialReveal}
          plan={plan}
          part={disclosure.dial}
          name="your dial"
          disabled={locks.revealLocked}
          onDisclose={onDisclose}
        />
      </div>
      <div className={styles.readout}>
        <span>
          <b>{rings.outer.value}</b> {plan.mode === 'max' ? 'troops' : face.name.toLowerCase()} <Key>↑</Key>
          <Key>↓</Key>
        </span>
        <span>
          <b>{plan.mode === 'max' ? plan.spice : own.dialed}</b> {plan.mode === 'max' ? 'spice' : 'supported'}{' '}
          <Key>←</Key>
          <Key>→</Key>
        </span>
      </div>
      <div className={styles.hand} role="group" aria-label="Your hand">
        {loose.map((entry) => (
          <HandPiece
            key={entry.id}
            piece={entry}
            plan={plan}
            locked={entry.kind === 'card' ? locks.locked : locks.leaderLocked}
            onPick={() => onEdit(entry.kind === 'card' ? toggleCard(plan, entry.id) : { leaderId: entry.id })}
          />
        ))}
      </div>
      <footer className={styles.footer}>
        {locks.dialLocked && !plan.adjustment ? (
          <span />
        ) : (
          <AdjustField plan={plan} disabled={locks.dialLocked} onEdit={onEdit} />
        )}
        <ReadyButton {...props} />
      </footer>
    </div>
  );
}

function HandPiece({
  piece,
  locked,
  onPick,
}: {
  piece: TablePiece;
  plan: BattlePlan;
  locked: boolean;
  onPick: () => void;
}) {
  const card = piece.kind === 'card';
  return (
    <UnstyledButton
      className={clsx(styles.handPiece, !card && styles.handLeader)}
      aria-label={`Put ${pieceName(piece)} into the plan`}
      title={pieceName(piece)}
      disabled={locked}
      onClick={onPick}
    >
      <PieceImage piece={piece} width={card ? 28 : 32} height={card ? 39 : 32} />
    </UnstyledButton>
  );
}

/** The two rings and the strength at their centre. */
function Dial({ rings, locked, total }: { rings: Record<Ring, RingSpec>; locked: boolean; total: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<Ring | null>(null);
  const [focus, setFocus] = useState<Ring>('outer');
  const bump = useBump(total);
  const ringAt = (event: { clientX: number; clientY: number }): Ring => {
    const box = svg.current!.getBoundingClientRect();
    const scale = SIZE / box.width;
    const x = (event.clientX - box.left) * scale - CENTRE;
    const y = (event.clientY - box.top) * scale - CENTRE;
    return Math.hypot(x, y) > (OUTER + INNER) / 2 ? 'outer' : 'inner';
  };
  const valueAt = (event: { clientX: number; clientY: number }, ring: Ring) => {
    const box = svg.current!.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    let degrees = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (degrees > 180) {
      degrees -= 360;
    }
    const share = Math.min(1, Math.max(0, (degrees - START) / SWEEP));
    return Math.round(share * rings[ring].max);
  };
  const wheel = (event: WheelEvent) => {
    if (locked || !event.deltaY) {
      return;
    }
    const ring = rings[ringAt(event)];
    const next = Math.min(ring.max, Math.max(0, ring.value + (event.deltaY < 0 ? 1 : -1)));
    if (next !== ring.value) {
      ring.set(next);
    }
  };
  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (locked || event.button !== 0) {
      return;
    }
    const ring = ringAt(event);
    dragging.current = ring;
    setFocus(ring);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const ring = dragging.current;
    if (!ring) {
      return;
    }
    const next = valueAt(event, ring);
    if (next !== rings[ring].value) {
      rings[ring].set(next);
    }
  };
  /* Up and down dial the troops, left and right the inner ring. */
  const key = (event: KeyboardEvent) => {
    const arrows: Record<string, [Ring, number]> = {
      ArrowUp: ['outer', 1],
      ArrowDown: ['outer', -1],
      ArrowRight: ['inner', 1],
      ArrowLeft: ['inner', -1],
    };
    const pressed = arrows[event.key];
    if (locked || !pressed) {
      return;
    }
    event.preventDefault();
    const [which, step] = pressed;
    setFocus(which);
    const ring = rings[which];
    const next = Math.min(ring.max, Math.max(0, ring.value + step));
    if (next !== ring.value) {
      ring.set(next);
    }
  };
  return (
    <svg
      ref={svg}
      className={styles.dial}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      data-locked={locked || undefined}
      role="slider"
      tabIndex={locked ? -1 : 0}
      aria-label={`${rings[focus].label}: up and down dial the troops, left and right the inner ring`}
      aria-valuemin={0}
      aria-valuemax={rings[focus].max}
      aria-valuenow={rings[focus].value}
      onWheel={wheel}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
      onKeyDown={key}
    >
      <circle className={styles.face} cx={CENTRE} cy={CENTRE} r={OUTER + 10} />
      {(['outer', 'inner'] as const).map((ring) => {
        const spec = rings[ring];
        const radius = ring === 'outer' ? OUTER : INNER;
        const to = angleOf(spec.value, spec.max);
        const ticks = Math.min(spec.max, 40);
        return (
          <g key={ring} className={styles.ring} data-ring={ring} data-focus={focus === ring || undefined}>
            <path className={styles.track} d={arc(radius, START, START + SWEEP)} />
            {Array.from({ length: ticks + 1 }, (_, index) => {
              const [x1, y1] = polar(radius - 6, START + (index / Math.max(ticks, 1)) * SWEEP);
              const [x2, y2] = polar(radius + 6, START + (index / Math.max(ticks, 1)) * SWEEP);
              return <line key={index} className={styles.tick} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
            {spec.value > 0 ? <path className={styles.fill} d={arc(radius, START, Math.max(to, START + 0.5))} /> : null}
            <circle className={styles.knob} cx={polar(radius, to)[0]} cy={polar(radius, to)[1]} r={7} />
          </g>
        );
      })}
      <text className={styles.total} x={CENTRE} y={CENTRE + 6} data-bump={bump}>
        <RollingNumber value={total} />
      </text>
      <text className={styles.totalLabel} x={CENTRE} y={CENTRE + 24}>
        strength
      </text>
    </svg>
  );
}
