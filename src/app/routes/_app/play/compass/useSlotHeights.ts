import { useEffect, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { pulse } from './pulse';
import type { Pulse } from './pulse';
import { fitHeight, OVERLAY_GAP, OVERLAYS, RESIZE_STEP, SIDES, SLOT_BOTTOM, slotBottom, slotLimit } from './slotLimits';
import type { Side } from './slotLimits';
import { useRemembered } from './useRemembered';

/*
 * Where each pinned slot stands and how tall it is: its bottom edge beside the chat bar or above it, its height
 * dragged by its top edge or nudged with the arrow keys, remembered, and held under the chrome drawn over the table.
 * The same measurement hangs the camera dial under the toolbar and stands the centre window over the chat bar.
 */

type Heights = Record<Side, number | null>;

/** The CSS custom property the camera dial's top edge reads, set on the controls' root. */
const CAMERA_TOP = '--compass-camera-top';
/** The CSS custom property the centre window's bottom edge reads: over the chat bar, however many rows it wraps to. */
const CENTRE_BOTTOM = '--compass-centre-bottom';

const NONE: Heights = { left: null, right: null };

/** Each slot's height and bounce, and the ways to drag, nudge and reset it. */
export type SlotHeights = ReturnType<typeof useSlotHeights>;

/* The slot pinned to a side, by the attributes its frame carries. */
function slotOn(root: HTMLElement, side: Side) {
  return root.querySelector<HTMLElement>(`[data-window][data-side="${side}"]`);
}

export function useSlotHeights(rootRef: RefObject<HTMLElement | null>, pinned: Readonly<Record<Side, string | null>>) {
  /* Each slot's height in pixels, remembered once its top edge is dragged; null keeps the default. */
  const [heights, setHeights] = useRemembered<Heights>('heights', NONE);
  /* The tallest each slot may grow before its top edge meets an overlay above it; null until measured. */
  const [limits, setLimits] = useState<Heights>(NONE);
  /* Bumps each time a drag or a nudge runs into the limit, replaying the bounce. */
  const [bounce, setBounce] = useState<Pulse>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const measure = () => {
      const box = root.getBoundingClientRect();
      /* The camera dial hangs under the toolbar (Next phase, settings) by the same gap a slot keeps from it. */
      const toolbar = root.querySelector('.seated-toolbar');
      if (toolbar) {
        const top = toolbar.getBoundingClientRect().bottom - box.top + OVERLAY_GAP;
        root.style.setProperty(CAMERA_TOP, `${Math.round(top)}px`);
      }
      /* The slots stand beside the chat bar while the table is wide enough for both and the bar, else above it. */
      const bar = root.querySelector('[data-compass-bar]');
      if (bar) {
        const over = box.bottom - bar.getBoundingClientRect().top + OVERLAY_GAP;
        root.style.setProperty(CENTRE_BOTTOM, `${Math.round(over)}px`);
      }
      const anySlot = SIDES.map((side) => slotOn(root, side)).find((slot) => slot !== null);
      if (bar && anySlot) {
        const lift = slotBottom(
          { width: root.clientWidth, bottom: box.bottom },
          bar.getBoundingClientRect(),
          anySlot.getBoundingClientRect().width
        );
        root.style.setProperty(SLOT_BOTTOM, `${lift}px`);
      }
      const next: Heights = { ...NONE };
      for (const side of SIDES) {
        const slot = slotOn(root, side);
        if (slot) {
          next[side] = slotLimit(root, slot);
        }
      }
      setLimits((current) => (current.left === next.left && current.right === next.right ? current : next));
    };
    measure();
    /* Chips come and go (an alliance forms, the phase changes), and the window resizes. */
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    /* Only the overlays' own contents and the slots arriving matter, not every chat line or badge under the table. */
    const mutations = new MutationObserver(measure);
    mutations.observe(root, { childList: true });
    for (const overlay of root.querySelectorAll(OVERLAYS)) {
      observer.observe(overlay);
      mutations.observe(overlay, { childList: true, subtree: true });
    }
    /* The bar widens as chats join it. */
    for (const bar of root.querySelectorAll('[data-compass-bar]')) {
      observer.observe(bar);
    }
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [rootRef, pinned.left, pinned.right]);

  const set = (side: Side, wanted: number, limit: number) => {
    const fit = fitHeight(wanted, limit);
    setHeights((current) => ({ ...current, [side]: fit.height }));
    return fit.bounced;
  };
  /** The slot's height, or its ceiling while it keeps the default height. */
  const styleOf = (side: Side): CSSProperties | undefined => {
    const wanted = heights[side];
    const limit = limits[side];
    if (wanted === null) {
      return limit === null ? undefined : { maxHeight: limit };
    }
    return { height: limit === null ? wanted : Math.min(wanted, limit) };
  };
  /** Dragging a slot's top edge: up makes it taller, down shorter. It stops short of any overlay above it and bounces there. */
  const resize = (side: Side) => (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const slot = event.currentTarget.parentElement!;
    const start = { y: event.clientY, height: slot.getBoundingClientRect().height };
    const limit = slotLimit(rootRef.current!, slot);
    /* The bounce plays once per run into the limit, not on every pixel dragged past it. */
    let stopped = false;
    const move = (moveEvent: PointerEvent) => {
      const bounced = set(side, start.height + start.y - moveEvent.clientY, limit);
      if (bounced && !stopped) {
        setBounce(pulse(side));
      }
      stopped = bounced;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  /** The arrow keys on a slot's grip: a step taller or shorter, with the same stop and bounce as a drag. */
  const nudge = (side: Side, slot: HTMLElement, direction: 'up' | 'down') => {
    const step = direction === 'up' ? RESIZE_STEP : -RESIZE_STEP;
    const limit = slotLimit(rootRef.current!, slot);
    if (set(side, slot.getBoundingClientRect().height + step, limit)) {
      setBounce(pulse(side));
    }
  };
  /** Back to the default height. */
  const reset = (side: Side) => setHeights((current) => ({ ...current, [side]: null }));
  return { styleOf, resize, nudge, reset, bounce };
}
