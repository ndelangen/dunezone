import { TopicIcon } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { EyeOff, Hand, Handshake, MessagesSquare, PanelLeft, PanelRight, PinOff, Search, Swords } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { Camera, CloseIcon, DestinationBody, Key, pressControl, Scene, useRemembered, useTablePress } from './ControlsExperiments';
import type { ExperimentProps } from './ControlsExperiments';
import base from './ControlsExperiments.module.css';
import { ExperimentPlayersContext } from './experiment';
import type { ExperimentPlayer } from './experiment';
import { PlayerToken, useWindows } from './PaletteStage2';
import type { PaletteWindow, PlayerTab } from './PaletteStage2';
import bar from './PaletteStage2.module.css';
import styles from './PaletteStage4.module.css';

/*
 * The command palette's fourth stage (Norbert, 2026-10-24), from the compass of stage 3:
 * a window opens in the centre and goes when you click the table, or is pinned into the bottom-left or bottom-right slot,
 * replacing what was pinned there; unpinning makes it disappear at once. The search field is the compass's centre and
 * its suggestions sit in a box below it. The camera dial moves to the top right, just under the toolbar.
 */

type Spot = 'hub' | 'hand' | 'hidden' | 'table' | 'ally' | 'battle' | 'search';

/* Where each arrow leads from each spot: outward along an arm, back toward the hub from the other arm. */
const MOVES: Record<Spot, Record<'left' | 'right' | 'up' | 'down', Spot>> = {
  hub: { left: 'hand', right: 'table', up: 'battle', down: 'search' },
  hand: { left: 'hidden', right: 'hub', up: 'battle', down: 'search' },
  hidden: { left: 'hidden', right: 'hand', up: 'battle', down: 'search' },
  table: { left: 'hub', right: 'ally', up: 'battle', down: 'search' },
  ally: { left: 'table', right: 'ally', up: 'battle', down: 'search' },
  battle: { left: 'hand', right: 'table', up: 'battle', down: 'hub' },
  search: { left: 'hand', right: 'table', up: 'hub', down: 'search' },
};

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

type Tile = Readonly<{
  spot: Spot;
  window?: PaletteWindow;
  tab?: PlayerTab;
  label: string;
  detail: ReactNode;
  icon: ReactNode;
  keys: string;
  disabled?: boolean;
  badge?: number;
}>;

/* Letters in order, anywhere in the text: "shinv" finds Shared inventory. Earlier and closer letters score higher. */
function fuzzy(text: string, query: string): number | null {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, '');
  let score = 0;
  let from = 0;
  for (const letter of needle) {
    const at = haystack.indexOf(letter, from);
    if (at < 0) {
      return null;
    }
    score += at === from ? 3 : at === 0 || haystack[at - 1] === ' ' ? 2 : 1;
    from = at + 1;
  }
  return score - haystack.length * 0.01;
}

type Side = 'left' | 'right';
type Opened = Readonly<{ key: string; tab: PlayerTab }>;
type Slots = Readonly<Record<Side, Opened | null>>;

type Suggestion = Readonly<{ key: string; label: string; hint: string; icon: ReactNode; run: () => void }>;

const MIN_SLOT_HEIGHT = 120;
/* Breathing room kept between a slot's top edge and the overlay above it. */
const OVERLAY_GAP = 12;
/* The overlays a slot must never cover: the header chips (phase, alliances, next phase) and the camera dial. */
const OVERLAYS = '.seated-header, .seated-column-camera, [data-overlay]';

/* How tall a slot may be: from its bottom up to the lowest visible overlay part that shares its columns. */
function slotLimit(root: HTMLElement, slot: HTMLElement) {
  const box = slot.getBoundingClientRect();
  let ceiling = root.getBoundingClientRect().top;
  for (const overlay of root.querySelectorAll<HTMLElement>(OVERLAYS)) {
    for (const part of [overlay, ...overlay.querySelectorAll<HTMLElement>('*')]) {
      const rect = part.getBoundingClientRect();
      /* Full-width containers are layout, not something drawn; the visible chips inside them count. */
      if (rect.width === 0 || rect.height === 0 || rect.width > root.clientWidth * 0.6) {
        continue;
      }
      if (rect.right <= box.left || rect.left >= box.right || rect.top >= box.bottom - MIN_SLOT_HEIGHT) {
        continue;
      }
      const style = getComputedStyle(part);
      if (style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      ceiling = Math.max(ceiling, rect.bottom);
    }
  }
  return Math.max(MIN_SLOT_HEIGHT, Math.floor(box.bottom - ceiling - OVERLAY_GAP));
}

export function PaletteStage4(props: ExperimentProps) {
  const { nodes, header, camera, inert } = props;
  const players = useContext(ExperimentPlayersContext);
  const windows = useWindows(props);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot>('hub');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [refused, setRefused] = useState(0);
  const [sheet, setSheet] = useState<{ key: string; tab: PlayerTab } | null>(null);
  const [slots, setSlots] = useRemembered<Slots>('palette-4-slots', { left: null, right: null });
  const [flash, setFlash] = useState<{ side: Side; at: number } | null>(null);
  /* Each slot's height in pixels, remembered once its top edge is dragged; null keeps the default. */
  const [heights, setHeights] = useRemembered<Record<Side, number | null>>('palette-4-heights', { left: null, right: null });
  /* The tallest each slot may grow before its top edge meets an overlay above it; null until measured. */
  const [limits, setLimits] = useState<Record<Side, number | null>>({ left: null, right: null });
  /* Bumps each time a drag runs into the limit, replaying the bounce. */
  const [bounce, setBounce] = useState<{ side: Side; at: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const measure = () => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    /* The camera dial hangs under the toolbar (Next phase, settings) by the same gap a slot keeps from it. */
    const toolbar = root.querySelector('.seated-toolbar');
    if (toolbar) {
      const top = toolbar.getBoundingClientRect().bottom - root.getBoundingClientRect().top + OVERLAY_GAP;
      root.style.setProperty('--palette-camera-top', `${Math.round(top)}px`);
    }
    const next: Record<Side, number | null> = { left: null, right: null };
    for (const side of ['left', 'right'] as const) {
      const slot = root.querySelector<HTMLElement>(`.${styles.slot}[data-side="${side}"]`);
      if (slot) {
        next[side] = slotLimit(root, slot);
      }
    }
    setLimits((current) => (current.left === next.left && current.right === next.right ? current : next));
  };
  useEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root) {
      return;
    }
    /* Chips come and go (an alliance forms, the phase changes), and the window resizes. */
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const overlay of root.querySelectorAll(OVERLAYS)) {
      observer.observe(overlay);
    }
    const mutations = new MutationObserver(measure);
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [slots.left?.key, slots.right?.key]);
  const heightOf = (side: Side) => {
    const wanted = heights[side];
    const limit = limits[side];
    if (wanted === null) {
      return limit === null ? undefined : { maxHeight: limit };
    }
    return { height: limit === null ? wanted : Math.min(wanted, limit) };
  };
  /* Dragging a slot's top edge: up makes it taller, down shorter. It stops short of any overlay above it and bounces there. */
  const resize = (side: Side) => (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const slot = event.currentTarget.parentElement!;
    const start = { y: event.clientY, height: slot.getBoundingClientRect().height };
    const limit = slotLimit(rootRef.current!, slot);
    let stopped = false;
    const move = (moveEvent: PointerEvent) => {
      const wanted = start.height + start.y - moveEvent.clientY;
      const height = Math.round(Math.max(MIN_SLOT_HEIGHT, Math.min(limit, wanted)));
      if (wanted > limit && !stopped) {
        setBounce((current) => ({ side, at: (current?.at ?? 0) + 1 }));
      }
      stopped = wanted > limit;
      setHeights((current) => ({ ...current, [side]: height }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const hold = useRef({ down: false, steered: false });

  const byKey = (key: string) => windows.find((entry) => entry.key === key);
  const ally = players?.players.find((player) => player.ally);
  const allyWindow = ally ? byKey(`player:${ally.seat}`) : undefined;
  const battle = byKey('battle');
  const tiles: Record<Exclude<Spot, 'hub' | 'search'>, Tile> = {
    hand: {
      spot: 'hand',
      window: byKey('hand'),
      label: byKey('hand')?.label ?? 'Hand',
      detail: 'Cards, leaders and spice',
      icon: <Hand size={30} strokeWidth={1.6} />,
      keys: '←',
      disabled: !byKey('hand'),
    },
    hidden: {
      spot: 'hidden',
      window: byKey('hidden-zone'),
      label: 'Hidden zone',
      detail: 'Pieces only you see',
      icon: <EyeOff size={30} strokeWidth={1.6} />,
      keys: '← ←',
      disabled: !byKey('hidden-zone'),
    },
    table: {
      spot: 'table',
      window: byKey('table-chat'),
      tab: 'conversation',
      label: 'Table chat',
      detail: players?.tableChat?.unread ? `${players.tableChat.unread} unread` : 'Everyone at the table',
      icon: <MessagesSquare size={30} strokeWidth={1.6} />,
      keys: '→',
      badge: players?.tableChat?.unread,
      disabled: !byKey('table-chat'),
    },
    ally: {
      spot: 'ally',
      window: allyWindow,
      tab: 'conversation',
      label: ally ? 'Ally chat' : 'Ally chat',
      detail: ally ? `${ally.name}${ally.factionName ? ` · ${ally.factionName}` : ''}` : 'No ally yet',
      icon: ally ? <PlayerToken player={ally} size={34} /> : <Handshake size={30} strokeWidth={1.6} />,
      keys: '→ →',
      badge: ally?.unread,
      disabled: !allyWindow,
    },
    battle: {
      spot: 'battle',
      window: battle,
      label: 'Battle plan',
      detail: battle ? 'Your plan for this battle' : 'No battle right now',
      icon: <Swords size={30} strokeWidth={1.6} />,
      keys: '↑',
      disabled: !battle,
    },
  };

  const show = (key: string, tab?: PlayerTab) => {
    const side = (['left', 'right'] as const).find((entry) => slots[entry]?.key === key);
    if (side) {
      /* Already pinned: the slot shows it, so it lights up rather than opening twice. */
      if (tab) {
        setSlots((current) => ({ ...current, [side]: { key, tab } }));
      }
      setFlash((current) => ({ side, at: (current?.at ?? 0) + 1 }));
      setSheet(null);
      setOpen(false);
      return;
    }
    const target = byKey(key);
    const chatFirst = target?.player && !target.player.own && target.player.canConverse;
    setSheet((current) =>
      current?.key === key && (tab === undefined || current.tab === tab)
        ? null
        : { key, tab: tab ?? (chatFirst ? 'conversation' : 'public') }
    );
    setOpen(false);
  };
  /* Pinning moves the centre window into a slot, replacing whatever was pinned there. */
  const pin = (side: Side) => {
    if (!sheet) {
      return;
    }
    setSlots((current) => ({ ...current, [side]: sheet }));
    setSheet(null);
  };
  const unpin = (side: Side) => setSlots((current) => ({ ...current, [side]: null }));
  const openCompass = () => {
    setOpen(true);
    setSpot('hub');
    setQuery('');
    setCursor(0);
  };
  const close = () => {
    setOpen(false);
    hold.current = { down: false, steered: false };
  };
  /* Opens what the compass points at; a tile with nothing behind it shakes instead. */
  const confirm = (at: Spot = spot) => {
    if (at === 'hub' && !query.trim()) {
      close();
      return;
    }
    if (at === 'hub' || at === 'search') {
      suggestions[cursor]?.run();
      return;
    }
    const tile = tiles[at];
    if (tile.disabled || !tile.window) {
      setRefused((count) => count + 1);
      return;
    }
    show(tile.window.key, tile.tab);
  };

  const suggestions: Suggestion[] = (() => {
    const all: (Suggestion & { text: string; weight: number })[] = [
      ...windows.map((entry) => ({
        key: entry.key,
        label: entry.label,
        hint: entry.player
          ? `${entry.player.factionName ?? 'Player'}${entry.player.unread ? ` · ${entry.player.unread} unread` : ''}`
          : entry.group === entry.label
            ? (entry.description ?? '')
            : entry.group,
        icon: entry.player ? <PlayerToken player={entry.player} size={20} /> : <TopicIcon topic={entry.topic} size={18} />,
        run: () => show(entry.key),
        text: `${entry.label} ${entry.player?.factionName ?? ''} ${entry.group}`,
        /* With nothing typed, unread chats and the phase lead. */
        weight: (entry.player?.unread ?? 0) * 10 + (entry.key === 'phase' ? 5 : 0) + (entry.player?.own ? -5 : 0),
      })),
      {
        key: 'cmd:next',
        label: 'Next phase',
        hint: 'Command',
        icon: <TopicIcon topic="turn" size={18} />,
        run: () => {
          close();
          pressControl('[aria-label="Next phase"]');
        },
        text: 'next phase',
        weight: 4,
      },
      ...(['map', 'left', 'right', 'bottom'] as const).map((view) => ({
        key: `cmd:camera:${view}`,
        label: `Camera: ${view === 'map' ? 'board' : `${view} bay`}`,
        hint: 'Command',
        icon: <TopicIcon topic="board" size={18} />,
        run: () => {
          close();
          pressControl(`.camera-dial__view[data-view="${view}"]`);
        },
        text: `camera ${view} view`,
        weight: 0,
      })),
    ];
    if (!query.trim()) {
      return [...all].sort((a, b) => b.weight - a.weight).slice(0, 6);
    }
    return all
      .map((entry) => ({ entry, score: fuzzy(entry.text, query) }))
      .filter((match): match is { entry: (typeof all)[number]; score: number } => match.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((match) => match.entry);
  })();

  /* The compass's keys: Space opens and confirms, the arrows steer, a window's letter jumps there. The table hears none of them. */
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const inSearch = event.target === inputRef.current;
      const typing =
        !inSearch &&
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement);
      if (typing) {
        return;
      }
      if (!open) {
        if (event.code === 'Space' && !event.repeat) {
          event.preventDefault();
          event.stopPropagation();
          openCompass();
          hold.current = { down: true, steered: false };
        }
        return;
      }
      const arrow = ARROWS[event.key];
      event.stopPropagation();
      /* With text in the centre field, left and right move its caret instead of steering. */
      if (arrow && spot === 'hub' && query && (arrow === 'left' || arrow === 'right')) {
        return;
      }
      if (arrow && spot === 'search' && (arrow === 'up' || arrow === 'down')) {
        event.preventDefault();
        if (arrow === 'up' && cursor === 0) {
          setSpot('hub');
        } else {
          setCursor((current) => Math.max(0, Math.min(suggestions.length - 1, current + (arrow === 'up' ? -1 : 1))));
        }
        return;
      }
      if (arrow) {
        event.preventDefault();
        hold.current.steered = true;
        setSpot((current) => MOVES[current][arrow]);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      } else if (event.code === 'Space' && (hold.current.down || event.repeat)) {
        event.preventDefault();
      } else if (event.code === 'Space' && !query) {
        event.preventDefault();
        confirm();
      } else if (event.key === 'Escape') {
        close();
      } else if (!inSearch) {
        /* Anything else typed goes into the centre field. */
        inputRef.current?.focus();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !hold.current.down) {
        return;
      }
      const steered = hold.current.steered;
      hold.current = { down: false, steered: false };
      /* Held and steered: letting go opens. A tap leaves the compass open to steer. */
      if (steered && open) {
        confirm();
      }
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
    };
  });
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open, spot]);
  useEffect(() => {
    if (!open && sheet === null) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !open) {
        setSheet(null);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, sheet]);
  useTablePress(() => setSheet(null), sheet !== null && !open);

  /* One window's frame, in the centre or in a slot: its title, a player's tabs, and the frame's own buttons. */
  const frame = (opened: Opened, where: 'centre' | Side, onTab: (tab: PlayerTab) => void, actions: ReactNode) => {
    const entry = byKey(opened.key);
    if (!entry) {
      return null;
    }
    return (
      <section
        key={where}
        className={clsx(base.sheet, where === 'centre' ? [bar.sheet, styles.centre] : styles.slot)}
        data-side={where}
        data-flash={flash?.side === where ? flash.at % 2 : undefined}
        aria-label={entry.label}
        inert={inert}
        data-hides-cursor
        data-bounce={bounce?.side === where ? bounce.at % 2 : undefined}
        style={where === 'centre' ? undefined : heightOf(where)}
      >
        {where !== 'centre' && (
          <span
            className={styles.resizeEdge}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize"
            title="Drag to resize; double-click to reset"
            onPointerDown={resize(where)}
            onDoubleClick={() => setHeights((current) => ({ ...current, [where]: null }))}
          />
        )}
        <header className={base.sheetTitle}>
          {entry.player ? <PlayerToken player={entry.player} size={24} /> : <TopicIcon topic={entry.topic} size={18} />}
          <span className={styles.frameName}>
            {entry.label}
            {entry.player?.factionName && !entry.player.own && (
              <span className={base.sheetGroup}> · {entry.player.factionName}</span>
            )}
          </span>
          {entry.player && <PlayerTabs player={entry.player} tab={opened.tab} onTab={onTab} />}
          <span className={base.sheetActions}>{actions}</span>
        </header>
        <DestinationBody
          destination={
            entry.player ? { ...entry, content: players?.render(entry.player.seat, opened.tab), flush: false } : entry
          }
          className={base.sheetBody}
        />
      </section>
    );
  };
  const others = players?.players.filter((player) => !player.own) ?? [];
  
  const tile = (entry: Tile) => (
    <button
      key={entry.spot}
      type="button"
      className={styles.tile}
      data-spot={entry.spot}
      data-selected={spot === entry.spot || undefined}
      data-disabled={entry.disabled || undefined}
      data-refused={spot === entry.spot && refused ? refused % 2 : undefined}
      onPointerEnter={() => setSpot(entry.spot)}
      onClick={() => confirm(entry.spot)}
    >
      <span className={styles.tileIcon}>{entry.icon}</span>
      <span className={styles.tileLabel}>{entry.label}</span>
      <span className={styles.tileDetail}>{entry.detail}</span>
      <span className={styles.tileKeys}>{entry.keys}</span>
      {entry.badge ? <span className={bar.badge}>{entry.badge}</span> : null}
    </button>
  );

  return (
    <div className={base.root} ref={rootRef}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} style={{ top: 'var(--palette-camera-top, calc(var(--play-header-height) + 0.5rem))', bottom: 'auto' }} />

      {sheet &&
        frame(
          sheet,
          'centre',
          (tab) => setSheet({ key: sheet.key, tab }),
          <>
            <button
              type="button"
              className={base.iconButton}
              aria-label="Pin to the bottom left"
              title={slots.left ? `Pin bottom left, replacing ${byKey(slots.left.key)?.label}` : 'Pin bottom left'}
              onClick={() => pin('left')}
            >
              <PanelLeft size={16} />
            </button>
            <button
              type="button"
              className={base.iconButton}
              aria-label="Pin to the bottom right"
              title={slots.right ? `Pin bottom right, replacing ${byKey(slots.right.key)?.label}` : 'Pin bottom right'}
              onClick={() => pin('right')}
            >
              <PanelRight size={16} />
            </button>
            <button type="button" className={base.iconButton} aria-label="Close" onClick={() => setSheet(null)}>
              <CloseIcon />
            </button>
          </>
        )}
      {(['left', 'right'] as const).map((side) => {
        const opened = slots[side];
        return opened
          ? frame(
              opened,
              side,
              (tab) => setSlots((current) => ({ ...current, [side]: { key: opened.key, tab } })),
              <button
                type="button"
                className={base.iconButton}
                aria-label="Unpin"
                title="Unpin: it disappears"
                onClick={() => unpin(side)}
              >
                <PinOff size={16} />
              </button>
            )
          : null;
      })}

      <div className={bar.bar} inert={inert} data-hides-cursor>
        <button type="button" className={bar.launcher} onClick={openCompass}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={base.glyph}>
            <circle cx="12" cy="12" r="8" />
            <path d="m12 7 2 5-2 5-2-5z" />
          </svg>
          Controls
          <Key>Space</Key>
        </button>
        {(players?.tableChat || others.length > 0) && (
          <nav className={bar.chats} aria-label="Chats">
            {players?.tableChat && (
              <button
                type="button"
                className={bar.chat}
                aria-pressed={[sheet, slots.left, slots.right].some((entry) => entry?.key === 'table-chat')}
                aria-label={`Table chat${players.tableChat.unread ? `, ${players.tableChat.unread} unread` : ''}`}
                data-tip="Table chat · Space →"
                onClick={() => show('table-chat', 'conversation')}
              >
                <span className={clsx(bar.token, bar.planet)}>
                  <MessagesSquare size={17} />
                </span>
                {players.tableChat.unread > 0 && <span className={bar.badge}>{players.tableChat.unread}</span>}
              </button>
            )}
            {others.map((player) => (
              <ChatToken
                key={player.seat}
                player={player}
                open={[sheet, slots.left, slots.right].some((entry) => entry?.key === `player:${player.seat}`)}
                onOpen={() => show(`player:${player.seat}`, player.canConverse ? 'conversation' : 'public')}
              />
            ))}
          </nav>
        )}
      </div>

      {open && (
        <div className={styles.backdrop} onPointerDown={close}>
          <div
            className={styles.compass}
            role="dialog"
            aria-label="Controls compass"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {tile(tiles.battle)}
            {tile(tiles.hidden)}
            {tile(tiles.hand)}
            <label className={styles.hub} data-selected={spot === 'hub' || undefined}>
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                aria-label="Search controls"
                placeholder="Type to search"
                value={query}
                onFocus={() => spot === 'search' || setSpot('hub')}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                  setSpot('hub');
                }}
              />
              <span className={styles.hubHint}>
                <Key>←</Key>
                <Key>→</Key>
                <Key>↑</Key>
                <Key>↓</Key>
              </span>
            </label>
            {tile(tiles.table)}
            {tile(tiles.ally)}
            <ul
              className={styles.suggestions}
              data-selected={spot === 'search' || undefined}
              role="listbox"
              aria-label={query ? 'Matches' : 'Suggested'}
            >
              <li className={styles.suggestionsTitle}>{query ? 'Matches' : 'Suggested'}</li>
              {suggestions.map((entry, index) => (
                <li
                  key={entry.key}
                  role="option"
                  aria-selected={(spot === 'search' || (spot === 'hub' && query !== '')) && index === cursor}
                  className={styles.suggestion}
                  onPointerEnter={() => {
                    setSpot('search');
                    setCursor(index);
                  }}
                  onClick={() => entry.run()}
                >
                  {entry.icon}
                  <span className={styles.suggestionLabel}>{entry.label}</span>
                  <span className={styles.suggestionHint}>{entry.hint}</span>
                </li>
              ))}
              {suggestions.length === 0 && <li className={styles.suggestionsTitle}>Nothing matches “{query}”</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerTabs({
  player,
  tab,
  onTab,
}: Readonly<{ player: ExperimentPlayer; tab: PlayerTab; onTab: (tab: PlayerTab) => void }>) {
  return (
    <span className={base.windowTabs} role="tablist" aria-label={`${player.name} tabs`}>
      {player.canConverse && !player.own && (
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'conversation'}
          className={base.windowTab}
          onClick={() => onTab('conversation')}
        >
          Chat
        </button>
      )}
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'public' || player.own || !player.canConverse}
        className={base.windowTab}
        onClick={() => onTab('public')}
      >
        Info
      </button>
    </span>
  );
}

function ChatToken({ player, open, onOpen }: Readonly<{ player: ExperimentPlayer; open: boolean; onOpen: () => void }>) {
  return (
    <button
      type="button"
      className={bar.chat}
      aria-pressed={open}
      aria-label={`${player.name}${player.factionName ? `, ${player.factionName}` : ''}${player.unread ? `, ${player.unread} unread` : ''}`}
      data-tip={`${player.name}${player.factionName ? ` · ${player.factionName}` : ''}${player.ally ? ' · ally · Space → →' : ''}`}
      data-ally={player.ally || undefined}
      onClick={onOpen}
    >
      <PlayerToken player={player} />
      {player.unread > 0 && <span className={bar.badge}>{player.unread}</span>}
      {player.attention && <span className={bar.attention} aria-hidden="true" />}
    </button>
  );
}
