import { TopicIcon } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { Info, MessagesSquare } from 'lucide-react';
import { useContext } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import { PlayerToken } from './PlayerToken';
import type { Side } from './slotLimits';
import { WindowBody, WindowHelp } from './windows';
import type { PlayerTab, TableWindow, WindowLayout } from './windows';
import styles from './Windows.module.css';

/** The grip on a pinned slot's top edge: dragged, nudged with the arrows, or double-clicked back to the default. */
type Resize = Readonly<{
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onNudge: (slot: HTMLElement, direction: 'up' | 'down') => void;
  onReset: () => void;
}>;

type WindowFrameProps = Readonly<{
  entry: TableWindow;
  tab: PlayerTab;
  where: 'centre' | Side;
  inert: boolean;
  /** The slot's flash and bounce, alternating 0 and 1 so each replay is a change. */
  flash?: number;
  bounce?: number;
  style?: CSSProperties;
  resize?: Resize;
  onTab: (tab: PlayerTab) => void;
  /** The frame's own buttons: pin and close in the centre, unpin in a slot. */
  actions: ReactNode;
}>;

/* A player's chat fills the window; their public details stack. */
function playerLayout(player: CompassPlayer, tab: PlayerTab): WindowLayout {
  return tab === 'conversation' && player.canConverse && !player.own ? 'fill' : 'stack';
}

/** One window's frame, in the centre or in a slot: its title, a player's tabs, the frame's own buttons, and its content. */
export function WindowFrame({
  entry,
  tab,
  where,
  inert,
  flash,
  bounce,
  style,
  resize,
  onTab,
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
      <WindowTitle entry={entry} tab={tab} actions={actions} />
      {entry.player && <PlayerTabs player={entry.player} tab={tab} onTab={onTab} />}
      <WindowContent entry={entry} tab={tab} />
    </div>
  );
}

type WindowTitleProps = Readonly<{
  entry: TableWindow;
  tab: PlayerTab;
  actions: ReactNode;
}>;

/* The title bar: the window's icon or the player's token, its name, its help and the frame's buttons. */
function WindowTitle({ entry, tab, actions }: WindowTitleProps) {
  const player = entry.player;
  return (
    <header className={styles.title}>
      {player ? <PlayerToken player={player} size={24} /> : <TopicIcon topic={entry.topic} size={18} />}
      <span className={styles.name}>
        {entry.label}
        {player && <FactionName player={player} />}
      </span>
      <WindowHelp entry={entry} tab={tab} />
      <span className={styles.actions}>{actions}</span>
    </header>
  );
}

/* Another player's faction follows their name; the viewer's own window names the faction already. */
function FactionName({ player }: Readonly<{ player: CompassPlayer }>) {
  if (!player.factionName || player.own) {
    return null;
  }
  return <span className={styles.group}> · {player.factionName}</span>;
}

/* A player's window shows what the table renders for their seat; any other shows its own content. */
function WindowContent({ entry, tab }: Readonly<{ entry: TableWindow; tab: PlayerTab }>) {
  const table = useContext(CompassTableContext);
  const player = entry.player;
  if (!player) {
    return <WindowBody layout={entry.layout}>{entry.content}</WindowBody>;
  }
  return <WindowBody layout={playerLayout(player, tab)}>{table?.render(player.seat, tab)}</WindowBody>;
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

/* Another player's window has two sides, their chat and their information, as a row of its own under the title,
   so a narrow slot never squeezes the Info tab away; the viewer's own window and a player they cannot chat with show only the information. */
function PlayerTabs({
  player,
  tab,
  onTab,
}: Readonly<{
  player: CompassPlayer;
  tab: PlayerTab;
  onTab: (tab: PlayerTab) => void;
}>) {
  if (player.own || !player.canConverse) {
    return null;
  }
  return (
    <div className={styles.tabs} role="tablist" aria-label={`${player.name} tabs`}>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'conversation'}
        className={styles.tab}
        onClick={() => onTab('conversation')}
      >
        <MessagesSquare size={15} aria-hidden="true" />
        Chat
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'public'}
        className={styles.tab}
        onClick={() => onTab('public')}
      >
        <Info size={15} aria-hidden="true" />
        Info
      </button>
    </div>
  );
}
