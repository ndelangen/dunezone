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
import { PANEL_FOCUS_ATTRIBUTE } from './panelFocus';
import { FACTION_INFO, PanelBody, PanelHelp } from './panels';
import type { CompassPanel } from './panels';
import styles from './Panels.module.css';
import { PlayerToken } from './PlayerToken';
import type { Side } from './slotLimits';

/** The grip on a pinned slot's top edge: dragged, nudged with the arrows, or double-clicked back to the default. */
type Resize = Readonly<{
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onNudge: (slot: HTMLElement, direction: 'up' | 'down') => void;
  onReset: () => void;
}>;

type PanelFrameProps = Readonly<{
  entry: CompassPanel;
  /** The seat the faction information is set on, when it was asked for one. */
  seat?: string;
  where: 'centre' | Side;
  inert: boolean;
  /** The slot's flash and bounce, alternating 0 and 1 so each replay is a change. */
  flash?: number;
  bounce?: number;
  style?: CSSProperties;
  resize?: Resize;
  /** In front of the other panels, where they overlap on a narrow table: the one last brought up or pressed. */
  front?: boolean;
  onRaise?: () => void;
  /** Sets the faction information on another seat, where it stands. */
  onSeat: (seat: string) => void;
  /** Opens the faction information on a seat, from a chat's token. */
  onFaction: (seat: string) => void;
  /** The frame's own buttons: pin and close in the centre, unpin in a slot. */
  actions: ReactNode;
}>;

/** One panel's frame, in the centre or in a slot: its title, the frame's own buttons, and its content. */
export function PanelFrame({
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
}: PanelFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const pressed = useFocusOnRaise(frame, front, flash);
  return (
    <div
      ref={frame}
      role="group"
      className={clsx(styles.panel, where === 'centre' ? styles.centre : styles.slot)}
      data-side={where}
      data-panel={entry.key}
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
      {/* The title takes the entry's fields rather than the entry, which is new with every table update, so it skips them. */}
      <PanelTitle
        label={entry.label}
        topic={entry.topic}
        player={entry.player}
        description={entry.description}
        help={entry.help}
        ownActions={entry.actions}
        actions={actions}
        onFaction={onFaction}
      />
      <PanelContent entry={entry} seat={seat} onSeat={onSeat} />
    </div>
  );
}

/* Whatever a click inside a panel does for itself, so it keeps the focus the click gave it: a control, or a region the keys scroll, as a chat's history. */
const OWN_FOCUS =
  'button, a[href], input, textarea, select, label, [role="button"], [role="slider"], [role="option"], [contenteditable], [tabindex]:not([tabindex="-1"])';

/* The field a panel hands its focus to, as a chat does its composer. */
function focusField(frame: HTMLElement | null) {
  const target = frame?.querySelector<HTMLElement>(`[${PANEL_FOCUS_ATTRIBUTE}]`);
  if (target && !frame!.contains(document.activeElement)) {
    target.focus({ preventScroll: true });
  }
}

/*
 * A panel that opens, or is brought up again, hands the focus to its field, so a chat is ready to type in.
 * A press inside it raises it too, but the press itself decides: a click on a bare part of the panel focuses the field,
 * while a click on a control, or one that selected text to copy, keeps its own focus.
 * A panel that only comes back, as pinned panels do on a reload, takes nothing.
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
  /* A press still held when the panel goes lets go with it. */
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
      element.querySelector<HTMLElement>(`[${PANEL_FOCUS_ATTRIBUTE}]`)?.focus({ preventScroll: true });
    };
    element.addEventListener('click', click);
    return () => element.removeEventListener('click', click);
  }, [frame]);
  return pressed;
}

type PanelTitleProps = Readonly<
  Pick<CompassPanel, 'label' | 'topic' | 'player' | 'description' | 'help'> & {
    /** The panel's own buttons, ahead of the frame's. */
    ownActions: ReactNode;
    actions: ReactNode;
    onFaction: (seat: string) => void;
  }
>;

/* The title bar: the panel's icon or the player's token, its name, its help and the frame's buttons. */
/* A chat names only its player, since the token beside the name gives the faction; a long name ends in an ellipsis, with the whole of it in a tip. */
function PanelTitle({ label, topic, player, description, help, ownActions, actions, onFaction }: PanelTitleProps) {
  return (
    <header className={styles.title}>
      {player ? <FactionButton player={player} onFaction={onFaction} /> : <TopicIcon topic={topic} size={18} />}
      <span className={styles.name}>
        <TruncatedText flex={1}>{label}</TruncatedText>
      </span>
      <PanelHelp description={description} help={help} />
      <span className={styles.actions}>
        {ownActions}
        {actions}
      </span>
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

/* A chat shows the conversation with its player; the faction information scrolls its tokens with the seat's details, so a short slot keeps both in reach; any other panel shows its own content. */
function PanelContent({
  entry,
  seat,
  onSeat,
}: Readonly<{ entry: CompassPanel; seat?: string; onSeat: (seat: string) => void }>) {
  const table = useContext(CompassTableContext);
  if (entry.player) {
    return <PanelBody layout="fill">{table?.chat(entry.player.seat)}</PanelBody>;
  }
  if (entry.key === FACTION_INFO && table) {
    const shown = factionSeat(table.players, seat);
    return (
      <PanelBody layout={entry.layout}>
        <FactionTokens players={table.players} seat={shown} onSeat={onSeat} />
        {shown && table.factionInfo(shown)}
      </PanelBody>
    );
  }
  return <PanelBody layout={entry.layout}>{entry.content}</PanelBody>;
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
