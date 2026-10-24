import { Stack } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { PanelTab } from '../GameTable';
import { HeldSlot } from '../HeldContent';
import type { HeldNode } from '../HeldContent';
import styles from './ControlsExperiments.module.css';
import type { ControlsExperiment } from './experiment';
import { PaletteStage2 } from './PaletteStage2';
import { PaletteStage3 } from './PaletteStage3';

/*
 * Design exploration (Norbert, 2026-10-24): seven ways for the table's controls to cover less of the screen.
 * Rough on purpose: a pick comes first, then the chosen one is built properly. Only Storybook shows these.
 */

export type ExperimentNodes = Readonly<{
  scene: HeldNode;
  controls: HeldNode | null;
  players: HeldNode | null;
}>;

export type ExperimentProps = Readonly<{
  experiment: ControlsExperiment;
  nodes: ExperimentNodes;
  header: ReactNode;
  camera: ReactNode;
  inert: boolean;
  tabs: readonly PanelTab[];
}>;

/** One place a design can open: a tab with no children, or one child of a group. */
export type Destination = Readonly<{
  key: string;
  label: string;
  group: string;
  groupKey: string;
  topic: TopicIconTopic;
  description?: string;
  content: ReactNode;
  flush: boolean;
}>;

export type Group = Readonly<{ key: string; label: string; topic: TopicIconTopic; items: readonly Destination[] }>;

export function groupsOf(tabs: readonly PanelTab[], players: HeldNode | null): Group[] {
  const groups: Group[] = tabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    topic: tab.topic,
    items: (tab.subtabs ?? [tab]).map((item) => ({
      key: item.key,
      label: item.label,
      group: tab.label,
      groupKey: tab.key,
      topic: item.topic,
      description: item.description,
      content: item.content,
      flush: item.padding === false,
    })),
  }));
  if (players) {
    groups.push({
      key: 'players',
      label: 'Players',
      topic: 'factions',
      items: [
        {
          key: 'players',
          label: 'Players',
          group: 'Players',
          groupKey: 'players',
          topic: 'factions',
          description: 'Each player, their info and your conversation with them',
          content: <HeldSlot node={players} />,
          flush: true,
        },
      ],
    });
  }
  return groups;
}

function useGroups(tabs: readonly PanelTab[], players: HeldNode | null) {
  return useMemo(() => groupsOf(tabs, players), [tabs, players]);
}

export function DestinationBody({ destination, className }: Readonly<{ destination: Destination; className?: string }>) {
  return (
    <div className={clsx(styles.body, destination.flush && styles.bodyFlush, className)}>
      {destination.flush ? destination.content : <Stack gap="lg">{destination.content}</Stack>}
    </div>
  );
}

/* A remembered choice for one design, in this browser only. */
export function useRemembered<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`dunezone-controls-experiment:${key}`);
      return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const update = useCallback(
    (next: T | ((current: T) => T)) =>
      setValue((current) => {
        const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
        try {
          localStorage.setItem(`dunezone-controls-experiment:${key}`, JSON.stringify(resolved));
        } catch {
          /* A private window keeps the choice for this visit only. */
        }
        return resolved;
      }),
    [key]
  );
  return [value, update] as const;
}

export function useKey(match: (event: KeyboardEvent) => boolean, onKey: (event: KeyboardEvent) => void, enabled = true) {
  const latest = useRef({ match, onKey });
  latest.current = { match, onKey };
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: KeyboardEvent) => {
      if (latest.current.match(event)) {
        latest.current.onKey(event);
      }
    };
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, [enabled]);
}

export function inTextField(event: KeyboardEvent) {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  );
}

/* A press on the table itself, not on any of the chrome over it. */
export function useTablePress(onPress: () => void, enabled: boolean) {
  const latest = useRef(onPress);
  latest.current = onPress;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement) {
        latest.current();
      }
    };
    window.addEventListener('pointerdown', listener, true);
    return () => window.removeEventListener('pointerdown', listener, true);
  }, [enabled]);
}

export function Camera({ camera, inert, style }: Readonly<{ camera: ReactNode; inert: boolean; style?: CSSProperties }>) {
  return (
    <div className="seated-column-camera" inert={inert} style={style}>
      {camera}
    </div>
  );
}

export function Scene({ node, className, style }: Readonly<{ node: HeldNode; className?: string; style?: CSSProperties }>) {
  return (
    <div className={clsx(styles.scene, className)} style={style}>
      <HeldSlot node={node} />
    </div>
  );
}

export function PinIcon({ pinned }: Readonly<{ pinned: boolean }>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={styles.glyph}>
      <path d={pinned ? 'M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8' : 'M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8M4 4l16 16'} />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={styles.glyph}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function Chevron({ up }: Readonly<{ up: boolean }>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={styles.glyph}>
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

export function Key({ children }: Readonly<{ children: ReactNode }>) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A. The tester's idea: two floating panels, the controls bottom left and the players bottom right.                  */
/* ------------------------------------------------------------------------------------------------------------------ */

type FloatSize = Readonly<{ width: number; height: number }>;

/* Drags the panel's free top corner: up grows it, and away from its own side widens it. */
function useCornerResize(size: FloatSize, setSize: (size: FloatSize) => void, side: 'left' | 'right') {
  return (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, ...size };
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.x) * (side === 'left' ? 1 : -1);
      setSize({
        width: Math.max(260, Math.min(window.innerWidth * 0.48, start.width + dx)),
        height: Math.max(160, Math.min(window.innerHeight * 0.8, start.height - (moveEvent.clientY - start.y))),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

function FloatingPanel({
  side,
  title,
  inert,
  children,
}: Readonly<{ side: 'left' | 'right'; title: string; inert: boolean; children: ReactNode }>) {
  const [size, setSize] = useRemembered<FloatSize>(`floating-${side}`, { width: 460, height: 300 });
  const [collapsed, setCollapsed] = useRemembered(`floating-${side}-collapsed`, false);
  const resize = useCornerResize(size, setSize, side);
  return (
    <section
      className={clsx(styles.float, side === 'left' ? styles.floatLeft : styles.floatRight)}
      data-collapsed={collapsed || undefined}
      data-dimmed={inert || undefined}
      style={{ width: size.width, height: collapsed ? undefined : size.height }}
      aria-label={title}
      inert={inert}
      data-hides-cursor
    >
      <header className={styles.floatTitle}>
        {!collapsed && (
          <span
            className={clsx(styles.cornerGrip, side === 'left' ? styles.cornerGripRight : styles.cornerGripLeft)}
            onPointerDown={resize}
            title="Drag to resize"
          />
        )}
        <span>{title}</span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={collapsed ? `Show ${title.toLowerCase()}` : `Tuck ${title.toLowerCase()} away`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          <Chevron up={collapsed} />
        </button>
      </header>
      <div className={styles.floatBody} hidden={collapsed}>
        <div className="seated-controls-panel seated-controls-panel--column">{children}</div>
      </div>
    </section>
  );
}

function FloatingPair({ nodes, header, camera, inert }: ExperimentProps) {
  return (
    <div className={styles.root}>
      <Scene node={nodes.scene} />
      {header}
      {nodes.controls && (
        <FloatingPanel side="left" title="Controls" inert={inert}>
          <HeldSlot node={nodes.controls} />
        </FloatingPanel>
      )}
      {nodes.players && (
        <FloatingPanel side="right" title="Players" inert={inert}>
          <HeldSlot node={nodes.players} />
        </FloatingPanel>
      )}
      <Camera camera={camera} inert={inert} style={{ top: 'calc(var(--play-header-height) + 0.5rem)', bottom: 'auto' }} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* B. Dock anywhere: every group is a window; drag its title to an edge to dock it there, or drop it anywhere to float. */
/* ------------------------------------------------------------------------------------------------------------------ */

type DockPlace = 'left' | 'right' | 'bottom' | 'float';
type DockWindow = Readonly<{ place: DockPlace; x: number; y: number; w: number; h: number; collapsed: boolean; tab?: string }>;
type DockState = Readonly<Record<string, DockWindow>>;

const DOCK_DEFAULTS: Record<string, Partial<DockWindow>> = {
  yours: { place: 'left' },
  game: { place: 'left' },
  table: { place: 'float', x: 0.62, y: 0.55 },
  history: { place: 'right', collapsed: true },
  players: { place: 'right' },
};

function dockWindow(state: DockState, key: string, index: number): DockWindow {
  return (
    state[key] ?? {
      place: 'float',
      x: 0.3 + index * 0.04,
      y: 0.3 + index * 0.04,
      w: 380,
      h: 300,
      collapsed: false,
      ...DOCK_DEFAULTS[key],
    }
  );
}

const DOCK_EDGE_PX = 90;

function dropPlace(x: number, y: number, rect: DOMRect): DockPlace {
  if (x - rect.left < DOCK_EDGE_PX) {
    return 'left';
  }
  if (rect.right - x < DOCK_EDGE_PX) {
    return 'right';
  }
  if (rect.bottom - y < DOCK_EDGE_PX) {
    return 'bottom';
  }
  return 'float';
}

function GroupWindow({
  group,
  window: frame,
  dragging,
  onChange,
  onDragStart,
  style,
}: Readonly<{
  group: Group;
  window: DockWindow;
  dragging: boolean;
  onChange: (next: Partial<DockWindow>) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  style?: CSSProperties;
}>) {
  const active = group.items.find((item) => item.key === frame.tab) ?? group.items[0]!;
  return (
    <section
      className={styles.window}
      data-place={frame.place}
      data-collapsed={frame.collapsed || undefined}
      data-dragging={dragging || undefined}
      style={style}
      aria-label={group.label}
      data-hides-cursor
    >
      <header className={styles.windowTitle} onPointerDown={onDragStart} title="Drag to an edge to dock, or anywhere to float">
        <span className={styles.grip} aria-hidden="true">
          ⠿
        </span>
        <TopicIcon topic={group.topic} size={16} />
        <span className={styles.windowName}>{group.label}</span>
        {group.items.length > 1 && !frame.collapsed && (
          <span className={styles.windowTabs} role="tablist" aria-label={`${group.label} tabs`}>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={item.key === active.key}
                className={styles.windowTab}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onChange({ tab: item.key })}
              >
                {item.label}
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          className={styles.iconButton}
          aria-label={frame.collapsed ? `Open ${group.label}` : `Fold ${group.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onChange({ collapsed: !frame.collapsed })}
        >
          <Chevron up={frame.collapsed} />
        </button>
      </header>
      {!frame.collapsed && <DestinationBody destination={active} className={styles.windowBody} />}
    </section>
  );
}

function Docking({ nodes, header, camera, inert, tabs }: ExperimentProps) {
  const groups = useGroups(tabs, nodes.players);
  const [state, setState] = useRemembered<DockState>('docking', {});
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ key: string; place: DockPlace } | null>(null);
  const windows = groups.map((group, index) => ({ group, frame: dockWindow(state, group.key, index) }));
  const update = (key: string, index: number, next: Partial<DockWindow>) =>
    setState((current) => ({ ...current, [key]: { ...dockWindow(current, key, index), ...next } }));

  const startDrag = (key: string, index: number) => (event: ReactPointerEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    const frame = dockWindow(state, key, index);
    const windowRect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const grab = { dx: event.clientX - windowRect.left, dy: event.clientY - windowRect.top };
    const w = frame.place === 'float' ? frame.w : Math.min(380, windowRect.width);
    const h = frame.place === 'float' ? frame.h : Math.min(320, windowRect.height);
    const move = (moveEvent: PointerEvent) => {
      const place = dropPlace(moveEvent.clientX, moveEvent.clientY, rect);
      setDrag({ key, place });
      update(key, index, {
        place: 'float',
        w,
        h,
        x: (moveEvent.clientX - grab.dx - rect.left) / rect.width,
        y: (moveEvent.clientY - grab.dy - rect.top) / rect.height,
      });
    };
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const place = dropPlace(upEvent.clientX, upEvent.clientY, rect);
      if (place !== 'float') {
        update(key, index, { place });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const edge = (place: DockPlace) =>
    windows
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => entry.frame.place === place && entry.group.key !== drag?.key);
  const edgeColumn = (place: 'left' | 'right' | 'bottom') => {
    const docked = edge(place);
    if (docked.length === 0 && drag?.place !== place) {
      return null;
    }
    return (
      <div className={styles.dockEdge} data-edge={place} data-target={drag?.place === place || undefined} inert={inert}>
        {docked.map(({ group, frame, index }) => (
          <GroupWindow
            key={group.key}
            group={group}
            window={frame}
            dragging={false}
            onChange={(next) => update(group.key, index, next)}
            onDragStart={startDrag(group.key, index)}
          />
        ))}
        {drag?.place === place && <div className={styles.dropHint}>Dock here</div>}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={clsx(styles.root, styles.dockRoot)} data-dragging={drag ? true : undefined}>
      {edgeColumn('left')}
      <div className={styles.dockCentre}>
        <Scene node={nodes.scene} />
        {header}
        <Camera camera={camera} inert={inert} />
      </div>
      {edgeColumn('right')}
      {edgeColumn('bottom')}
      {windows.map(({ group, frame }, index) =>
        frame.place === 'float' || drag?.key === group.key ? (
          <GroupWindow
            key={group.key}
            group={group}
            window={frame}
            dragging={drag?.key === group.key}
            onChange={(next) => update(group.key, index, next)}
            onDragStart={startDrag(group.key, index)}
            style={{
              position: 'absolute',
              left: `${frame.x * 100}%`,
              top: `${frame.y * 100}%`,
              width: frame.w,
              height: frame.collapsed ? undefined : frame.h,
              zIndex: drag?.key === group.key ? 30 : 20,
            }}
          />
        ) : null
      )}
      {drag && (
        <div className={styles.dockGuide} aria-hidden="true">
          Drop on the left, right or bottom edge to dock · anywhere else floats
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* C. Command palette: nothing on screen but the table; / or ⌘K finds any control, which opens as one sheet.            */
/* ------------------------------------------------------------------------------------------------------------------ */

type PaletteEntry = Readonly<{
  key: string;
  label: string;
  hint: string;
  topic: TopicIconTopic;
  run: () => void;
}>;

/* Presses a control the header or dial already shows, so the palette can reach them without wiring of its own. */
export function pressControl(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

function matches(entry: PaletteEntry, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${entry.label} ${entry.hint}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

function Palette({ nodes, header, camera, inert, tabs }: ExperimentProps) {
  const groups = useGroups(tabs, nodes.players);
  const all = groups.flatMap((group) => group.items);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [sheet, setSheet] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [recent, setRecent] = useRemembered<string[]>('palette-recent', []);
  const inputRef = useRef<HTMLInputElement>(null);

  const openSheet = (key: string) => {
    setSheet(key);
    setRecent((current) => [key, ...current.filter((entry) => entry !== key)].slice(0, 4));
  };
  const entries: PaletteEntry[] = [
    ...all.map((item) => ({
      key: item.key,
      label: item.label,
      hint: item.group === item.label ? (item.description ?? '') : `${item.group} · ${item.description ?? ''}`,
      topic: item.topic,
      run: () => openSheet(item.key),
    })),
    {
      key: 'cmd:next',
      label: 'Next phase',
      hint: 'Command · same as the header button',
      topic: 'turn',
      run: () => pressControl('[aria-label="Next phase"]'),
    },
    ...(['map', 'left', 'right', 'bottom'] as const).map((view) => ({
      key: `cmd:camera:${view}`,
      label: `Camera: ${view === 'map' ? 'board' : `${view} bay`}`,
      hint: 'Command · moves the camera',
      topic: 'board' as const,
      run: () => pressControl(`.camera-dial__view[data-view="${view}"]`),
    })),
  ];
  const ordered = query
    ? entries.filter((entry) => matches(entry, query))
    : [
        ...recent.flatMap((key) => entries.filter((entry) => entry.key === key)),
        ...entries.filter((entry) => !recent.includes(entry.key)),
      ];
  const show = () => {
    setOpen(true);
    setQuery('');
    setCursor(0);
  };
  useKey(
    (event) =>
      !open && ((event.key === '/' && !inTextField(event)) || (event.key === 'k' && (event.metaKey || event.ctrlKey))),
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      show();
    }
  );
  useKey(
    (event) => event.key === 'Escape' && !open && sheet !== null,
    () => setSheet(null)
  );
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);
  useTablePress(() => setSheet(null), sheet !== null && !pinned);

  const shown = all.find((item) => item.key === sheet);
  const choose = (entry: PaletteEntry | undefined) => {
    setOpen(false);
    entry?.run();
  };
  return (
    <div className={styles.root}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} />
      {!shown && (
        <button type="button" className={styles.launcher} onClick={show} inert={inert} data-hides-cursor>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={styles.glyph}>
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.5-4.5" />
          </svg>
          Find a control or command
          <Key>/</Key>
        </button>
      )}
      {shown && (
        <section className={styles.sheet} aria-label={shown.label} inert={inert} data-hides-cursor>
          <header className={styles.sheetTitle}>
            <TopicIcon topic={shown.topic} size={18} />
            <span>
              {shown.group !== shown.label && <span className={styles.sheetGroup}>{shown.group} › </span>}
              {shown.label}
            </span>
            <span className={styles.sheetActions}>
              <button type="button" className={styles.textButton} onClick={show}>
                Switch <Key>/</Key>
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin: close when I click the table' : 'Pin: keep open while I play'}
                title={pinned ? 'Pinned: stays open' : 'Closes when you click the table'}
                onClick={() => setPinned((current) => !current)}
              >
                <PinIcon pinned={pinned} />
              </button>
              <button type="button" className={styles.iconButton} aria-label="Close" onClick={() => setSheet(null)}>
                <CloseIcon />
              </button>
            </span>
          </header>
          <DestinationBody destination={shown} className={styles.sheetBody} />
        </section>
      )}
      {open && (
        <div className={styles.paletteBackdrop} onPointerDown={() => setOpen(false)}>
          <div
            className={styles.palette}
            role="dialog"
            aria-label="Find a control"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              className={styles.paletteInput}
              placeholder="Hand, battle, spice, next phase, camera…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setCursor((current) => Math.min(ordered.length - 1, current + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCursor((current) => Math.max(0, current - 1));
                } else if (event.key === 'Enter') {
                  choose(ordered[cursor]);
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
                event.stopPropagation();
              }}
            />
            <ul className={styles.paletteList} role="listbox">
              {ordered.map((entry, index) => (
                <li
                  key={entry.key}
                  role="option"
                  aria-selected={index === cursor}
                  className={styles.paletteItem}
                  onPointerEnter={() => setCursor(index)}
                  onClick={() => choose(entry)}
                >
                  <TopicIcon topic={entry.topic} size={18} />
                  <span className={styles.paletteLabel}>{entry.label}</span>
                  <span className={styles.paletteHint}>
                    {!query && recent.includes(entry.key) ? 'Recent' : entry.hint}
                  </span>
                </li>
              ))}
              {ordered.length === 0 && <li className={styles.paletteEmpty}>Nothing matches “{query}”</li>}
            </ul>
            <footer className={styles.paletteFooter}>
              <Key>↑</Key>
              <Key>↓</Key> to choose · <Key>Enter</Key> to open · <Key>Esc</Key> to close
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* D. Pie menu, like the original Sims: hold Space over the table, and the groups fan out around the pointer.          */
/* ------------------------------------------------------------------------------------------------------------------ */

const PIE_INNER = 92;
const PIE_OUTER = 190;

function polar(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

function clampPie(x: number, y: number) {
  const margin = PIE_OUTER + 70;
  return {
    x: Math.max(margin, Math.min(window.innerWidth - margin, x)),
    y: Math.max(margin - 40, Math.min(window.innerHeight - margin + 40, y)),
  };
}

function Pie({ nodes, header, camera, inert, tabs }: ExperimentProps) {
  const groups = useGroups(tabs, nodes.players);
  const [pie, setPie] = useState<{ x: number; y: number; held: boolean } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{ key: string; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState(false);
  const pointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const choice = useRef<string | null>(null);

  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', track);
    return () => window.removeEventListener('pointermove', track);
  }, []);
  const openAt = (x: number, y: number, held: boolean) => {
    setHovered(null);
    choice.current = null;
    setPie({ ...clampPie(x, y), held });
  };
  useKey(
    (event) => event.code === 'Space' && !event.repeat && !inTextField(event) && !pie,
    (event) => {
      event.preventDefault();
      openAt(pointer.current.x, pointer.current.y, true);
    }
  );
  useEffect(() => {
    if (!pie?.held) {
      return;
    }
    const release = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      /* Let go on a choice opens it; let go on nothing keeps the pie open to click. */
      if (choice.current) {
        open(choice.current);
      } else {
        setPie((current) => current && { ...current, held: false });
      }
    };
    window.addEventListener('keyup', release);
    return () => window.removeEventListener('keyup', release);
  });
  useKey(
    (event) => event.key === 'Escape' && (pie !== null || bubble !== null),
    () => (pie ? setPie(null) : setBubble(null))
  );
  useTablePress(() => setBubble(null), bubble !== null && !pinned && pie === null);

  const open = (key: string) => {
    const at = pie ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setPie(null);
    setBubble({ key, x: at.x, y: at.y });
  };
  const point = (key: string | null) => {
    choice.current = key;
  };
  const shown = groups.flatMap((group) => group.items).find((item) => item.key === bubble?.key);
  const hoveredGroup = groups.find((group) => group.key === hovered);
  const step = 360 / Math.max(groups.length, 1);

  return (
    <div className={styles.root}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} />
      {!pie && (
        <button
          type="button"
          className={styles.pieLauncher}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openAt(rect.left + rect.width / 2, rect.top - PIE_OUTER, false);
          }}
          inert={inert}
          data-hides-cursor
          aria-label="Open the pie menu"
        >
          <span className={styles.pieLauncherDisc} aria-hidden="true">
            ✦
          </span>
          <span>
            Hold <Key>Space</Key> over the table
          </span>
        </button>
      )}
      {shown && bubble && (
        <section
          className={styles.bubble}
          aria-label={shown.label}
          style={bubblePlacement(bubble.x, bubble.y)}
          inert={inert}
          data-hides-cursor
        >
          <header className={styles.sheetTitle}>
            <TopicIcon topic={shown.topic} size={18} />
            <span>{shown.label}</span>
            <span className={styles.sheetActions}>
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin' : 'Pin'}
                title={pinned ? 'Pinned: stays open' : 'Closes when you click the table'}
                onClick={() => setPinned((current) => !current)}
              >
                <PinIcon pinned={pinned} />
              </button>
              <button type="button" className={styles.iconButton} aria-label="Close" onClick={() => setBubble(null)}>
                <CloseIcon />
              </button>
            </span>
          </header>
          <DestinationBody destination={shown} className={styles.sheetBody} />
        </section>
      )}
      {pie && (
        <div className={styles.pieBackdrop} onPointerDown={() => setPie(null)}>
          <div
            className={styles.pie}
            style={{ left: pie.x, top: pie.y }}
            role="menu"
            aria-label="Controls"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className={styles.pieHub} aria-hidden="true">
              {hoveredGroup ? <TopicIcon topic={hoveredGroup.topic} size={34} /> : <span>✦</span>}
            </div>
            {groups.map((group, index) => {
              const angle = index * step;
              const at = polar(angle, PIE_INNER);
              const single = group.items.length === 1 ? group.items[0] : undefined;
              return (
                <button
                  key={group.key}
                  type="button"
                  role="menuitem"
                  className={styles.pieItem}
                  data-active={hovered === group.key || undefined}
                  style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
                  onPointerEnter={() => {
                    setHovered(group.key);
                    point(single?.key ?? null);
                  }}
                  onClick={() => (single ? open(single.key) : setHovered(group.key))}
                >
                  <TopicIcon topic={group.topic} size={18} />
                  {group.label}
                </button>
              );
            })}
            {hoveredGroup &&
              hoveredGroup.items.length > 1 &&
              hoveredGroup.items.map((item, index) => {
                const spread = Math.min(26, 120 / hoveredGroup.items.length);
                const centre = groups.indexOf(hoveredGroup) * step;
                const angle = centre + (index - (hoveredGroup.items.length - 1) / 2) * spread;
                const at = polar(angle, PIE_OUTER);
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className={clsx(styles.pieItem, styles.pieChild)}
                    style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
                    onPointerEnter={() => point(item.key)}
                    onPointerLeave={() => point(null)}
                    onClick={() => open(item.key)}
                  >
                    {item.label}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/* The bubble opens beside where the pie was, on whichever side has room, with its tail toward that point. */
function bubblePlacement(x: number, y: number): CSSProperties {
  const width = Math.min(440, window.innerWidth * 0.4);
  const left = x + width + 40 < window.innerWidth ? x + 24 : x - width - 24;
  const top = Math.max(80, Math.min(window.innerHeight - 420, y - 160));
  return { left, top, width };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* E. Edge drawers: two thin rails of icons on the screen's sides; each slides its drawer out over the table.          */
/* ------------------------------------------------------------------------------------------------------------------ */

function Drawers({ nodes, header, camera, inert, tabs }: ExperimentProps) {
  const groups = useGroups(tabs, nodes.players);
  const left = groups.filter((group) => group.key === 'yours' || group.key === 'game');
  const right = groups.filter((group) => !left.includes(group));
  const [open, setOpen] = useState<{ side: 'left' | 'right'; key: string } | null>(null);
  const [pinned, setPinned] = useRemembered('drawers-pinned', false);
  useKey(
    (event) => event.key === 'Escape' && open !== null,
    () => setOpen(null)
  );
  useTablePress(() => setOpen(null), open !== null && !pinned);
  const all = groups.flatMap((group) => group.items);
  const shown = all.find((item) => item.key === open?.key);

  const rail = (side: 'left' | 'right', railGroups: readonly Group[]) => (
    <nav className={styles.rail} data-side={side} aria-label={`${side} drawers`} inert={inert} data-hides-cursor>
      {railGroups.map((group, groupIndex) => (
        <div key={group.key} className={styles.railGroup}>
          {groupIndex > 0 && <span className={styles.railRule} aria-hidden="true" />}
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={styles.railItem}
              aria-pressed={open?.key === item.key}
              aria-label={item.label}
              data-label={item.label}
              onClick={() => setOpen((current) => (current?.key === item.key ? null : { side, key: item.key }))}
            >
              <TopicIcon topic={item.topic} size={20} />
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
  return (
    <div className={styles.root}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} style={{ right: '4.6rem' }} />
      {rail('left', left)}
      {rail('right', right)}
      {(['left', 'right'] as const).map((side) => (
        <section
          key={side}
          className={styles.drawer}
          data-side={side}
          data-open={(open?.side === side && shown) || undefined}
          aria-label={open?.side === side ? shown?.label : undefined}
          aria-hidden={open?.side !== side}
          inert={inert || open?.side !== side}
          data-hides-cursor
        >
          {open?.side === side && shown && (
            <>
              <header className={styles.sheetTitle}>
                <TopicIcon topic={shown.topic} size={18} />
                <span>
                  {shown.group !== shown.label && <span className={styles.sheetGroup}>{shown.group} › </span>}
                  {shown.label}
                </span>
                <span className={styles.sheetActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-pressed={pinned}
                    aria-label={pinned ? 'Unpin drawers' : 'Pin drawers open'}
                    title={pinned ? 'Pinned: stays open while you play' : 'Slides away when you click the table'}
                    onClick={() => setPinned((current) => !current)}
                  >
                    <PinIcon pinned={pinned} />
                  </button>
                  <button type="button" className={styles.iconButton} aria-label="Close" onClick={() => setOpen(null)}>
                    <CloseIcon />
                  </button>
                </span>
              </header>
              <DestinationBody destination={shown} className={styles.sheetBody} />
            </>
          )}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* F. A hand of cards: every control is a card fanned along the bottom edge; pick one up to read and use it.           */
/* ------------------------------------------------------------------------------------------------------------------ */

function Fan({ nodes, header, camera, inert, tabs }: ExperimentProps) {
  const cards = useGroups(tabs, nodes.players);
  const [raised, setRaised] = useState<{ group: string; tab?: string } | null>(null);
  useKey(
    (event) => event.key === 'Escape' && raised !== null,
    () => setRaised(null)
  );
  useTablePress(() => setRaised(null), raised !== null);
  const count = cards.length;
  return (
    <div className={styles.root}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} />
      <div className={styles.fan} inert={inert} data-hides-cursor data-raised={raised !== null || undefined}>
        {cards.map((card, index) => {
          const offset = index - (count - 1) / 2;
          const isRaised = raised?.group === card.key;
          const active = card.items.find((item) => item.key === raised?.tab) ?? card.items[0]!;
          return (
            <section
              key={card.key}
              className={styles.fanCard}
              data-raised={isRaised || undefined}
              style={
                {
                  '--fan-angle': `${offset * 5}deg`,
                  '--fan-x': `${offset * 8.4}rem`,
                  '--fan-drop': `${Math.abs(offset) ** 2 * 0.12}rem`,
                  zIndex: isRaised ? 50 : index,
                } as CSSProperties
              }
              aria-label={card.label}
            >
              <button
                type="button"
                className={styles.fanCardFace}
                aria-expanded={isRaised}
                onClick={() => setRaised(isRaised ? null : { group: card.key })}
              >
                <TopicIcon topic={card.topic} size={20} />
                <span className={styles.fanCardLabel}>{card.label}</span>
                {card.items.length > 1 && (
                  <span className={styles.fanCardGroup}>{card.items.map((item) => item.label).join(' · ')}</span>
                )}
              </button>
              {isRaised && card.items.length > 1 && (
                <span className={styles.windowTabs} role="tablist" aria-label={`${card.label} tabs`}>
                  {card.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={item.key === active.key}
                      className={styles.windowTab}
                      onClick={() => setRaised({ group: card.key, tab: item.key })}
                    >
                      {item.label}
                    </button>
                  ))}
                </span>
              )}
              {isRaised && <DestinationBody destination={active} className={styles.fanCardBody} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* G. Flip: the table owns the whole screen, or the controls do with the live table shrunk to a corner; ` flips.       */
/* ------------------------------------------------------------------------------------------------------------------ */

function Swap({ nodes, header, camera, inert }: ExperimentProps) {
  const [mode, setMode] = useState<'table' | 'controls'>('table');
  const flip = () => setMode((current) => (current === 'table' ? 'controls' : 'table'));
  useKey(
    (event) => event.code === 'Backquote' && !inTextField(event),
    (event) => {
      event.preventDefault();
      flip();
    }
  );
  return (
    <div className={clsx(styles.root, styles.swapRoot)} data-mode={mode}>
      <div className={styles.swapControls} inert={mode === 'table' || inert} aria-hidden={mode === 'table'}>
        <div className={styles.swapPane}>
          <div className="seated-controls-panel seated-controls-panel--column">
            {nodes.controls && <HeldSlot node={nodes.controls} />}
          </div>
        </div>
        <div className={clsx(styles.swapPane, styles.swapPlayers)}>
          <div className="seated-controls-panel seated-controls-panel--column">
            {nodes.players && <HeldSlot node={nodes.players} />}
          </div>
        </div>
      </div>
      <div className={styles.swapScene}>
        <Scene node={nodes.scene} />
        {mode === 'table' ? header : null}
        {mode === 'table' && <Camera camera={camera} inert={inert} />}
        {mode === 'controls' && (
          <button type="button" className={styles.swapExpand} onClick={flip} data-hides-cursor>
            Back to the table <Key>`</Key>
          </button>
        )}
      </div>
      {mode === 'controls' && <div className={styles.swapHeader}>{header}</div>}
      {mode === 'table' && (
        <button type="button" className={styles.swapTab} onClick={flip} inert={inert} data-hides-cursor>
          <TopicIcon topic="controls" size={18} />
          Controls <Key>`</Key>
        </button>
      )}
    </div>
  );
}

const LAYOUTS: Record<ControlsExperiment, (props: ExperimentProps) => ReactNode> = {
  'floating-pair': FloatingPair,
  docking: Docking,
  palette: Palette,
  pie: Pie,
  drawers: Drawers,
  fan: Fan,
  swap: Swap,
  'palette-2': PaletteStage2,
  'palette-3': PaletteStage3,
};

export function ExperimentLayout(props: ExperimentProps) {
  const Layout = LAYOUTS[props.experiment];
  return <Layout {...props} />;
}
