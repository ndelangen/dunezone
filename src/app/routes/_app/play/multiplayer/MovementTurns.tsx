import { Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { nextToMove } from '@shared/play/movement';
import type { MovementTurns as MovementTurnsState } from '@shared/play/movement';
import { SortableRow } from '@ui/control/SortableRow';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { FactionTokenFace } from './FactionTokenFace';
import styles from './MovementTurns.module.css';

const TOKEN_SIZE = 28;

/* Where a faction stands in this Shipment and Movement: finished, up now, or still to go. */
type Turn = 'done' | 'up' | 'waiting';

type Props = Readonly<{
  table: TableProjection;
  /** The turn order, every faction at the table once. */
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
 * A seated player clicks a token to mark its faction done, or done again to take that back, and drags the tokens into the order the table plays.
 * An observer sees the same row with nothing to press or drag.
 */
export function MovementTurns({ table, order, done, names, canAct, onDone, onUndo, onOrder }: Props) {
  const motion = useMotionAllowed();
  /* A dragged order shows at once; the table's own order takes over as soon as it changes, which the round trip does. */
  const [arranged, setArranged] = useState<{ from: string; to: string[] }>();
  const shown = arranged?.from === order.join(',') ? arranged.to : order;
  const up = nextToMove(shown, { done });
  const turnOf = (factionId: string): Turn => (done.includes(factionId) ? 'done' : factionId === up ? 'up' : 'waiting');
  return (
    <div
      role="group"
      aria-label="Shipment and Movement turns"
      className={styles.turns}
      data-motion={motion || undefined}
    >
      <SortableRow
        items={shown.map((id) => ({ id }))}
        disabled={!canAct}
        className={styles.row}
        onMove={(item, before) => {
          const rest = shown.filter((id) => id !== item.id);
          const at = before ? rest.indexOf(before) : rest.length;
          const next = [...rest.slice(0, at), item.id, ...rest.slice(at)];
          setArranged({ from: order.join(','), to: next });
          onOrder(next);
        }}
      >
        {({ id }) => (
          <Token
            table={table}
            factionId={id}
            name={names[id] ?? id}
            names={names}
            turn={turnOf(id)}
            canAct={canAct}
            onToggle={() => (done.includes(id) ? onUndo(id) : onDone(id))}
          />
        )}
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
  canAct,
  onToggle,
}: Readonly<{
  table: TableProjection;
  factionId: string;
  name: string;
  names: Readonly<Record<string, string>>;
  turn: Turn;
  canAct: boolean;
  onToggle: () => void;
}>) {
  const wordsId = useId();
  const words = turnWords(name, turn, canAct);
  const face = (
    <>
      <FactionTokenFace table={table} factionId={factionId} names={names} size={TOKEN_SIZE} />
      {turn === 'done' && (
        <span className={styles.tick} aria-hidden="true">
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
