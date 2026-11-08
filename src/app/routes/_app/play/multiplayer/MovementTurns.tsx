import { Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { nextToMove } from '@shared/play/movement';
import type { MovementTurns as MovementTurnsState } from '@shared/play/movement';
import { SortableRow } from '@ui/control/SortableRow';
import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useId, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { factionToken, FactionTokenFace } from './FactionTokenFace';
import styles from './MovementTurns.module.css';

const TOKEN_SIZE = 28;

/* Where a faction stands in this Shipment and Movement: finished, up now, or still to go. */
type Turn = 'done' | 'up' | 'waiting';

type Props = Readonly<{
  table: TableProjection;
  /** The turn order, every faction at the table once; the table shows a dragged order at once, until the room answers it. */
  order: readonly string[];
  /** The factions that have finished this Shipment and Movement. */
  done: MovementTurnsState['done'];
  names: Readonly<Record<string, string>>;
  /** Whether the viewer may mark a turn done or not done and rearrange the order; an observer only looks. */
  canAct: boolean;
  onDone: (factionId: string) => void;
  onUndo: (factionId: string) => void;
  onOrder: (order: string[]) => void;
}>;

/* The tooltip: the faction's standing, and for a player, what a click does about it. */
function turnWords(name: string, turn: Turn, canAct: boolean) {
  const standing = turn === 'done' ? `${name} is done` : turn === 'up' ? `${name} is up now` : `${name} is still to go`;
  return canAct ? `${standing} · ${turn === 'done' ? 'Mark not done' : 'Mark done'}` : standing;
}

/**
 * The Shipment and Movement turns in the phase chip: every faction's token in turn order, the one up now ringed, the ones done faded under a tick.
 * A seated player clicks a token to mark its faction done, or done again to take that back, and drags the factions still to go into the order the table plays.
 * The factions done stay first, in the order they finished.
 * An observer sees the same row with nothing to press or drag.
 */
export function MovementTurns({ table, order, done, names, canAct, onDone, onUndo, onOrder }: Props) {
  const motion = useMotionAllowed();
  const up = nextToMove(order, { done });
  const turnOf = (factionId: string): Turn => (done.includes(factionId) ? 'done' : factionId === up ? 'up' : 'waiting');
  /* The factions done lead the order and keep their places: only the factions still to go drag, and only among themselves. */
  const locked = order.filter((id) => done.includes(id));
  const rest = order.filter((id) => !done.includes(id));
  const complete = rest.length === 0 && locked.length > 0;
  /*
   * What changed while the row was shown, so a tick pops, and the completion runs, only for marks made since, not on every mount.
   * Marks made with motion off are not kept, so turning motion back on does not replay them,
   * nor any that arrive in the same update that turns it on: only marks seen with motion already on animate.
   */
  const [seen, setSeen] = useState({ done, motion, fresh: [] as string[], completed: false });
  if (seen.done.join() !== done.join() || seen.motion !== motion) {
    const animate = motion && seen.motion;
    setSeen({
      done,
      motion,
      fresh: animate
        ? [...seen.fresh.filter((id) => done.includes(id)), ...done.filter((id) => !seen.done.includes(id))]
        : [],
      completed: animate && complete && seen.done.length < order.length,
    });
  }
  const token = (id: string) => (
    <Token
      key={id}
      table={table}
      factionId={id}
      name={names[id] ?? id}
      names={names}
      turn={turnOf(id)}
      fresh={seen.fresh.includes(id)}
      canAct={canAct}
      onToggle={() => (done.includes(id) ? onUndo(id) : onDone(id))}
    />
  );
  return (
    <div
      role="group"
      aria-label="Shipment and Movement turns"
      className={styles.turns}
      data-motion={motion || undefined}
      data-complete={(complete && seen.completed) || undefined}
    >
      {locked.length > 0 && (
        <div className={styles.row}>
          {/* Each finished token knows its place, so the row's completion runs along it from first to last. */}
          {locked.map((id, index) => (
            <span key={id} className={styles.place} style={{ '--place': index } as CSSProperties}>
              {token(id)}
            </span>
          ))}
        </div>
      )}
      <SortableRow
        items={rest.map((id) => ({ id }))}
        disabled={!canAct}
        className={styles.row}
        onMove={(item, before) => {
          const others = rest.filter((id) => id !== item.id);
          const at = before ? others.indexOf(before) : others.length;
          const next = [...locked, ...others.slice(0, at), item.id, ...others.slice(at)];
          onOrder(next);
        }}
      >
        {({ id }) => token(id)}
      </SortableRow>
    </div>
  );
}

/* One faction's token: a toggle for a player, an image for an observer, each describing its standing where a tooltip would. */
function Token({
  table,
  factionId,
  name,
  names,
  turn,
  fresh,
  canAct,
  onToggle,
}: Readonly<{
  table: TableProjection;
  factionId: string;
  name: string;
  names: Readonly<Record<string, string>>;
  turn: Turn;
  /** Marked done while the row was shown, so its tick pops on. */
  fresh: boolean;
  canAct: boolean;
  onToggle: () => void;
}>) {
  const wordsId = useId();
  const words = turnWords(name, turn, canAct);
  const face = (
    <>
      <FactionTokenFace token={factionToken(table, factionId, names)} size={TOKEN_SIZE} />
      {turn === 'done' && (
        <span className={styles.tick} data-fresh={fresh || undefined} aria-hidden="true">
          <Check size={10} strokeWidth={3} />
        </span>
      )}
    </>
  );
  return (
    <>
      <Tooltip label={words} withinPortal>
        {canAct ? (
          <UnstyledButton
            className={styles.token}
            data-turn={turn}
            aria-label={name}
            aria-pressed={turn === 'done'}
            aria-current={turn === 'up' ? 'step' : undefined}
            aria-describedby={wordsId}
            onClick={onToggle}
          >
            {face}
          </UnstyledButton>
        ) : (
          <span
            className={styles.token}
            data-turn={turn}
            role="img"
            aria-label={name}
            aria-current={turn === 'up' ? 'step' : undefined}
            aria-describedby={wordsId}
          >
            {face}
          </span>
        )}
      </Tooltip>
      <VisuallyHidden id={wordsId}>{words}</VisuallyHidden>
    </>
  );
}
