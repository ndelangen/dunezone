import { Tooltip } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import { FactionPicker, factionSeat } from './FactionPicker';
import { PlayerToken } from './PlayerToken';
import type { Side } from './slotLimits';
import { FACTION_INFO, WindowBody, WindowHelp } from './windows';
import type { TableWindow } from './windows';
import styles from './Windows.module.css';

/** The grip on a pinned slot's top edge: dragged, nudged with the arrows, or double-clicked back to the default. */
type Resize = Readonly<{
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onNudge: (slot: HTMLElement, direction: 'up' | 'down') => void;
  onReset: () => void;
}>;

type WindowFrameProps = Readonly<{
  entry: TableWindow;
  /** The seat the faction information is set on, when it was asked for one. */
  seat?: string;
  where: 'centre' | Side;
  inert: boolean;
  /** The slot's flash and bounce, alternating 0 and 1 so each replay is a change. */
  flash?: number;
  bounce?: number;
  style?: CSSProperties;
  resize?: Resize;
  /** Sets the faction information on another seat, where it stands. */
  onSeat: (seat: string) => void;
  /** Opens the faction information on a seat, from a chat's token. */
  onFaction: (seat: string) => void;
  /** The frame's own buttons: pin and close in the centre, unpin in a slot. */
  actions: ReactNode;
}>;

/** One window's frame, in the centre or in a slot: its title, the frame's own buttons, and its content. */
export function WindowFrame({
  entry,
  seat,
  where,
  inert,
  flash,
  bounce,
  style,
  resize,
  onSeat,
  onFaction,
  actions,
}: WindowFrameProps) {
  return (
    <div
      role="group"
      className={clsx(styles.window, where === 'centre' ? styles.centre : styles.slot)}
      data-side={where}
      data-window={entry.key}
      data-flash={flash}
      aria-label={entry.label}
      inert={inert}
      data-hides-cursor
      data-bounce={bounce}
      style={style}
    >
      {resize && <ResizeEdge resize={resize} />}
      <WindowTitle entry={entry} actions={actions} onFaction={onFaction} />
      <WindowContent entry={entry} seat={seat} onSeat={onSeat} />
    </div>
  );
}

type WindowTitleProps = Readonly<{
  entry: TableWindow;
  actions: ReactNode;
  onFaction: (seat: string) => void;
}>;

/* The title bar: the window's icon or the player's token, its name, its help and the frame's buttons. */
function WindowTitle({ entry, actions, onFaction }: WindowTitleProps) {
  const player = entry.player;
  return (
    <header className={styles.title}>
      {player ? <FactionButton player={player} onFaction={onFaction} /> : <TopicIcon topic={entry.topic} size={18} />}
      <Tooltip label={fullName(entry)} withinPortal openDelay={300}>
        <span className={styles.name}>{entry.label}</span>
      </Tooltip>
      <WindowHelp entry={entry} />
      <span className={styles.actions}>{actions}</span>
    </header>
  );
}

/* A chat names only its player, since the token beside the name shows the faction; a long name ends in an ellipsis, and the tip gives it whole with the faction. */
function fullName(entry: TableWindow) {
  return [entry.label, entry.player?.factionName].filter(Boolean).join(' · ');
}

/* A chat's token is the way to its faction: it opens the faction information set on that player's seat. */
function FactionButton({ player, onFaction }: Readonly<{ player: CompassPlayer; onFaction: (seat: string) => void }>) {
  const faction = player.factionName ?? player.name;
  return (
    <Tooltip label={`${faction} info`} withinPortal>
      <button
        type="button"
        className={styles.factionButton}
        aria-label={`${faction} info`}
        onClick={() => onFaction(player.seat)}
      >
        <PlayerToken player={player} size={24} />
      </button>
    </Tooltip>
  );
}

/* A chat shows the table's conversation with its player; the faction information shows its seat under the faction tokens; any other window shows its own content. */
function WindowContent({
  entry,
  seat,
  onSeat,
}: Readonly<{ entry: TableWindow; seat?: string; onSeat: (seat: string) => void }>) {
  const table = useContext(CompassTableContext);
  if (entry.player) {
    return <WindowBody layout="fill">{table?.chat(entry.player.seat)}</WindowBody>;
  }
  if (entry.key === FACTION_INFO && table) {
    const shown = factionSeat(table.players, seat);
    return (
      <>
        <FactionPicker players={table.players} seat={shown} onSeat={onSeat} />
        <WindowBody layout={entry.layout}>{shown && table.factionInfo(shown)}</WindowBody>
      </>
    );
  }
  return <WindowBody layout={entry.layout}>{entry.content}</WindowBody>;
}

function ResizeEdge({ resize }: Readonly<{ resize: Resize }>) {
  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = { ArrowUp: 'up', ArrowDown: 'down' }[event.key] as 'up' | 'down' | undefined;
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      resize.onNudge(event.currentTarget.parentElement!, direction);
    }
  };
  return (
    <button
      type="button"
      className={styles.resizeEdge}
      aria-label="Resize: drag, or press the up and down arrows; double-click to reset"
      title="Drag to resize; double-click to reset"
      onPointerDown={resize.onPointerDown}
      onKeyDown={nudge}
      onDoubleClick={resize.onReset}
    />
  );
}
