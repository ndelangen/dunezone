import { IMMERSIVE_ENTER_EVENT, IMMERSIVE_LEAVE_EVENT } from '@ui/layout/immersiveEvents';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

/*
 * The band's grow into an immersive page and its shrink back out, kept off the main thread.
 *
 * Resizing the band would redraw the window-sized video, the blurred placeholder and the veil on every frame, and on a busy frame that shows as a hitch.
 * So the band takes its new size at once, and what moves is cheap to composite:
 * a clip that opens from where the band stood to the whole window (or closes back),
 * a transform that keeps the artwork at the scale it had in the old box until the clip has opened,
 * and the navigation's inset, so its links glide to the window's edges.
 * While the shrink runs, `data-band-unwinding` on the frame keeps the band window-sized and above the arriving page.
 */

const DURATION_MS = 700;
const EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';

/* The everyday band's corner radius, as `.band` in AppHeader.module.css. */
const RESTING_RADIUS = '6px';

/* The artwork's aspect ratio, as `.bandMedia` in AppHeader.module.css. */
const MEDIA_ASPECT = 16 / 9;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function pageBox(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

/* Where the artwork sits when it covers `box`: as wide as the box or as tall, whichever needs more, centred vertically and aligned across by `alignX`. */
function coverBox(box: Box, alignX: number): Box {
  const width = Math.max(box.width, box.height * MEDIA_ASPECT);
  const height = width / MEDIA_ASPECT;
  return {
    x: box.x + (box.width - width) * alignX,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

interface Parts {
  frame: HTMLElement;
  band: HTMLElement;
  media: HTMLElement;
  navigation: HTMLElement;
}

/* The three keyframes that show the window-sized band as if it filled only `view`. */
function keyframesFor(parts: Parts, box: Box, view: Box) {
  const whole = view === box;
  const alignX = parseFloat(getComputedStyle(parts.band).getPropertyValue('--band-media-align-x')) || 0;
  const inset = parseFloat(getComputedStyle(parts.navigation).paddingRight) || 0;
  const art = coverBox(view, alignX);
  const fullArt = coverBox(box, alignX);
  const top = view.y - box.y;
  const right = box.x + box.width - (view.x + view.width);
  const bottom = box.y + box.height - (view.y + view.height);
  const left = view.x - box.x;
  return {
    band: {
      clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${whole ? '0px' : RESTING_RADIUS})`,
    },
    media: {
      transform: `translate(${art.x - fullArt.x}px, ${art.y - fullArt.y}px) scale(${art.width / fullArt.width})`,
    },
    navigation: {
      paddingLeft: `${left + inset}px`,
      paddingRight: `${right + inset}px`,
      transform: `translateY(${top}px)`,
    },
  };
}

/* The band's grow and shrink for one mounted frame, driven by the immersive page's events. */
class BandMotion {
  private running: Animation[] = [];
  private unwinding = false;
  /* The band's height in the page flow, read after every resize so a grow knows the box it leaves even though the band has already restyled by then. */
  private restingHeight: number;
  private readonly resting: ResizeObserver | null;

  constructor(
    private readonly parts: Parts,
    private readonly motionAllowed: () => boolean
  ) {
    this.restingHeight = parts.band.getBoundingClientRect().height;
    this.resting = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.measureResting);
    this.resting?.observe(parts.band);
    parts.frame.addEventListener(IMMERSIVE_ENTER_EVENT, this.enter);
    parts.frame.addEventListener(IMMERSIVE_LEAVE_EVENT, this.leave);
  }

  dispose() {
    this.parts.frame.removeEventListener(IMMERSIVE_ENTER_EVENT, this.enter);
    this.parts.frame.removeEventListener(IMMERSIVE_LEAVE_EVENT, this.leave);
    this.resting?.disconnect();
    this.stop();
  }

  private readonly measureResting = () => {
    const { band } = this.parts;
    if (getComputedStyle(band).position !== 'absolute') {
      this.restingHeight = band.getBoundingClientRect().height;
    }
  };

  private readonly stop = () => {
    for (const animation of this.running) {
      animation.cancel();
    }
    this.running = [];
  };

  /* Restyles the band with its everyday height transition held off, so a switch between window-sized and resting lands at once. */
  private restyle(change: () => void) {
    const { band } = this.parts;
    band.style.transition = 'none';
    change();
    void getComputedStyle(band).height;
    band.style.transition = '';
  }

  private play(box: Box, from: Box, to: Box, done: () => void) {
    const { band, media, navigation } = this.parts;
    const start = keyframesFor(this.parts, box, from);
    const end = keyframesFor(this.parts, box, to);
    const options: KeyframeAnimationOptions = { duration: DURATION_MS, easing: EASING, fill: 'both' };
    this.running = [
      band.animate([start.band, end.band], options),
      media.animate([start.media, end.media], options),
      navigation.animate([start.navigation, end.navigation], options),
    ];
    this.running[0].finished.then(done, () => {});
  }

  /* Ends a shrink: the band drops back into the flow at the size the animation ended on, and its shadow fades back in. */
  private readonly settle = () => {
    if (!this.unwinding) {
      return;
    }
    const { frame, band } = this.parts;
    this.unwinding = false;
    this.restyle(() => frame.removeAttribute('data-band-unwinding'));
    frame.style.removeProperty('grid-template-rows');
    this.stop();
    const shadow = getComputedStyle(band).boxShadow;
    if (shadow !== 'none') {
      band.animate([{ boxShadow: shadow.replace(/rgba?\([^)]*\)/, 'transparent') }, { boxShadow: shadow }], 250);
    }
  };

  private readonly enter = () => {
    this.settle();
    this.stop();
    if (!this.motionAllowed()) {
      return;
    }
    const frameBox = pageBox(this.parts.frame);
    const from = { x: frameBox.x, y: frameBox.y, width: frameBox.width, height: this.restingHeight };
    const box = pageBox(this.parts.band);
    this.play(box, from, box, this.stop);
  };

  private readonly leave = () => {
    this.stop();
    if (!this.motionAllowed()) {
      return;
    }
    this.unwinding = true;
    this.parts.frame.setAttribute('data-band-unwinding', '');
    /* The arriving page mounts later in this same commit; once it has, the band can read the resting box it shrinks to. */
    queueMicrotask(this.shrink);
  };

  private readonly shrink = () => {
    const { frame, band } = this.parts;
    if (!this.unwinding || !band.isConnected) {
      return;
    }
    const box = pageBox(band);
    let to = box;
    this.restyle(() => {
      frame.removeAttribute('data-band-unwinding');
      to = pageBox(band);
      frame.setAttribute('data-band-unwinding', '');
    });
    /* Out of the flow, the band no longer holds its row open, so the row keeps the height it is shrinking to and the arriving page stays put. */
    frame.style.setProperty('grid-template-rows', `${to.height}px auto`);
    this.play(box, box, to, this.settle);
  };
}

function findParts(frame: HTMLElement | null, band: HTMLElement | null, media: HTMLElement | null): Parts | null {
  if (!frame || !band) {
    return null;
  }
  const navigation = band.querySelector('nav');
  if (!media || !navigation) {
    return null;
  }
  return typeof band.animate === 'function' ? { frame, band, media, navigation } : null;
}

/** Runs the band's grow and shrink whenever an immersive page arrives or leaves the frame. */
export function useBandMotion(
  frameRef: RefObject<HTMLElement | null>,
  bandRef: RefObject<HTMLElement | null>,
  mediaRef: RefObject<HTMLElement | null>,
  motionOk: boolean
) {
  const motionRef = useRef(motionOk);
  useEffect(() => {
    motionRef.current = motionOk;
  }, [motionOk]);

  useEffect(() => {
    const parts = findParts(frameRef.current, bandRef.current, mediaRef.current);
    if (!parts) {
      return;
    }
    const motion = new BandMotion(parts, () => motionRef.current);
    return () => motion.dispose();
  }, [frameRef, bandRef, mediaRef]);
}
