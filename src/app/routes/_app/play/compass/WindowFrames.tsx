import { PanelLeft, PanelRight, PinOff } from 'lucide-react';

import styles from './CompassControls.module.css';
import { CloseIcon } from './glyphs';
import { pulseOf } from './pulse';
import { SIDES } from './slotLimits';
import type { Side } from './slotLimits';
import { PIN_KEYS } from './useOpenWindows';
import type { OpenWindows } from './useOpenWindows';
import type { SlotHeights } from './useSlotHeights';
import { WindowFrame } from './WindowFrame';
import { FACTION_INFO } from './windows';
import type { TableWindow } from './windows';

/*
 * The open windows over the table: one in the centre, with buttons to pin or close it, and one in each pinned slot,
 * with a resize edge and a button to unpin it.
 */

type WindowFramesProps = Readonly<{
  windows: readonly TableWindow[];
  opened: OpenWindows;
  heights: SlotHeights;
  inert: boolean;
}>;

type Found = (key: string) => TableWindow | undefined;

/**
 * One flat list of frames keyed by what they show.
 * Pinning then moves a window rather than remounting it, and whatever it holds (a chat draft, a scroll position) comes along.
 */
export function WindowFrames({ windows, opened, heights, inert }: WindowFramesProps) {
  const byKey: Found = (key) => windows.find((entry) => entry.key === key);
  return [
    centreFrame({ byKey, opened, inert }),
    ...SIDES.map((side) => slotFrame({ side, byKey, opened, heights, inert })),
  ];
}

type CentreFrame = Readonly<{ byKey: Found; opened: OpenWindows; inert: boolean }>;

function centreFrame({ byKey, opened, inert }: CentreFrame) {
  const centre = opened.centre && byKey(opened.centre.key);
  if (!centre || !opened.centre) {
    return null;
  }
  return (
    <WindowFrame
      key={centre.key}
      entry={centre}
      seat={opened.centre.seat}
      where="centre"
      inert={inert}
      flash={pulseOf(opened.flash, 'centre')}
      onSeat={(seat) => opened.showSeat('centre', centre.key, seat)}
      onFaction={(seat) => opened.reveal(FACTION_INFO, seat)}
      actions={<CentreActions byKey={byKey} opened={opened} />}
    />
  );
}

/* The pin buttons say what they would replace. */
function pinTitle(side: Side, byKey: Found, opened: OpenWindows) {
  const replaced = opened.slots[side];
  const pin = replaced ? `Pin bottom ${side}, replacing ${byKey(replaced.key)?.label}` : `Pin bottom ${side}`;
  return `${pin} (${PIN_KEYS[side]})`;
}

function CentreActions({ byKey, opened }: Readonly<{ byKey: Found; opened: OpenWindows }>) {
  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Pin to the bottom left"
        title={pinTitle('left', byKey, opened)}
        onClick={() => opened.pin('left')}
      >
        <PanelLeft size={16} />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Pin to the bottom right"
        title={pinTitle('right', byKey, opened)}
        onClick={() => opened.pin('right')}
      >
        <PanelRight size={16} />
      </button>
      <button type="button" className={styles.iconButton} aria-label="Close" onClick={opened.close}>
        <CloseIcon />
      </button>
    </>
  );
}

type SlotFrame = Readonly<{
  side: Side;
  byKey: Found;
  opened: OpenWindows;
  heights: SlotHeights;
  inert: boolean;
}>;

function slotFrame({ side, byKey, opened, heights, inert }: SlotFrame) {
  const slot = opened.slots[side];
  const entry = slot && byKey(slot.key);
  if (!entry || !slot) {
    return null;
  }
  return (
    <WindowFrame
      key={entry.key}
      entry={entry}
      seat={slot.seat}
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
      onSeat={(seat) => opened.showSeat(side, entry.key, seat)}
      onFaction={(seat) => opened.reveal(FACTION_INFO, seat)}
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
  );
}
