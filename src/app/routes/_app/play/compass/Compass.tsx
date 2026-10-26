import { Kbd } from '@ui/content/Kbd';
import { Search } from 'lucide-react';
import { useEffect, useEffectEvent, useRef } from 'react';
import type { PointerEvent, RefObject } from 'react';

import bar from './ChatBar.module.css';
import styles from './Compass.module.css';
import type { Spot, TileSpot } from './compassSpots';
import type { Tile } from './compassTiles';
import type { Suggestion } from './suggestions';

/*
 * The compass over the table: a tile at the end of each arm, the search field at its centre, and the suggestions below.
 * It is a dialog shown in place (`show()`, not the top layer), so the table and the pinned slots keep their stacking
 * under its veil, a press outside it closes it, and the keys reach it through the window as they always did.
 */

export type CompassProps = Readonly<{
  tiles: Record<TileSpot, Tile>;
  suggestions: readonly Suggestion[];
  spot: Spot;
  query: string;
  cursor: number;
  /** Bumps when a tile with nothing behind it is confirmed, so it shakes. */
  refused: number;
  input: RefObject<HTMLInputElement | null>;
  onSpot: (spot: Spot) => void;
  onQuery: (query: string) => void;
  onCursor: (cursor: number) => void;
  onConfirm: (spot: TileSpot) => void;
  onClose: () => void;
}>;

/*
 * The click that ends a dismissing press is swallowed too. It follows the press's pointerup in the same task, so the
 * guard is let go just after that, and a press that ends without a click never eats a later one.
 */
function swallowClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const release = () => setTimeout(() => window.removeEventListener('click', swallow, true));
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.addEventListener('pointerup', release, { capture: true, once: true });
  window.addEventListener('pointercancel', release, { capture: true, once: true });
}

/*
 * A press anywhere but on the compass's own tiles, search and suggestions dismisses it: on the veil, in the gaps between
 * the tiles, or on the chrome around the table. The press goes no further, nor does the click it ends in, so neither the
 * table under the veil nor a control or link beside it acts on it.
 */
function useDismissOnPressOutside(compass: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const press = (event: globalThis.PointerEvent) => {
      const dialog = compass.current;
      const target = event.target;
      const inside = dialog && target instanceof Node && dialog.contains(target) && target !== dialog;
      if (!inside) {
        event.stopPropagation();
        swallowClick();
        close();
      }
    };
    window.addEventListener('pointerdown', press, true);
    return () => window.removeEventListener('pointerdown', press, true);
  }, [compass]);
}

/* Opened as soon as it is in the document, so its first paint is the open one. */
function open(dialog: HTMLDialogElement | null) {
  if (dialog && !dialog.open) {
    dialog.show();
  }
}

/*
 * Only a pointer that moved points at a tile or a suggestion. A chosen tile grows and the list changes as you type, so
 * either can slide under a pointer at rest, which the browser tells as the pointer entering; that must not undo the keys' choice.
 */
function moved(event: PointerEvent) {
  return event.movementX !== 0 || event.movementY !== 0;
}

type CompassTileProps = Readonly<{
  tile: Tile;
  selected: boolean;
  /** The refusal count while this tile is the one pointed at, else nothing. */
  refused: number;
  onSpot: (spot: TileSpot) => void;
  onConfirm: (spot: TileSpot) => void;
}>;

function CompassTile({ tile, selected, refused, onSpot, onConfirm }: CompassTileProps) {
  return (
    <button
      type="button"
      className={styles.tile}
      data-spot={tile.spot}
      data-selected={selected || undefined}
      data-disabled={tile.disabled || undefined}
      data-refused={selected && refused ? refused % 2 : undefined}
      onPointerMove={(event) => selected || !moved(event) || onSpot(tile.spot)}
      onClick={() => onConfirm(tile.spot)}
    >
      <span className={styles.tileIcon}>{tile.icon}</span>
      <span className={styles.tileLabel}>{tile.label}</span>
      <span className={styles.tileDetail}>{tile.detail}</span>
      <span className={styles.tileKeys}>{tile.keys}</span>
      <span className={styles.tileShortcut}>
        <Kbd>{tile.shortcut}</Kbd>
      </span>
      {tile.badge ? <span className={bar.badge}>{tile.badge}</span> : null}
    </button>
  );
}

type SearchHubProps = Readonly<{
  spot: Spot;
  query: string;
  input: RefObject<HTMLInputElement | null>;
  /** True while the compass hands the caret back itself, which is no choice of the hub. */
  steering: RefObject<boolean>;
  onSpot: (spot: Spot) => void;
  onQuery: (query: string) => void;
  onCursor: (cursor: number) => void;
}>;

/* The search field at the compass's centre; typing starts the matches over from the top. */
function SearchHub({ spot, query, input, steering, onSpot, onQuery, onCursor }: SearchHubProps) {
  return (
    <label className={styles.hub} data-selected={spot === 'hub' || undefined}>
      <Search size={18} aria-hidden="true" />
      <input
        ref={input}
        aria-label="Search controls"
        placeholder="Type to search"
        value={query}
        onFocus={() => steering.current || spot === 'search' || onSpot('hub')}
        onChange={(event) => {
          onQuery(event.target.value);
          onCursor(0);
          onSpot('hub');
        }}
      />
      <span className={styles.hubHint}>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className={styles.hubOr}>or</span>
        <Kbd>W</Kbd>
        <Kbd>A</Kbd>
        <Kbd>S</Kbd>
        <Kbd>D</Kbd>
      </span>
    </label>
  );
}

type SuggestionListProps = Readonly<{
  suggestions: readonly Suggestion[];
  spot: Spot;
  query: string;
  cursor: number;
  onSpot: (spot: Spot) => void;
  onCursor: (cursor: number) => void;
}>;

/* The suggestions below the hub: the matches for what was typed, or what the table suggests while nothing was. */
function SuggestionList({ suggestions, spot, query, cursor, onSpot, onCursor }: SuggestionListProps) {
  const listed = spot === 'search' || (spot === 'hub' && query !== '');
  const title = query ? 'Matches' : 'Suggested';
  return (
    <div
      className={styles.suggestions}
      data-selected={spot === 'search' || undefined}
      role="listbox"
      aria-label={title}
    >
      <div className={styles.suggestionsTitle}>{title}</div>
      {suggestions.map((entry, index) => (
        <div
          key={entry.key}
          role="option"
          tabIndex={-1}
          aria-selected={listed && index === cursor}
          className={styles.suggestion}
          onPointerMove={(event) => {
            if ((spot === 'search' && index === cursor) || !moved(event)) {
              return;
            }
            onSpot('search');
            onCursor(index);
          }}
          onClick={() => entry.run()}
          onKeyDown={(event) => event.key === 'Enter' && entry.run()}
        >
          {entry.icon}
          <span className={styles.suggestionLabel}>{entry.label}</span>
          <span className={styles.suggestionHint}>{entry.hint}</span>
          {entry.shortcut && (
            <span className={styles.suggestionShortcut}>
              <Kbd>{entry.shortcut}</Kbd>
            </span>
          )}
        </div>
      ))}
      {suggestions.length === 0 && <div className={styles.suggestionsTitle}>Nothing matches “{query}”</div>}
    </div>
  );
}

export function Compass({
  tiles,
  suggestions,
  spot,
  query,
  cursor,
  refused,
  input,
  onSpot,
  onQuery,
  onCursor,
  onConfirm,
  onClose,
}: CompassProps) {
  /* The search field keeps the caret while the arrows steer, so typing never needs a click first. */
  const steering = useRef(false);
  const compass = useRef<HTMLDialogElement>(null);
  useDismissOnPressOutside(compass, onClose);
  useEffect(() => {
    steering.current = true;
    input.current?.focus();
    steering.current = false;
  }, [input, spot]);
  const tile = (entry: Tile) => (
    <CompassTile
      key={entry.spot}
      tile={entry}
      selected={spot === entry.spot}
      refused={refused}
      onSpot={onSpot}
      onConfirm={onConfirm}
    />
  );
  return (
    <div className={styles.veil}>
      <dialog
        ref={(dialog) => {
          compass.current = dialog;
          open(dialog);
        }}
        className={styles.compass}
        aria-label="Controls compass"
      >
        {tile(tiles.battle)}
        {tile(tiles.hidden)}
        {tile(tiles.hand)}
        <SearchHub
          spot={spot}
          query={query}
          input={input}
          steering={steering}
          onSpot={onSpot}
          onQuery={onQuery}
          onCursor={onCursor}
        />
        {tile(tiles.table)}
        {tile(tiles.ally)}
        <SuggestionList
          suggestions={suggestions}
          spot={spot}
          query={query}
          cursor={cursor}
          onSpot={onSpot}
          onCursor={onCursor}
        />
      </dialog>
    </div>
  );
}
