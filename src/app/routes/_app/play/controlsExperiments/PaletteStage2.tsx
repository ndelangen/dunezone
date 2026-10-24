import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext, useEffect, useRef, useState } from 'react';

import {
  Camera,
  CloseIcon,
  DestinationBody,
  groupsOf,
  inTextField,
  Key,
  PinIcon,
  pressControl,
  Scene,
  useKey,
  useRemembered,
  useTablePress,
} from './ControlsExperiments';
import type { Destination, ExperimentProps } from './ControlsExperiments';
import base from './ControlsExperiments.module.css';
import { ExperimentPlayersContext } from './experiment';
import type { ExperimentPlayer } from './experiment';
import styles from './PaletteStage2.module.css';

/*
 * The command palette's second stage (Norbert, 2026-10-24):
 * Space opens it, and Space held with a window's key opens that window straight away;
 * every player is a window of their own; Hand and Spice share one window without the "take into hand" button;
 * and a chat bar of faction tokens stays beside the palette's button, with each player's unread count.
 */

type PlayerTab = 'public' | 'conversation';

type PaletteWindow = Destination &
  Readonly<{
    shortcut: string;
    player?: ExperimentPlayer;
    chat?: boolean;
  }>;

type Command = Readonly<{ key: string; label: string; hint: string; topic: TopicIconTopic; run: () => void }>;

/* The keys the windows take while Space is held; anything not listed takes the first free letter of its name. */
const PREFERRED_KEYS: Record<string, string> = {
  hand: 'H',
  'hidden-zone': 'Z',
  phase: 'P',
  setup: 'S',
  battle: 'B',
  alliances: 'A',
  result: 'R',
  shared: 'I',
  tints: 'T',
  settings: 'O',
  'game-log': 'L',
  audit: 'U',
  replay: 'Y',
  'table-chat': 'C',
};

function assignShortcuts<T extends Readonly<{ key: string; label: string }>>(entries: readonly T[], taken: Set<string>) {
  return entries.map((entry) => {
    const preferred = PREFERRED_KEYS[entry.key];
    const letters = [...(preferred ?? ''), ...entry.label.toUpperCase().replace(/[^A-Z]/g, ''), ...'EGJKMNQVWX'];
    const shortcut = letters.find((letter) => !taken.has(letter)) ?? '';
    taken.add(shortcut);
    return { ...entry, shortcut };
  });
}

function PlayerToken({ player, size = 30 }: Readonly<{ player: ExperimentPlayer; size?: number }>) {
  return player.token ? (
    <img className={styles.token} src={player.token} alt="" width={size} height={size} />
  ) : (
    <span className={styles.token} style={{ width: size, height: size }} aria-hidden="true">
      {player.name.slice(0, 1)}
    </span>
  );
}

function useWindows(props: ExperimentProps): PaletteWindow[] {
  const players = useContext(ExperimentPlayersContext);
  const items = groupsOf(props.tabs, null).flatMap((group) => group.items);
  const hand = items.find((item) => item.key === 'hand');
  const spice = items.find((item) => item.key === 'spice');
  const controls = items
    .filter((item) => item.key !== 'spice')
    .map((item) =>
      item.key === 'hand' && hand && spice
        ? {
            ...item,
            label: 'Hand & spice',
            description: 'Your cards, leaders and spice reserve.',
            content: (
              <>
                {hand.content}
                {spice.content}
              </>
            ),
          }
        : item
    );
  const taken = new Set<string>();
  const windows: PaletteWindow[] = assignShortcuts(controls, taken);
  if (players?.tableChat) {
    windows.push(
      ...assignShortcuts(
        [
          {
            key: 'table-chat',
            label: 'Table chat',
            group: 'Players',
            groupKey: 'players',
            topic: 'planet' as const,
            description: 'Everyone at the table',
            content: players.render(TABLE_CONVERSATION, 'conversation'),
            flush: false,
            chat: true,
          },
        ],
        taken
      )
    );
  }
  /* The other players take the digits in seat order; the viewer's own window comes last, on 0. */
  let digit = 1;
  for (const player of players?.players ?? []) {
    windows.push({
      key: `player:${player.seat}`,
      label: player.own ? `You (${player.factionName ?? player.name})` : player.name,
      group: 'Players',
      groupKey: 'players',
      topic: 'factions',
      description: player.factionName ?? undefined,
      content: null,
      flush: false,
      shortcut: player.own ? '0' : String(digit++),
      player,
    });
  }
  return windows;
}

function matches(text: string, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => text.toLowerCase().includes(word));
}

export function PaletteStage2(props: ExperimentProps) {
  const { nodes, header, camera, inert } = props;
  const players = useContext(ExperimentPlayersContext);
  const windows = useWindows(props);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [sheet, setSheet] = useState<{ key: string; tab: PlayerTab } | null>(null);
  const [pinned, setPinned] = useRemembered('palette-2-pinned', false);
  const [hints, setHints] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chord = useRef({ down: false, used: false, timer: 0 });

  const show = (key: string, tab?: PlayerTab) => {
    const target = windows.find((entry) => entry.key === key);
    const chatFirst = target?.player && !target.player.own && target.player.canConverse;
    setSheet((current) =>
      current?.key === key && (tab === undefined || current.tab === tab)
        ? null
        : { key, tab: tab ?? (chatFirst ? 'conversation' : 'public') }
    );
    setOpen(false);
  };
  const openPalette = () => {
    setOpen(true);
    setQuery('');
    setCursor(0);
  };

  /* Space tapped opens the palette; Space held with a window's key opens that window, and the table never hears the key. */
  useKey(
    (event) => !open && !inTextField(event) && (event.code === 'Space' || chord.current.down),
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Space') {
        if (!event.repeat && !chord.current.down) {
          chord.current = { down: true, used: false, timer: window.setTimeout(() => setHints(true), 350) };
        }
        return;
      }
      const key = event.key.length === 1 ? event.key.toUpperCase() : '';
      const target = windows.find((entry) => entry.shortcut === key);
      if (target) {
        chord.current.used = true;
        show(target.key);
      }
    }
  );
  useEffect(() => {
    const release = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !chord.current.down) {
        return;
      }
      window.clearTimeout(chord.current.timer);
      const used = chord.current.used;
      chord.current = { down: false, used: false, timer: 0 };
      setHints(false);
      if (!used) {
        openPalette();
      }
    };
    const reset = () => {
      window.clearTimeout(chord.current.timer);
      chord.current = { down: false, used: false, timer: 0 };
      setHints(false);
    };
    window.addEventListener('keyup', release, true);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keyup', release, true);
      window.removeEventListener('blur', reset);
    };
  });
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

  const commands: Command[] = [
    ...windows.map((entry) => ({
      key: entry.key,
      label: entry.label,
      hint: entry.player
        ? `${entry.player.own ? 'Your seat' : 'Player'}${entry.player.factionName ? ` · ${entry.player.factionName}` : ''}`
        : `${entry.group === entry.label ? '' : `${entry.group} · `}${entry.description ?? ''}`,
      topic: entry.topic,
      run: () => show(entry.key),
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
  const listed = commands.filter((entry) => matches(`${entry.label} ${entry.hint}`, query));
  const choose = (entry: Command | undefined) => {
    setOpen(false);
    entry?.run();
  };
  const shortcutOf = (key: string) => windows.find((entry) => entry.key === key)?.shortcut;

  const shown = windows.find((entry) => entry.key === sheet?.key);
  const playerTab = sheet?.tab ?? 'public';
  const others = players?.players.filter((player) => !player.own) ?? [];

  return (
    <div className={base.root}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} />

      {shown && (
        <section className={clsx(base.sheet, styles.sheet)} aria-label={shown.label} inert={inert} data-hides-cursor>
          <header className={base.sheetTitle}>
            {shown.player ? <PlayerToken player={shown.player} size={24} /> : <TopicIcon topic={shown.topic} size={18} />}
            <span>
              {shown.label}
              {shown.player?.factionName && !shown.player.own && (
                <span className={base.sheetGroup}> · {shown.player.factionName}</span>
              )}
            </span>
            {shown.player && (
              <span className={base.windowTabs} role="tablist" aria-label={`${shown.label} tabs`}>
                {shown.player.canConverse && !shown.player.own && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={playerTab === 'conversation'}
                    className={base.windowTab}
                    onClick={() => setSheet({ key: shown.key, tab: 'conversation' })}
                  >
                    Chat
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={playerTab === 'public' || shown.player.own || !shown.player.canConverse}
                  className={base.windowTab}
                  onClick={() => setSheet({ key: shown.key, tab: 'public' })}
                >
                  Info
                </button>
              </span>
            )}
            <span className={base.sheetActions}>
              <span className={styles.chord} title={`Hold Space and press ${shown.shortcut} to open or close this window`}>
                <Key>Space</Key>
                <Key>{shown.shortcut}</Key>
              </span>
              <button
                type="button"
                className={base.iconButton}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin: close when I click the table' : 'Pin: keep open while I play'}
                title={pinned ? 'Pinned: stays open' : 'Closes when you click the table'}
                onClick={() => setPinned((current) => !current)}
              >
                <PinIcon pinned={pinned} />
              </button>
              <button type="button" className={base.iconButton} aria-label="Close" onClick={() => setSheet(null)}>
                <CloseIcon />
              </button>
            </span>
          </header>
          <DestinationBody
            destination={
              shown.player
                ? {
                    ...shown,
                    content: players?.render(shown.player.seat, playerTab),
                    flush: false,
                  }
                : shown
            }
            className={base.sheetBody}
          />
        </section>
      )}

      <div className={styles.bar} inert={inert} data-hides-cursor>
        <button type="button" className={styles.launcher} onClick={openPalette}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={base.glyph}>
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.5-4.5" />
          </svg>
          Find a control or command
          <Key>Space</Key>
        </button>
        {(players?.tableChat || others.length > 0) && (
          <nav className={styles.chats} aria-label="Chats">
            {players?.tableChat && (
              <button
                type="button"
                className={styles.chat}
                aria-pressed={sheet?.key === 'table-chat'}
                aria-label={`Table chat${players.tableChat.unread ? `, ${players.tableChat.unread} unread` : ''}`}
                data-tip={`Table chat · Space ${shortcutOf('table-chat') ?? ''}`}
                onClick={() => show('table-chat', 'conversation')}
              >
                <span className={clsx(styles.token, styles.planet)}>
                  <TopicIcon topic="planet" size={20} />
                </span>
                {players.tableChat.unread > 0 && <span className={styles.badge}>{players.tableChat.unread}</span>}
              </button>
            )}
            {others.map((player) => {
              const key = `player:${player.seat}`;
              return (
                <button
                  key={player.seat}
                  type="button"
                  className={styles.chat}
                  aria-pressed={sheet?.key === key}
                  aria-label={`${player.name}${player.factionName ? `, ${player.factionName}` : ''}${player.unread ? `, ${player.unread} unread` : ''}`}
                  data-tip={`${player.name}${player.factionName ? ` · ${player.factionName}` : ''} · Space ${shortcutOf(key) ?? ''}`}
                  onClick={() => show(key, player.canConverse ? 'conversation' : 'public')}
                >
                  <PlayerToken player={player} />
                  {player.unread > 0 && <span className={styles.badge}>{player.unread}</span>}
                  {player.attention && <span className={styles.attention} aria-hidden="true" />}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {hints && (
        <div className={styles.hints} role="note" aria-label="Window shortcuts">
          <div className={styles.hintsTitle}>
            Holding <Key>Space</Key>: press a key to open its window
          </div>
          <ul className={styles.hintList}>
            {windows.map((entry) => (
              <li key={entry.key} className={styles.hint} data-open={sheet?.key === entry.key || undefined}>
                <Key>{entry.shortcut}</Key>
                {entry.player ? <PlayerToken player={entry.player} size={18} /> : <TopicIcon topic={entry.topic} size={16} />}
                <span>{entry.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <div className={base.paletteBackdrop} onPointerDown={() => setOpen(false)}>
          <div
            className={base.palette}
            role="dialog"
            aria-label="Find a control"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              className={base.paletteInput}
              placeholder="Hand, battle, a player's name, next phase, camera…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setCursor((current) => Math.min(listed.length - 1, current + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCursor((current) => Math.max(0, current - 1));
                } else if (event.key === 'Enter') {
                  choose(listed[cursor]);
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
                event.stopPropagation();
              }}
            />
            <ul className={base.paletteList} role="listbox">
              {listed.map((entry, index) => {
                const target = windows.find((item) => item.key === entry.key);
                return (
                  <li
                    key={entry.key}
                    role="option"
                    aria-selected={index === cursor}
                    className={base.paletteItem}
                    onPointerEnter={() => setCursor(index)}
                    onClick={() => choose(entry)}
                  >
                    {target?.player ? <PlayerToken player={target.player} size={20} /> : <TopicIcon topic={entry.topic} size={18} />}
                    <span className={base.paletteLabel}>{entry.label}</span>
                    <span className={base.paletteHint}>{entry.hint}</span>
                    {target && (
                      <span className={styles.chord}>
                        <Key>Space</Key>
                        <Key>{target.shortcut}</Key>
                      </span>
                    )}
                  </li>
                );
              })}
              {listed.length === 0 && <li className={base.paletteEmpty}>Nothing matches “{query}”</li>}
            </ul>
            <footer className={base.paletteFooter}>
              <Key>↑</Key>
              <Key>↓</Key> to choose · <Key>Enter</Key> to open · <Key>Esc</Key> to close · hold <Key>Space</Key> with a
              key to skip the palette
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
