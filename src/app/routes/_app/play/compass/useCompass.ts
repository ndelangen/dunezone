import { useRef, useState } from 'react';

import type { TableView } from '../../../../widgets/tabletop/playView';
import type { CompassProps } from './Compass';
import type { Spot } from './compassSpots';
import type { CompassTable } from './compassTable';
import { tilesOf } from './compassTiles';
import { commandsOf, SHORTCUTS, useShortcutKeys } from './shortcuts';
import type { Shortcut } from './shortcuts';
import { candidatesOf, rankSuggestions } from './suggestions';
import { useCompassKeys } from './useCompassKeys';
import type { PlayerTab, TableWindow } from './windows';

/*
 * The compass itself: where it points, what was typed into its search, which suggestion the cursor is on, and what
 * confirming opens. Its keys are wired here too, so the controls around it only open it and draw it.
 */

type CompassInputs = Readonly<{
  open: boolean;
  onOpen: (open: boolean) => void;
  /** A board gesture holds the table, and Space stays with it. */
  inert: boolean;
  windows: readonly TableWindow[];
  table: CompassTable | null;
  onView: (view: TableView) => void;
  /** Opens a window over the table. */
  onShow: (key: string, tab?: PlayerTab) => void;
}>;

export function useCompass({ open, onOpen, inert, windows, table, onView, onShow }: CompassInputs) {
  const [spot, setSpot] = useState<Spot>('hub');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [refused, setRefused] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const openCompass = () => {
    onOpen(true);
    setSpot('hub');
    setQuery('');
    setCursor(0);
  };
  /* The hold is let go by the keys alone: Space's keyup ends it, so closing never needs to touch it. */
  const close = () => onOpen(false);
  const show = (key: string, tab?: PlayerTab) => {
    close();
    onShow(key, tab);
  };
  const tiles = tilesOf(windows, table);
  const commands = commandsOf(table);
  /* A window an arm opens shows the arm's letter in the search too. */
  const shortcuts = Object.fromEntries(
    Object.values(tiles).flatMap((tile) => (tile.window ? [[tile.window.key, SHORTCUTS[tile.spot]]] : []))
  );
  const suggestions = rankSuggestions(
    candidatesOf(windows, {
      open: show,
      nextPhase: table?.nextPhase,
      token: table?.token,
      commands,
      shortcuts,
      view: onView,
      close,
    }),
    query
  );
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
  /* A letter opens its arm's window, as confirming the tile would, or runs its command; one the table lacks is left to the table. */
  const shortcut = (pressed: Shortcut) => {
    if (pressed in tiles) {
      const tile = tiles[pressed as keyof typeof tiles];
      if (tile.window && !tile.disabled) {
        onShow(tile.window.key, tile.tab);
        return true;
      }
      return false;
    }
    const command = commands[pressed as keyof typeof commands];
    command?.run();
    return command !== null;
  };
  useShortcutKeys(!open && !inert, shortcut);
  useCompassKeys({
    open,
    inert,
    spot,
    query,
    cursor,
    suggestions: suggestions.length,
    input,
    onOpen: openCompass,
    onClose: close,
    onSpot: setSpot,
    onCursor: setCursor,
    onConfirm: confirm,
  });

  const props: CompassProps = {
    tiles,
    suggestions,
    spot,
    query,
    cursor,
    refused,
    input,
    onSpot: setSpot,
    onQuery: setQuery,
    onCursor: setCursor,
    onConfirm: confirm,
    onClose: close,
  };
  return { openCompass, show, props };
}
