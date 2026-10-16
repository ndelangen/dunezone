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
    const frame = frameRef.current;
    const band = bandRef.current;
    const media = mediaRef.current;
    const navigation = band?.querySelector('nav');
    if (!frame || !band || !media || !navigation || typeof band.animate !== 'function') {
      return;
    }
    const parts: Parts = { band, media, navigation };

    /* The band's height in the page flow, read after every resize so a grow knows the box it leaves even though the band has already restyled by then. */
    let restingHeight = band.getBoundingClientRect().height;
    const resting =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (getComputedStyle(band).position !== 'absolute') {
              restingHeight = band.getBoundingClientRect().height;
            }
          });
    resting?.observe(band);

    let running: Animation[] = [];
    let unwinding = false;

    const stop = () => {
      for (const animation of running) {
        animation.cancel();
      }
      running = [];
    };

    /* Restyles the band with its everyday height transition held off, so a switch between window-sized and resting lands at once. */
    const restyle = (change: () => void) => {
      band.style.transition = 'none';
      change();
      void getComputedStyle(band).height;
      band.style.transition = '';
    };

    const play = (box: Box, from: Box, to: Box, done: () => void) => {
      const start = keyframesFor(parts, box, from);
      const end = keyframesFor(parts, box, to);
      const options: KeyframeAnimationOptions = {
        duration: DURATION_MS,
        easing: EASING,
        fill: 'both',
      };
      running = [
        band.animate([start.band, end.band], options),
        media.animate([start.media, end.media], options),
        navigation.animate([start.navigation, end.navigation], options),
      ];
      running[0].finished.then(done, () => {});
    };

    /* Ends a shrink: the band drops back into the flow at the size the animation ended on, and its shadow fades back in. */
    const settle = () => {
      if (!unwinding) {
        return;
      }
      unwinding = false;
      restyle(() => frame.removeAttribute('data-band-unwinding'));
      frame.style.removeProperty('grid-template-rows');
      stop();
      const shadow = getComputedStyle(band).boxShadow;
      if (shadow !== 'none') {
        band.animate([{ boxShadow: shadow.replace(/rgba?\([^)]*\)/, 'transparent') }, { boxShadow: shadow }], 250);
      }
    };

    const enter = () => {
      settle();
      stop();
      if (!motionRef.current) {
        return;
      }
      const frameBox = pageBox(frame);
      const from = {
        x: frameBox.x,
        y: frameBox.y,
        width: frameBox.width,
        height: restingHeight,
      };
      const box = pageBox(band);
      play(box, from, box, stop);
    };

    const leave = () => {
      stop();
      if (!motionRef.current) {
        return;
      }
      unwinding = true;
      frame.setAttribute('data-band-unwinding', '');
      /* The arriving page mounts later in this same commit; once it has, the band can read the resting box it shrinks to. */
      queueMicrotask(() => {
        if (!unwinding || !band.isConnected) {
          return;
        }
        const box = pageBox(band);
        let to = box;
        restyle(() => {
          frame.removeAttribute('data-band-unwinding');
          to = pageBox(band);
          frame.setAttribute('data-band-unwinding', '');
        });
        /* Out of the flow, the band no longer holds its row open, so the row keeps the height it is shrinking to and the arriving page stays put. */
        frame.style.setProperty('grid-template-rows', `${to.height}px auto`);
        play(box, box, to, settle);
      });
    };

    frame.addEventListener(IMMERSIVE_ENTER_EVENT, enter);
    frame.addEventListener(IMMERSIVE_LEAVE_EVENT, leave);
    return () => {
      frame.removeEventListener(IMMERSIVE_ENTER_EVENT, enter);
      frame.removeEventListener(IMMERSIVE_LEAVE_EVENT, leave);
      resting?.disconnect();
      stop();
    };
  }, [frameRef, bandRef, mediaRef]);
}
