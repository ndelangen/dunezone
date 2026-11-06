import { Tooltip } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { TruncatedText } from '@ui/content/TruncatedText';
import clsx from 'clsx';
import { useContext, useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';

import chat from './ChatBar.module.css';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import { factionSeat, FactionTokens } from './FactionTokens';
import { PlayerToken } from './PlayerToken';
import type { Side } from './slotLimits';
import { WINDOW_FOCUS_ATTRIBUTE } from './windowFocus';
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
  /** In front of the other windows, where they overlap on a narrow table: the one last brought up or pressed. */
  front?: boolean;
  onRaise?: () => void;
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
  front,
  onRaise,
  onSeat,
  onFaction,
  actions,
}: WindowFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const pressed = useFocusOnRaise(frame, front, flash);
  return (
    <div
      ref={frame}
      role="group"
      className={clsx(styles.window, where === 'centre' ? styles.centre : styles.slot)}
      data-side={where}
      data-window={entry.key}
      data-flash={flash}
      data-front={front || undefined}
      aria-label={entry.label}
      inert={inert}
      data-hides-cursor
      data-bounce={bounce}
      data-peek={entry.peek || undefined}
      style={style}
      onPointerDownCapture={() => {
        pressed();
        onRaise?.();
      }}
    >
      {resize && <ResizeEdge resize={resize} />}
      <WindowTitle
        entry={entry}
        actions={
          <>
            {entry.actions}
            {actions}
          </>
        }
        onFaction={onFaction}
      />
      <WindowContent entry={entry} seat={seat} onSeat={onSeat} />
    </div>
  );
}

/* Whatever a click inside a window does for itself, so it keeps the focus the click gave it: a control, or a region the keys scroll, as a chat's history. */
const OWN_FOCUS =
  'button, a[href], input, textarea, select, label, [role="button"], [role="slider"], [role="option"], [contenteditable], [tabindex]:not([tabindex="-1"])';

/* The field a window hands its focus to, as a chat does its composer. */
function focusField(frame: HTMLElement | null) {
  const target = frame?.querySelector<HTMLElement>(`[${WINDOW_FOCUS_ATTRIBUTE}]`);
  if (target && !frame!.contains(document.activeElement)) {
    target.focus({ preventScroll: true });
  }
}

/*
 * A window that opens, or is brought up again, hands the focus to its field, so a chat is ready to type in.
 * A press inside it raises it too, but the press itself decides: a click on a bare part of the window focuses the field,
 * while a click on a control, or one that selected text to copy, keeps its own focus.
 * A window that only comes back, as pinned windows do on a reload, takes nothing.
 */
function useFocusOnRaise(
  frame: RefObject<HTMLDivElement | null>,
  front: boolean | undefined,
  flash: number | undefined
) {
  const pointer = useRef(false);
  const releasing = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (front && !pointer.current) {
      focusField(frame.current);
    }
  }, [frame, front, flash]);
  /* A press still held when the window goes lets go with it. */
  useEffect(() => () => releasing.current?.(), []);
  const pressed = () => {
    releasing.current?.();
    pointer.current = true;
    /*
     * A press ends in a release, or a cancel where the browser takes it over (a touch scroll).
     * One released outside the page sends neither: the page losing focus, or the pointer coming back with no button held, ends it then.
     */
    const lost = (event: PointerEvent) => {
      if (event.buttons === 0) {
        release();
      }
    };
    const release = () => {
      pointer.current = false;
      releasing.current = null;
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('pointermove', lost, true);
      window.removeEventListener('blur', release);
    };
    releasing.current = release;
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('pointermove', lost, true);
    window.addEventListener('blur', release);
  };
  useEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const click = (event: MouseEvent) => {
      const target = event.target;
      const selecting = !(window.getSelection()?.isCollapsed ?? true);
      if (selecting || (target instanceof Element && target.closest(OWN_FOCUS))) {
        return;
      }
      element.querySelector<HTMLElement>(`[${WINDOW_FOCUS_ATTRIBUTE}]`)?.focus({ preventScroll: true });
    };
    element.addEventListener('click', click);
    return () => element.removeEventListener('click', click);
  }, [frame]);
  return pressed;
}

type WindowTitleProps = Readonly<{
  entry: TableWindow;
  actions: ReactNode;
  onFaction: (seat: string) => void;
}>;

/* The title bar: the window's icon or the player's token, its name, its help and the frame's buttons. */
/* A chat names only its player, since the token beside the name gives the faction; a long name ends in an ellipsis, with the whole of it in a tip. */
function WindowTitle({ entry, actions, onFaction }: WindowTitleProps) {
  const player = entry.player;
  return (
    <header className={styles.title}>
      {player ? <FactionButton player={player} onFaction={onFaction} /> : <TopicIcon topic={entry.topic} size={18} />}
      <span className={styles.name}>
        <TruncatedText flex={1}>{entry.label}</TruncatedText>
      </span>
      <WindowHelp entry={entry} />
      <span className={styles.actions}>{actions}</span>
    </header>
  );
}

/* A chat's token is the way to its faction: it brings the faction information up on that player's seat, marked while a vote or a seat request waits there. */
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
        {player.attention && <span className={chat.attention} aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}

/* A chat shows the conversation with its player; the faction information scrolls its tokens with the seat's details, so a short slot keeps both in reach; any other window shows its own content. */
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
      <WindowBody layout={entry.layout}>
        <FactionTokens players={table.players} seat={shown} onSeat={onSeat} />
        {shown && table.factionInfo(shown)}
      </WindowBody>
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
    <Tooltip label="Drag to resize; double-click to reset" openDelay={500}>
      <button
        type="button"
        className={styles.resizeEdge}
        aria-label="Resize: drag, or press the up and down arrows; double-click to reset"
        onPointerDown={resize.onPointerDown}
        onKeyDown={nudge}
        onDoubleClick={resize.onReset}
      />
    </Tooltip>
  );
}
