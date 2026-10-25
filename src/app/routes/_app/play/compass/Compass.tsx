import { Search } from 'lucide-react';
import { useEffect } from 'react';
import type { RefObject } from 'react';

import bar from './ChatBar.module.css';
import styles from './Compass.module.css';
import type { Spot, TileSpot } from './compassSpots';
import type { Tile } from './compassTiles';
import { Key } from './glyphs';
import type { Suggestion } from './suggestions';

/*
 * The compass over the table: a tile at the end of each arm, the search field at its centre, and the suggestions below.
 * It is a dialog shown in place (`show()`, not the top layer), so the table and the pinned slots keep their stacking
 * under its veil, a press on the veil closes it, and the keys reach it through the window as they always did.
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

/* Opened as soon as it is in the document, so its first paint is the open one. */
function open(dialog: HTMLDialogElement | null) {
  if (dialog && !dialog.open) {
    dialog.show();
  }
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
      onPointerEnter={() => onSpot(tile.spot)}
      onClick={() => onConfirm(tile.spot)}
    >
      <span className={styles.tileIcon}>{tile.icon}</span>
      <span className={styles.tileLabel}>{tile.label}</span>
      <span className={styles.tileDetail}>{tile.detail}</span>
      <span className={styles.tileKeys}>{tile.keys}</span>
      {tile.badge ? <span className={bar.badge}>{tile.badge}</span> : null}
    </button>
  );
}

type SearchHubProps = Readonly<{
  spot: Spot;
  query: string;
  input: RefObject<HTMLInputElement | null>;
  onSpot: (spot: Spot) => void;
  onQuery: (query: string) => void;
  onCursor: (cursor: number) => void;
}>;

/* The search field at the compass's centre; typing starts the matches over from the top. */
function SearchHub({ spot, query, input, onSpot, onQuery, onCursor }: SearchHubProps) {
  return (
    <label className={styles.hub} data-selected={spot === 'hub' || undefined}>
      <Search size={18} aria-hidden="true" />
      <input
        ref={input}
        aria-label="Search controls"
        placeholder="Type to search"
        value={query}
        onFocus={() => spot === 'search' || onSpot('hub')}
        onChange={(event) => {
          onQuery(event.target.value);
          onCursor(0);
          onSpot('hub');
        }}
      />
      <span className={styles.hubHint}>
        <Key>←</Key>
        <Key>→</Key>
        <Key>↑</Key>
        <Key>↓</Key>
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
          onPointerEnter={() => {
            onSpot('search');
            onCursor(index);
          }}
          onClick={() => entry.run()}
          onKeyDown={(event) => event.key === 'Enter' && entry.run()}
        >
          {entry.icon}
          <span className={styles.suggestionLabel}>{entry.label}</span>
          <span className={styles.suggestionHint}>{entry.hint}</span>
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
  useEffect(() => {
    input.current?.focus();
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
    <div className={styles.veil} onPointerDown={onClose}>
      <dialog
        ref={open}
        className={styles.compass}
        aria-label="Controls compass"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {tile(tiles.battle)}
        {tile(tiles.hidden)}
        {tile(tiles.hand)}
        <SearchHub spot={spot} query={query} input={input} onSpot={onSpot} onQuery={onQuery} onCursor={onCursor} />
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
