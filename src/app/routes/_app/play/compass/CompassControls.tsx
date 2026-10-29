import { useContext, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import type { TableView } from '../../../../widgets/tabletop/playView';
import type { TablePanel } from '../GameTable';
import { ChatBar } from './ChatBar';
import { Compass } from './Compass';
import styles from './CompassControls.module.css';
import { CompassEpochContext } from './compassEpoch';
import type { CompassTable } from './compassTable';
import { CompassTableContext } from './compassTable';
import { CompassActiveContext } from './controlsActive';
import { useCompass } from './useCompass';
import { useOpenWindows } from './useOpenWindows';
import { RememberedContext } from './useRemembered';
import { useSlotHeights } from './useSlotHeights';
import { WindowFrames } from './WindowFrames';
import { useTableWindows } from './windows';
import type { TableWindow } from './windows';

/*
 * The table's controls as a compass: Space opens a compass over the table; a window opens in the centre and goes when
 * you click the table, or is pinned into the bottom-left or bottom-right slot. The chats are a bar of tokens beside the
 * Controls button, and the camera dial sits top right under the toolbar.
 */

export type CompassControlsProps = Readonly<{
  /** The table scene, which the controls lie over. */
  scene: ReactNode;
  decoration?: ReactNode;
  /** A stage's layer over the scene, under the header, which keeps to the table's box as the controls do. */
  overlay?: ReactNode;
  header: ReactNode;
  camera: ReactNode;
  /** A board gesture holds the table, and the chrome over it stops taking input. */
  inert: boolean;
  /** The table's panels, grouped, which the compass opens one by one as windows. */
  panels: readonly TablePanel[];
  /** Moves the camera, as the dial does. */
  onView: (view: TableView) => void;
  /** The window an event asks for (a battle, the end of the game, a phase with a panel of its own), once per token. */
  focus?: Readonly<{ key: string; token: string; placement?: 'centre' }> | null;
}>;

/*
 * The scene and the chrome that only shows what it is handed stay mounted across an epoch; only the controls' own state starts afresh,
 * so the tutorial's Reset clears what was open, pinned or resized without building the table's scene again.
 */
export function CompassControls({ scene, decoration, overlay, header, camera, ...controls }: CompassControlsProps) {
  const epoch = useContext(CompassEpochContext);
  const table = useContext(CompassTableContext);
  const recall = table?.recall;
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.root} ref={rootRef} data-compass-controls>
      <div className={styles.scene}>
        <div className={styles.board}>{scene}</div>
      </div>
      {decoration}
      {overlay}
      {header}
      {camera}
      <CompassActiveContext value={!recall}>
        <CompassTableContext value={table ? { ...table, recall: undefined } : null}>
          <div style={{ display: recall ? 'none' : 'contents' }} inert={Boolean(recall)}>
            <Controls key={epoch} rootRef={rootRef} {...controls} />
          </div>
        </CompassTableContext>
      </CompassActiveContext>
      {recall && table && <RecallControls key={recall.id} table={table} onView={controls.onView} />}
    </div>
  );
}

/* A recall keeps its own slots and heights in memory; closing it leaves the normal controller untouched. */
function RecallControls({ table, onView }: Readonly<{ table: CompassTable; onView: CompassControlsProps['onView'] }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const recall = table.recall!;
  const frozen = {
    ...table,
    players: table.players.filter((player) => player.own),
    tableChat: null,
    nextPhase: null,
    token: null,
    bidding: null,
  };
  return (
    <RememberedContext value={false}>
      <CompassTableContext value={frozen}>
        <CompassActiveContext value>
          <div ref={rootRef} className={`${styles.root} ${styles.recallRoot}`} data-recall-controls="true">
            <Controls
              rootRef={rootRef}
              inert={false}
              panels={recall.panels}
              onView={onView}
              focus={{ key: 'recall-history', token: recall.id, placement: 'centre' }}
            />
          </div>
        </CompassActiveContext>
      </CompassTableContext>
    </RememberedContext>
  );
}

/*
 * An event opens its window once per token, answered in the render that brings it, the first render included:
 * the table decides which events are news (windowFocus.ts). The Spice panel lives in the Hand & spice window.
 */
function useFocusedWindow(
  focus: CompassControlsProps['focus'],
  windows: readonly TableWindow[],
  reveal: (key: string) => void,
  active: boolean
) {
  const [followed, setFollowed] = useState<string | null>(null);
  const key = focus?.key === 'spice' ? 'hand' : focus?.key;
  if (active && focus && key && focus.token !== followed && windows.some((entry) => entry.key === key)) {
    setFollowed(focus.token);
    reveal(key);
  }
}

function Controls({
  rootRef,
  inert,
  panels,
  onView,
  focus,
}: Omit<CompassControlsProps, 'scene' | 'overlay' | 'header' | 'camera'> &
  Readonly<{ rootRef: RefObject<HTMLDivElement | null> }>) {
  const table = useContext(CompassTableContext);
  const active = useContext(CompassActiveContext);
  const windows = useTableWindows(panels);
  const [open, setOpen] = useState(false);
  const opened = useOpenWindows(windows, open, active);
  const heights = useSlotHeights(
    rootRef,
    {
      left: opened.slots.left?.key ?? null,
      right: opened.slots.right?.key ?? null,
    },
    active
  );
  useFocusedWindow(focus, windows, focus?.placement === 'centre' ? opened.show : opened.reveal, active);
  const compass = useCompass({
    open: open && active,
    onOpen: setOpen,
    inert: inert || !active,
    windows,
    table,
    onView,
    onShow: opened.show,
  });
  return (
    <>
      <WindowFrames windows={windows} opened={opened} heights={heights} inert={inert} />
      <ChatBar
        inert={inert}
        hasHand={windows.some((entry) => entry.key === 'hand')}
        isOpen={opened.isOpen}
        onOpenCompass={compass.openCompass}
        onShow={compass.show}
      />
      {open && active && <Compass {...compass.props} />}
    </>
  );
}
