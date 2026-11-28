import { Tooltip } from '@mantine/core';
import { PanelLeft, PanelRight, PinOff } from 'lucide-react';

import styles from './CompassControls.module.css';
import { CloseIcon } from './glyphs';
import { PanelFrame } from './PanelFrame';
import { FACTION_INFO } from './panels';
import type { CompassPanel } from './panels';
import { pulseOf } from './pulse';
import { SIDES } from './slotLimits';
import type { Side } from './slotLimits';
import { PIN_KEYS } from './useOpenPanels';
import type { OpenPanels } from './useOpenPanels';
import type { SlotHeights } from './useSlotHeights';

/*
 * The open panels over the table: one in the centre, with buttons to pin or close it, and one in each pinned slot,
 * with a resize edge and a button to unpin it.
 */

type PanelFramesProps = Readonly<{
  openable: readonly CompassPanel[];
  opened: OpenPanels;
  heights: SlotHeights;
  inert: boolean;
}>;

type Found = (key: string) => CompassPanel | undefined;

/**
 * One flat list of frames keyed by what they show.
 * Pinning then moves a panel rather than remounting it, and whatever it holds (a chat draft, a scroll position) comes along.
 */
export function PanelFrames({ openable, opened, heights, inert }: PanelFramesProps) {
  const byKey: Found = (key) => openable.find((entry) => entry.key === key);
  const places = [
    { where: 'centre' as const, open: opened.centre },
    ...SIDES.map((side) => ({ where: side, open: opened.slots[side] })),
  ];
  /* The pin buttons say what they would replace. */
  const pinLeft = pinTitle('left', byKey(opened.slots.left?.key ?? '')?.label);
  const pinRight = pinTitle('right', byKey(opened.slots.right?.key ?? '')?.label);
  return places.map(({ where, open }) => {
    const entry = open && byKey(open.key);
    return entry && open ? (
      <PlacedFrame
        key={entry.key}
        entry={entry}
        seat={open.seat}
        where={where}
        opened={opened}
        heights={heights}
        inert={inert}
        pinLeft={pinLeft}
        pinRight={pinRight}
      />
    ) : null;
  });
}

function pinTitle(side: Side, replaced: string | undefined) {
  const pin = replaced ? `Pin bottom ${side}, replacing ${replaced}` : `Pin bottom ${side}`;
  return `${pin} (${PIN_KEYS[side]})`;
}

type PlacedFrameProps = Readonly<{
  entry: CompassPanel;
  seat: string | undefined;
  where: 'centre' | Side;
  opened: OpenPanels;
  heights: SlotHeights;
  inert: boolean;
  pinLeft: string;
  pinRight: string;
}>;

/*
 * One frame, in the centre or in a slot.
 * Its content is new with every table update, but its buttons and handlers are made here from what stays, so the frame's title bar and buttons skip the updates that leave them alone.
 * The centre and the slots share this one component, so a panel pinned or unpinned moves rather than remounts.
 */
function PlacedFrame({ entry, seat, where, opened, heights, inert, pinLeft, pinRight }: PlacedFrameProps) {
  const onRaise = () => opened.raise(where);
  const onSeat = (shown: string) => opened.showSeat(where, entry.key, shown);
  const onFaction = (shown: string) => opened.reveal(FACTION_INFO, shown);
  if (where === 'centre') {
    return (
      <PanelFrame
        entry={entry}
        seat={seat}
        where="centre"
        inert={inert}
        flash={pulseOf(opened.flash, 'centre')}
        front={opened.front === 'centre'}
        onRaise={onRaise}
        onSeat={onSeat}
        onFaction={onFaction}
        actions={<CentreActions opened={opened} pinLeft={pinLeft} pinRight={pinRight} />}
      />
    );
  }
  return (
    <PanelFrame
      entry={entry}
      seat={seat}
      where={where}
      inert={inert}
      flash={pulseOf(opened.flash, where)}
      bounce={pulseOf(heights.bounce, where)}
      style={heights.styleOf(where)}
      front={opened.front === where}
      onRaise={onRaise}
      resize={{
        onPointerDown: heights.resize(where),
        onNudge: (element, direction) => heights.nudge(where, element, direction),
        onReset: () => heights.reset(where),
      }}
      onSeat={onSeat}
      onFaction={onFaction}
      actions={
        <Tooltip label="Unpin: it disappears">
          <button type="button" className={styles.iconButton} aria-label="Unpin" onClick={() => opened.unpin(where)}>
            <PinOff size={16} />
          </button>
        </Tooltip>
      }
    />
  );
}

function CentreActions({
  opened,
  pinLeft,
  pinRight,
}: Readonly<{ opened: OpenPanels; pinLeft: string; pinRight: string }>) {
  return (
    <>
      <Tooltip label={pinLeft}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Pin to the bottom left"
          onClick={() => opened.pin('left')}
        >
          <PanelLeft size={16} />
        </button>
      </Tooltip>
      <Tooltip label={pinRight}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Pin to the bottom right"
          onClick={() => opened.pin('right')}
        >
          <PanelRight size={16} />
        </button>
      </Tooltip>
      <button type="button" className={styles.iconButton} aria-label="Close" onClick={opened.close}>
        <CloseIcon />
      </button>
    </>
  );
}
