import { TopicIcon } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { EyeOff, Hand, Handshake, MessagesSquare, Search, Swords } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Camera, CloseIcon, DestinationBody, Key, PinIcon, pressControl, Scene, useRemembered, useTablePress } from './ControlsExperiments';
import type { ExperimentProps } from './ControlsExperiments';
import base from './ControlsExperiments.module.css';
import { ExperimentPlayersContext } from './experiment';
import type { ExperimentPlayer } from './experiment';
import { PlayerToken, useWindows } from './PaletteStage2';
import type { PaletteWindow, PlayerTab } from './PaletteStage2';
import bar from './PaletteStage2.module.css';
import styles from './PaletteStage3.module.css';

/*
 * The command palette's third stage (Norbert, 2026-10-24): a visual shorthand first, typing second.
 * Space opens a compass: ← Hand, ← ← Hidden zone, → Table chat, → → Ally chat, ↑ Battle plan, ↓ search with suggestions.
 * Hold Space, steer with the arrows and let go to open; or tap Space, steer, and press Enter or Space.
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

type Suggestion = Readonly<{ key: string; label: string; hint: string; icon: ReactNode; run: () => void }>;

export function PaletteStage3(props: ExperimentProps) {
  const { nodes, header, camera, inert } = props;
  const players = useContext(ExperimentPlayersContext);
  const windows = useWindows(props);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot>('hub');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [refused, setRefused] = useState(0);
  const [sheet, setSheet] = useState<{ key: string; tab: PlayerTab } | null>(null);
  const [pinned, setPinned] = useRemembered('palette-3-pinned', false);
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
    const target = byKey(key);
    const chatFirst = target?.player && !target.player.own && target.player.canConverse;
    setSheet((current) =>
      current?.key === key && (tab === undefined || current.tab === tab)
        ? null
        : { key, tab: tab ?? (chatFirst ? 'conversation' : 'public') }
    );
    setOpen(false);
  };
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
    if (at === 'hub') {
      close();
      return;
    }
    if (at === 'search') {
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
      if (inSearch) {
        /* In the search field the arrows walk the suggestions; up from the first goes back to the compass. */
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCursor((current) => Math.min(suggestions.length - 1, current + 1));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (cursor === 0) {
            setSpot('hub');
            inputRef.current?.blur();
          } else {
            setCursor(cursor - 1);
          }
        } else if (event.key === 'Enter') {
          event.preventDefault();
          suggestions[cursor]?.run();
        } else if (event.key === 'Escape') {
          close();
        }
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (arrow) {
        hold.current.steered = true;
        setSpot((current) => MOVES[current][arrow]);
      } else if (event.key === 'Enter' || (event.code === 'Space' && !event.repeat && !hold.current.down)) {
        confirm();
      } else if (event.key === 'Escape') {
        close();
      } else if (event.key.length === 1) {
        const target = windows.find((entry) => entry.shortcut === event.key.toUpperCase());
        if (target) {
          show(target.key);
        }
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
    if (open && spot === 'search') {
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
  useTablePress(() => setSheet(null), sheet !== null && !pinned && !open);

  const shown = sheet ? byKey(sheet.key) : undefined;
  const playerTab = sheet?.tab ?? 'public';
  const others = players?.players.filter((player) => !player.own) ?? [];
  const pointed = spot === 'hub' || spot === 'search' ? null : tiles[spot];

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
    <div className={base.root}>
      <Scene node={nodes.scene} />
      {header}
      <Camera camera={camera} inert={inert} />

      {shown && (
        <section className={clsx(base.sheet, bar.sheet)} aria-label={shown.label} inert={inert} data-hides-cursor>
          <header className={base.sheetTitle}>
            {shown.player ? <PlayerToken player={shown.player} size={24} /> : <TopicIcon topic={shown.topic} size={18} />}
            <span>
              {shown.label}
              {shown.player?.factionName && !shown.player.own && (
                <span className={base.sheetGroup}> · {shown.player.factionName}</span>
              )}
            </span>
            {shown.player && <PlayerTabs player={shown.player} tab={playerTab} onTab={(tab) => setSheet({ key: shown.key, tab })} />}
            <span className={base.sheetActions}>
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
              shown.player ? { ...shown, content: players?.render(shown.player.seat, playerTab), flush: false } : shown
            }
            className={base.sheetBody}
          />
        </section>
      )}

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
                aria-pressed={sheet?.key === 'table-chat'}
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
                open={sheet?.key === `player:${player.seat}`}
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
            <div className={styles.hub} data-selected={spot === 'hub' || undefined}>
              <span className={styles.hubDial} data-pointing={spot} aria-hidden="true" />
              <span className={styles.hubLabel}>{pointed ? pointed.label : spot === 'search' ? 'Search' : 'Where to?'}</span>
              <span className={styles.hubHint}>
                {pointed || spot === 'search' ? (
                  <>
                    <Key>Enter</Key> or let go of <Key>Space</Key>
                  </>
                ) : (
                  <>
                    <Key>←</Key>
                    <Key>→</Key>
                    <Key>↑</Key>
                    <Key>↓</Key>
                  </>
                )}
              </span>
            </div>
            {tile(tiles.table)}
            {tile(tiles.ally)}
            <div
              className={styles.search}
              data-selected={spot === 'search' || undefined}
              onPointerEnter={() => setSpot('search')}
            >
              <label className={styles.searchField}>
                <Search size={18} aria-hidden="true" />
                <input
                  ref={inputRef}
                  placeholder="Search everything else… a player, a tab, a command"
                  value={query}
                  onFocus={() => setSpot('search')}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setCursor(0);
                  }}
                />
                <span className={styles.tileKeys}>↓</span>
              </label>
              <ul className={styles.suggestions} role="listbox" aria-label={query ? 'Matches' : 'Suggested'}>
                {!query && <li className={styles.suggestionsTitle}>Suggested</li>}
                {suggestions.map((entry, index) => (
                  <li
                    key={entry.key}
                    role="option"
                    aria-selected={spot === 'search' && index === cursor}
                    className={styles.suggestion}
                    onPointerEnter={() => setCursor(index)}
                    onClick={() => entry.run()}
                  >
                    {entry.icon}
                    <span className={styles.suggestionLabel}>{entry.label}</span>
                    <span className={styles.suggestionHint}>{entry.hint}</span>
                    {byKey(entry.key)?.shortcut && <Key>{byKey(entry.key)?.shortcut}</Key>}
                  </li>
                ))}
                {suggestions.length === 0 && <li className={styles.suggestionsTitle}>Nothing matches “{query}”</li>}
              </ul>
            </div>
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
