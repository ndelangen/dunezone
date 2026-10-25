import { UnstyledButton } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import clsx from 'clsx';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { useRef, useState } from 'react';

import { Key } from '../compass/glyphs';
import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import { AdjustField, TroopLabel } from './parts';
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
import styles from './WheelPlan.module.css';

/* The dial sweeps 270°, from bottom left round the top to bottom right, as a turned wheel reads. */
const SWEEP = 270;
const START = -135;
const SIZE = 200;
const CENTRE = SIZE / 2;
/* The wheel fills the middle to a radius of about 77; the rings run just outside it. */
const OUTER = 94;
const INNER = 84;

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
  const { plan, hand, balance, onEdit } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const faces = capableFaces(plan);
  const [faceId, setFaceId] = useState(faces[0]?.id ?? '');
  const face = faces.find((entry) => entry.id === faceId) ?? faces[0];
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
      <PlanHead
        view={props}
        wheelBox={{ className: styles.ringBox }}
        around={<Dial rings={rings} locked={locks.dialLocked} />}
        reveals
      />
      <div className={styles.controls}>
        <div className={styles.faces} role="tablist" aria-label="Troop type on the dial">
          {faces.map((entry) => (
            <UnstyledButton
              key={entry.id}
              role="tab"
              aria-selected={entry.id === face.id}
              className={styles.faceTab}
              onClick={() => setFaceId(entry.id)}
            >
              <TroopLabel face={entry} wheelArt={props.wheelArt} />
              <b>{totalOf(plan, entry.id)}</b>
            </UnstyledButton>
          ))}
        </div>
        <span className={styles.readout}>
          <span>
            <b>{rings.outer.value}</b> troops <Key>↑</Key>
            <Key>↓</Key>
          </span>
          <span>
            <b>{rings.inner.value}</b> {plan.mode === 'max' ? 'spice' : 'supported'} <Key>←</Key>
            <Key>→</Key>
          </span>
        </span>
      </div>
      <div className={styles.hand} role="group" aria-label="Your hand">
        {loose.map((entry) => (
          <HandPiece
            key={entry.id}
            piece={entry}
            locked={entry.kind === 'card' ? locks.locked : locks.leaderLocked}
            onPick={() => onEdit(entry.kind === 'card' ? toggleCard(plan, entry.id) : { leaderId: entry.id })}
          />
        ))}
      </div>
      <div className={styles.adjust}>
        <AdjustField plan={plan} disabled={locks.dialLocked} onEdit={onEdit} />
      </div>
    </div>
  );
}

function HandPiece({ piece, locked, onPick }: { piece: TablePiece; locked: boolean; onPick: () => void }) {
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
/** The two rings round the battle wheel: troops outside, spice or supported troops inside. */
function Dial({ rings, locked }: { rings: Record<Ring, RingSpec>; locked: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<Ring | null>(null);
  const [focus, setFocus] = useState<Ring>('outer');
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
      {(['outer', 'inner'] as const).map((ring) => {
        const spec = rings[ring];
        const radius = ring === 'outer' ? OUTER : INNER;
        const to = angleOf(spec.value, spec.max);
        const ticks = Math.min(spec.max, 40);
        return (
          <g key={ring} className={styles.ring} data-ring={ring} data-focus={focus === ring || undefined}>
            <path className={styles.track} d={arc(radius, START, START + SWEEP)} />
            {Array.from({ length: ticks + 1 }, (_, index) => {
              const [x1, y1] = polar(radius - 4, START + (index / Math.max(ticks, 1)) * SWEEP);
              const [x2, y2] = polar(radius + 4, START + (index / Math.max(ticks, 1)) * SWEEP);
              return <line key={index} className={styles.tick} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
            {spec.value > 0 ? <path className={styles.fill} d={arc(radius, START, Math.max(to, START + 0.5))} /> : null}
            <circle className={styles.knob} cx={polar(radius, to)[0]} cy={polar(radius, to)[1]} r={5.5} />
          </g>
        );
      })}
    </svg>
  );
}
