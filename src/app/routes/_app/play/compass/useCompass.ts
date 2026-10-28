import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { TOP_VIEW } from '../../../../widgets/tabletop/playView';
import type { TableView } from '../../../../widgets/tabletop/playView';
import type { CompassProps } from './Compass';
import type { Spot } from './compassSpots';
import type { CompassTable } from './compassTable';
import { tilesOf } from './compassTiles';
import { commandsOf, SHORTCUTS, useShortcutKeys } from './shortcuts';
import type { Shortcut } from './shortcuts';
import { candidatesOf, rankSuggestions } from './suggestions';
import { useCompassKeys } from './useCompassKeys';
import type { TableWindow } from './windows';

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
  onShow: (key: string, seat?: string) => void;
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
  const show = (key: string, seat?: string) => {
    close();
    onShow(key, seat);
  };
  const tiles = tilesOf(windows, table);
  const commands = commandsOf(table);
  const chooseSpot: Dispatch<SetStateAction<Spot>> = (next) =>
    setSpot((current) => {
      const target = typeof next === 'function' ? next(current) : next;
      return target === 'ally' && tiles.ally.hidden ? 'table' : target;
    });
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
      frozen: Boolean(table?.recall),
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
      const suggestion = suggestions[cursor];
      if (suggestion && !suggestion.disabled) {
        suggestion.run();
      }
      return;
    }
    const tile = tiles[at];
    if (tile.disabled || !tile.window) {
      setRefused((count) => count + 1);
      return;
    }
    show(tile.window.key);
  };
  /* A letter opens its arm's window, as confirming the tile would, or runs its command; one the table lacks is left to the table. */
  const shortcut = (pressed: Shortcut) => {
    if (pressed in tiles) {
      const tile = tiles[pressed as keyof typeof tiles];
      if (tile.window && !tile.disabled) {
        onShow(tile.window.key);
        return true;
      }
      return false;
    }
    const command = commands[pressed as keyof typeof commands];
    if (command) {
      command.run();
      return true;
    }
    /* U is the top-down camera's key, and back, whenever it has no token to flip up. */
    if (pressed === 'faceUp') {
      onView(TOP_VIEW.id);
      return true;
    }
    return false;
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
    onSpot: chooseSpot,
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
    onSpot: chooseSpot,
    onQuery: setQuery,
    onCursor: setCursor,
    onConfirm: confirm,
    onClose: close,
  };
  return { openCompass, show, props };
}
