import { useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { TableView } from '../../../../widgets/tabletop/playView';
import type { TablePanel } from '../GameTable';
import { ChatBar } from './ChatBar';
import { Compass } from './Compass';
import styles from './CompassControls.module.css';
import { CompassEpochContext } from './compassEpoch';
import { CompassTableContext } from './compassTable';
import { useCompass } from './useCompass';
import { useOpenWindows } from './useOpenWindows';
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
  focus?: Readonly<{ key: string; token: string }> | null;
}>;

export function CompassControls(props: CompassControlsProps) {
  const epoch = useContext(CompassEpochContext);
  return <Controls key={epoch} {...props} />;
}

/*
 * An event opens its window once per token, answered in the render that brings it, the first render included:
 * the table decides which events are news (windowFocus.ts). The Spice panel lives in the Hand & spice window.
 */
function useFocusedWindow(
  focus: CompassControlsProps['focus'],
  windows: readonly TableWindow[],
  reveal: (key: string) => void
) {
  const [followed, setFollowed] = useState<string | null>(null);
  const key = focus?.key === 'spice' ? 'hand' : focus?.key;
  if (focus && key && focus.token !== followed && windows.some((entry) => entry.key === key)) {
    setFollowed(focus.token);
    reveal(key);
  }
}

function Controls({ scene, overlay, header, camera, inert, panels, onView, focus }: CompassControlsProps) {
  const table = useContext(CompassTableContext);
  const windows = useTableWindows(panels);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const opened = useOpenWindows(windows, open);
  const heights = useSlotHeights(rootRef, {
    left: opened.slots.left?.key ?? null,
    right: opened.slots.right?.key ?? null,
  });
  useFocusedWindow(focus, windows, opened.reveal);
  const compass = useCompass({ open, onOpen: setOpen, inert, windows, table, onView, onShow: opened.show });
  return (
    <div className={styles.root} ref={rootRef} data-compass-controls>
      <div className={styles.scene}>
        <div className={styles.board}>{scene}</div>
      </div>
      {overlay}
      {header}
      {camera}
      <WindowFrames windows={windows} opened={opened} heights={heights} inert={inert} />
      <ChatBar inert={inert} isOpen={opened.isOpen} onOpenCompass={compass.openCompass} onShow={compass.show} />
      {open && <Compass {...compass.props} />}
    </div>
  );
}
