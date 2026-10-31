import { useEffect, useId, useRef } from 'react';

import styles from './AppBackground.module.css';
import planet from './planet.webp?url';

const HOUR = 3_600_000;
/* The hour-long orbit advances less than half a CSS pixel per tick on a 1440px-wide screen. */
const TICK_MS = 250;
const SCROLL_SETTLE_MS = 150;
/* Matches the transition in AppBackground.module.css that eases the background back after scrolling. */
const GLIDE_MS = 700;

/* Sample the former CSS ease-in-out curve, including each star's delay and alternating direction. */
function twinkle(elapsed: number, duration: number, delay: number) {
  const cycle = ((elapsed / 1000 - delay) % (2 * duration)) / duration;
  const progress = cycle > 1 ? 2 - cycle : cycle;
  let t = progress;
  /* Invert the x coordinate of cubic-bezier(0.42, 0, 0.58, 1), then evaluate its y coordinate. */
  for (let i = 0; i < 5; i++) {
    t -= (1.26 * t - 0.78 * t * t + 0.52 * t * t * t - progress) / (1.26 - 1.56 * t + 1.56 * t * t);
  }
  return 0.45 + 0.55 * (3 * t * t - 2 * t * t * t);
}

function updateParallax(frame: HTMLElement | null) {
  const scroller = document.scrollingElement ?? document.documentElement;
  const available = scroller.scrollHeight - scroller.clientHeight;
  const progress = available > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / available)) : 0;
  frame?.style.setProperty('--scroll-progress', String(progress));
}

const stars = (() => {
  let seed = 3417;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
  return Array.from({ length: 180 }, (_, id) => ({
    id,
    x: Math.round(random() * 16_000) / 10,
    y: Math.round(random() * 16_000) / 10,
    radius: Math.round((0.4 + random() ** 3 * 1.3) * 100) / 100,
    opacity: Math.round((0.2 + random() * 0.5) * 1000) / 1000,
    duration: Math.round((6 + random() * 8) * 100) / 100,
    delay: -Math.round(random() * 1400) / 100,
  }));
})();

/** The shell's fixed planet and independently turning SVG stars. */
export function AppBackground({ motion }: { motion: boolean }) {
  const gradientId = useId();
  const background = useRef<HTMLDivElement>(null);
  const starsFrame = useRef<HTMLDivElement>(null);
  const starsLayer = useRef<SVGSVGElement>(null);
  const planetLayer = useRef<SVGSVGElement>(null);
  const starLayers = useRef(new Map<number, SVGCircleElement>());

  useEffect(() => {
    const element = background.current;
    const frame = starsFrame.current;
    if (!element || !frame) {
      return;
    }
    let timer: number | undefined;
    let scrollTimer: number | undefined;
    let pending: number | null = null;
    let suspended: boolean | undefined;
    let scrolling = false;
    let glideUntil = 0;
    let lastTime = 0;
    const synchronize = () => {
      if (suspended || scrolling) {
        return;
      }
      const now = new Date();
      const localTime =
        now.getHours() * HOUR + now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
      /* Angles count whole turns since midnight so a glide never spins back a full turn; the midnight wrap skips it. */
      if (glideUntil && (performance.now() >= glideUntil || localTime < lastTime)) {
        glideUntil = 0;
        element.removeAttribute('data-gliding');
      }
      lastTime = localTime;
      if (planetLayer.current) {
        planetLayer.current.style.transform = `rotate(${(localTime / HOUR) * 360}deg)`;
      }
      if (starsLayer.current) {
        starsLayer.current.style.transform = `translate(-50%, -50%) rotate(${(localTime / (2 * HOUR)) * -360}deg)`;
      }
      const elapsed = performance.now();
      for (const [id, element] of starLayers.current) {
        const star = stars[id]!;
        element.style.opacity = String(twinkle(elapsed, star.duration, star.delay));
      }
    };
    synchronize();
    if (!motion) {
      frame.style.removeProperty('--scroll-progress');
      return;
    }
    const cancelPending = () => {
      window.clearTimeout(scrollTimer);
      scrolling = false;
      if (pending !== null) {
        cancelAnimationFrame(pending);
        pending = null;
      }
    };
    const update = () => {
      pending = null;
      if (!suspended && !scrolling) {
        updateParallax(frame);
      }
    };
    const schedule = () => {
      if (!suspended && !scrolling && pending === null) {
        pending = requestAnimationFrame(update);
      }
    };
    /* Let scrolling reuse the last background frame; ease back into place once input has settled. */
    const onScroll = () => {
      if (suspended) {
        return;
      }
      cancelPending();
      scrolling = true;
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        glideUntil = performance.now() + GLIDE_MS;
        element.setAttribute('data-gliding', '');
        synchronize();
        update();
      }, SCROLL_SETTLE_MS);
    };
    const refresh = () => {
      const next = document.visibilityState === 'hidden' || getComputedStyle(element).visibility === 'hidden';
      if (next === suspended) {
        if (!next && !scrolling) {
          synchronize();
          updateParallax(frame);
        }
        return;
      }
      suspended = next;
      window.clearInterval(timer);
      cancelPending();
      glideUntil = 0;
      element.removeAttribute('data-gliding');
      element.toggleAttribute('data-suspended', next);
      if (!next) {
        synchronize();
        updateParallax(frame);
        /* Continuous CSS animations kept Firefox redrawing this oversized scene even between visible changes. */
        timer = window.setInterval(synchronize, TICK_MS);
      }
    };
    refresh();
    /* Fullscreen hides the background without resizing it; only page-layout changes can change that state. */
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === 'attributes' ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) =>
                node instanceof Element &&
                (node.matches('[data-page-layout-height]') || node.querySelector('[data-page-layout-height]'))
            )
        )
      ) {
        refresh();
      }
    });
    const shell = element.closest('[data-app-root]');
    if (shell) {
      observer.observe(shell, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-page-layout-height'],
      });
    }
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.clearInterval(timer);
      cancelPending();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      element.removeAttribute('data-suspended');
      element.removeAttribute('data-gliding');
    };
  }, [motion]);

  return (
    <div
      ref={background}
      className={styles.background}
      data-app-background
      data-motion={motion ? 'ok' : 'reduce'}
      aria-hidden
    >
      <div ref={starsFrame} className={styles.starsFrame} data-background-stars>
        <svg ref={starsLayer} className={styles.stars} viewBox="0 0 1600 1600">
          <defs>
            <radialGradient id={gradientId}>
              <stop stopColor="var(--ui-recess)" />
              <stop offset="1" stopColor="var(--ui-ground)" />
            </radialGradient>
          </defs>
          <path fill={`url(#${gradientId})`} d="M0 0h1600v1600H0z" />
          <g fill="var(--ui-highlight)">
            {stars.map((star) => (
              <circle
                key={star.id}
                ref={
                  star.id % 15 === 0
                    ? (element) => {
                        if (element) {
                          starLayers.current.set(star.id, element);
                        } else {
                          starLayers.current.delete(star.id);
                        }
                      }
                    : undefined
                }
                cx={star.x}
                cy={star.y}
                r={star.radius}
                fillOpacity={star.opacity}
              />
            ))}
          </g>
        </svg>
      </div>
      <div className={styles.planetFrame} data-background-planet>
        <div className={styles.planetDisc}>
          {/* Fit the painted disc's measured bounds to the mask before rotating it. */}
          <svg ref={planetLayer} className={styles.planet} viewBox="10 10 1002 990" preserveAspectRatio="none">
            <image href={planet} width="1024" height="1024" />
          </svg>
        </div>
      </div>
    </div>
  );
}
