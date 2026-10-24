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

type CompassProps = Readonly<{
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
  const listed = spot === 'search' || (spot === 'hub' && query !== '');
  const title = query ? 'Matches' : 'Suggested';
  const tile = (entry: Tile) => (
    <button
      key={entry.spot}
      type="button"
      className={styles.tile}
      data-spot={entry.spot}
      data-selected={spot === entry.spot || undefined}
      data-disabled={entry.disabled || undefined}
      data-refused={spot === entry.spot && refused ? refused % 2 : undefined}
      onPointerEnter={() => onSpot(entry.spot)}
      onClick={() => onConfirm(entry.spot)}
    >
      <span className={styles.tileIcon}>{entry.icon}</span>
      <span className={styles.tileLabel}>{entry.label}</span>
      <span className={styles.tileDetail}>{entry.detail}</span>
      <span className={styles.tileKeys}>{entry.keys}</span>
      {entry.badge ? <span className={bar.badge}>{entry.badge}</span> : null}
    </button>
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
        {tile(tiles.table)}
        {tile(tiles.ally)}
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
      </dialog>
    </div>
  );
}
