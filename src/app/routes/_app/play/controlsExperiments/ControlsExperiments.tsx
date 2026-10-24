import { Stack } from '@mantine/core';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { PanelTab } from '../GameTable';
import { HeldSlot } from '../HeldContent';
import type { HeldNode } from '../HeldContent';
import styles from './ControlsExperiments.module.css';
import type { ControlsExperiment } from './experiment';
import { PaletteStage4 } from './PaletteStage4';

/*
 * The table's controls as a compass (Norbert, 2026-10-24): picked from seven explorations (branch claude/controls-layout-prototype-stages)
 * and shown only where a story or the New controls play-test chapter sets the experiment.
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

export function DestinationBody({
  destination,
  className,
}: Readonly<{ destination: Destination; className?: string }>) {
  return (
    <div className={clsx(styles.body, destination.flush && styles.bodyFlush, className)}>
      {destination.flush ? destination.content : <Stack gap="lg">{destination.content}</Stack>}
    </div>
  );
}

const REMEMBERED = 'dunezone-controls-experiment:';

/** Forgets every remembered choice, so the designs open as they first would; read before they mount. */
export function forgetRemembered() {
  try {
    for (const key of Object.keys(localStorage).filter((entry) => entry.startsWith(REMEMBERED))) {
      localStorage.removeItem(key);
    }
  } catch {
    /* Nothing remembered where storage is blocked. */
  }
}

function readRemembered<T>(key: string, fallback: T): T {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(`${REMEMBERED}${key}`);
  } catch {
    /* Blocked storage remembers nothing. */
  }
  return stored ? (JSON.parse(stored) as T) : fallback;
}

/* A remembered choice for one design, in this browser only. */
export function useRemembered<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readRemembered(key, fallback));
  const update = useCallback(
    (next: T | ((current: T) => T)) =>
      setValue((current) => {
        const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
        try {
          localStorage.setItem(`${REMEMBERED}${key}`, JSON.stringify(resolved));
        } catch {
          /* A private window keeps the choice for this visit only. */
        }
        return resolved;
      }),
    [key]
  );
  return [value, update] as const;
}

/* A press on the table itself, not on any of the chrome over it. */
export function useTablePress(onPress: () => void, enabled: boolean) {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement) {
        press();
      }
    };
    window.addEventListener('pointerdown', listener, true);
    return () => window.removeEventListener('pointerdown', listener, true);
  }, [enabled]);
}

export function Camera({
  camera,
  inert,
  style,
}: Readonly<{ camera: ReactNode; inert: boolean; style?: CSSProperties }>) {
  return (
    <div className="seated-column-camera" inert={inert} style={style}>
      {camera}
    </div>
  );
}

export function Scene({
  node,
  className,
  style,
}: Readonly<{ node: HeldNode; className?: string; style?: CSSProperties }>) {
  return (
    <div className={clsx(styles.scene, className)} style={style}>
      <HeldSlot node={node} />
    </div>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={styles.glyph}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function Key({ children }: Readonly<{ children: ReactNode }>) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/* Presses a control the header or dial already shows, so the compass can reach them without wiring of its own. */
export function pressControl(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

export function ExperimentLayout(props: ExperimentProps) {
  return <PaletteStage4 {...props} />;
}
