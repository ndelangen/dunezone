import { PanelLeft, PanelRight, PinOff } from 'lucide-react';
import { useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { TableView } from '../../../../widgets/tabletop/playView';
import type { PanelTab } from '../GameTable';
import { HeldSlot } from '../HeldContent';
import type { HeldNode } from '../HeldContent';
import { TableControlsEpochContext } from '../tableControls';
import { ChatBar } from './ChatBar';
import { Compass } from './Compass';
import styles from './CompassControls.module.css';
import type { Spot, TileSpot } from './compassSpots';
import { CompassTableContext } from './compassTable';
import { tilesOf } from './compassTiles';
import { CloseIcon } from './glyphs';
import { pulseOf } from './pulse';
import { SIDES } from './slotLimits';
import type { Side } from './slotLimits';
import { candidatesOf, rankSuggestions } from './suggestions';
import { useCompassKeys } from './useCompassKeys';
import { useOpenWindows } from './useOpenWindows';
import { CAMERA_TOP, useSlotHeights } from './useSlotHeights';
import { WindowFrame } from './WindowFrame';
import { useTableWindows } from './windows';

/*
 * The table's controls as a compass (Norbert, 2026-10-24), picked from seven explorations (branch claude/controls-layout-prototype-stages):
 * Space opens a compass over the table; a window opens in the centre and goes when you click the table, or is pinned into
 * the bottom-left or bottom-right slot. The chats are a bar of tokens, and the camera dial sits top right under the toolbar.
 */

export type CompassControlsProps = Readonly<{
  /** The held table scene, which stays mounted while the layout around it changes. */
  scene: HeldNode;
  header: ReactNode;
  camera: ReactNode;
  /** A board gesture holds the table, and the chrome over it stops taking input. */
  inert: boolean;
  /** The dock's tabs, which the compass opens one by one. */
  tabs: readonly PanelTab[];
  /** Moves the camera, as the dial does. */
  onView: (view: TableView) => void;
}>;

export function CompassControls(props: CompassControlsProps) {
  /* The table's own pieces live in held nodes, so starting the controls afresh moves them back in without remounting them. */
  const epoch = useContext(TableControlsEpochContext);
  return <Controls key={epoch} {...props} />;
}

function Controls({ scene, header, camera, inert, tabs, onView }: CompassControlsProps) {
  const table = useContext(CompassTableContext);
  const windows = useTableWindows(tabs);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot>('hub');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [refused, setRefused] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opened = useOpenWindows(windows, open);
  const heights = useSlotHeights(rootRef, {
    left: opened.slots.left?.key ?? null,
    right: opened.slots.right?.key ?? null,
  });
  const byKey = (key: string) => windows.find((entry) => entry.key === key);

  const openCompass = () => {
    setOpen(true);
    setSpot('hub');
    setQuery('');
    setCursor(0);
  };
  /* The hold is let go by the keys alone: Space's keyup ends it, so closing never needs to touch it. */
  const close = () => setOpen(false);
  const show = (key: string, tab?: 'public' | 'conversation') => {
    close();
    opened.show(key, tab);
  };
  const tiles = tilesOf(windows, table);
  const suggestions = rankSuggestions(
    candidatesOf(windows, { open: show, nextPhase: table?.nextPhase, view: onView, close }),
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
  useCompassKeys({
    open,
    inert,
    spot,
    query,
    cursor,
    suggestions: suggestions.length,
    input: inputRef,
    onOpen: openCompass,
    onClose: close,
    onSpot: setSpot,
    onCursor: setCursor,
    onConfirm: confirm,
  });

  /* The pin buttons say what they would replace. */
  const pinTitle = (side: Side) => {
    const replaced = opened.slots[side];
    return replaced ? `Pin bottom ${side}, replacing ${byKey(replaced.key)?.label}` : `Pin bottom ${side}`;
  };
  const centre = opened.centre && byKey(opened.centre.key);
  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.scene}>
        <HeldSlot node={scene} />
      </div>
      {header}
      <div
        className="seated-column-camera"
        inert={inert}
        style={{ top: `var(${CAMERA_TOP}, calc(var(--play-header-height) + 0.5rem))`, bottom: 'auto' }}
      >
        {camera}
      </div>

      {/*
        One list of windows keyed by what they show, so pinning moves a window rather than remounting it,
        and whatever it holds (a chat draft, a scroll position) comes along.
      */}
      {[
        centre && opened.centre && (
          <WindowFrame
            key={centre.key}
            entry={centre}
            tab={opened.centre.tab}
            where="centre"
            inert={inert}
            flash={pulseOf(opened.flash, 'centre')}
            onTab={(tab) => opened.showTab('centre', centre.key, tab)}
            actions={
              <>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Pin to the bottom left"
                  title={pinTitle('left')}
                  onClick={() => opened.pin('left')}
                >
                  <PanelLeft size={16} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Pin to the bottom right"
                  title={pinTitle('right')}
                  onClick={() => opened.pin('right')}
                >
                  <PanelRight size={16} />
                </button>
                <button type="button" className={styles.iconButton} aria-label="Close" onClick={opened.close}>
                  <CloseIcon />
                </button>
              </>
            }
          />
        ),
        ...SIDES.map((side) => {
          const slot = opened.slots[side];
          const entry = slot && byKey(slot.key);
          return (
            entry &&
            slot && (
              <WindowFrame
                key={entry.key}
                entry={entry}
                tab={slot.tab}
                where={side}
                inert={inert}
                flash={pulseOf(opened.flash, side)}
                bounce={pulseOf(heights.bounce, side)}
                style={heights.styleOf(side)}
                resize={{
                  onPointerDown: heights.resize(side),
                  onNudge: (element, direction) => heights.nudge(side, element, direction),
                  onReset: () => heights.reset(side),
                }}
                onTab={(tab) => opened.showTab(side, entry.key, tab)}
                actions={
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Unpin"
                    title="Unpin: it disappears"
                    onClick={() => opened.unpin(side)}
                  >
                    <PinOff size={16} />
                  </button>
                }
              />
            )
          );
        }),
      ]}

      <ChatBar inert={inert} isOpen={opened.isOpen} onOpenCompass={openCompass} onShow={show} />

      {open && (
        <Compass
          tiles={tiles}
          suggestions={suggestions}
          spot={spot}
          query={query}
          cursor={cursor}
          refused={refused}
          input={inputRef}
          onSpot={setSpot}
          onQuery={setQuery}
          onCursor={setCursor}
          onConfirm={(at: TileSpot) => confirm(at)}
          onClose={close}
        />
      )}
    </div>
  );
}
