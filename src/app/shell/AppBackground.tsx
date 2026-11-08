import { useEffect, useId, useRef } from 'react';

import styles from './AppBackground.module.css';
import planet from './planet.webp?url';

const HOUR = 3_600_000;
/* The hour-long orbit advances less than half a CSS pixel per tick on a 1440px-wide screen. */
const TICK_MS = 250;
/* After a voyage held them still, the orbits catch up with the clock over the planet's way back down. */
const GLIDE_MS = 1600;

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
const LAYOUT_MARKS = '[data-page-layout-height], [data-voyage]';

export function AppBackground({ motion }: { motion: boolean }) {
  const gradientId = useId();
  const background = useRef<HTMLDivElement>(null);
  const starsLayer = useRef<SVGSVGElement>(null);
  const planetLayer = useRef<SVGSVGElement>(null);
  const starLayers = useRef(new Map<number, SVGCircleElement>());

  useEffect(() => {
    const element = background.current;
    if (!element) {
      return;
    }
    let timer: number | undefined;
    let suspended: boolean | undefined;
    /* Whether a voyage held the orbits still, and the hold's end, so they glide to the clock instead of jumping to it. */
    let held = false;
    let glide: number | undefined;
    let lastPlanetAngle = 0;
    let lastStarsAngle = 0;
    const glideToClock = () => {
      const layers = [planetLayer.current, starsLayer.current];
      for (const layer of layers) {
        layer?.style.setProperty('transition', `transform ${GLIDE_MS}ms ease-in-out`);
      }
      window.clearTimeout(glide);
      glide = window.setTimeout(() => {
        for (const layer of layers) {
          layer?.style.removeProperty('transition');
        }
      }, GLIDE_MS);
    };
    const synchronize = (initial = false) => {
      /* On the way to a table the planet is mid-flight on the compositor: turning it or the stars would repaint those huge layers mid-animation. */
      if (!initial && (document.documentElement.dataset.voyage || document.querySelector('[data-voyage]'))) {
        held = true;
        return;
      }
      if (!initial && suspended) {
        return;
      }
      const now = new Date();
      const localTime =
        now.getHours() * HOUR + now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
      const planetAngle = ((localTime % HOUR) / HOUR) * 360;
      const starsAngle = ((localTime % (2 * HOUR)) / (2 * HOUR)) * -360;
      /* A glide across the top of the hour would spin the long way round, so the orbits then take their place at once. */
      if (held && planetAngle >= lastPlanetAngle && starsAngle <= lastStarsAngle) {
        glideToClock();
      }
      held = false;
      lastPlanetAngle = planetAngle;
      lastStarsAngle = starsAngle;
      if (planetLayer.current) {
        planetLayer.current.style.transform = `rotate(${planetAngle}deg)`;
      }
      if (starsLayer.current) {
        starsLayer.current.style.transform = `translate(-50%, -50%) rotate(${starsAngle}deg)`;
      }
      const elapsed = performance.now();
      for (const [id, element] of starLayers.current) {
        const star = stars[id]!;
        element.style.opacity = String(twinkle(elapsed, star.duration, star.delay));
      }
    };
    synchronize(true);
    if (!motion) {
      return;
    }
    const refresh = () => {
      const next = document.visibilityState === 'hidden' || getComputedStyle(element).visibility === 'hidden';
      if (next === suspended) {
        if (!next) {
          synchronize();
        }
        return;
      }
      suspended = next;
      window.clearInterval(timer);
      element.toggleAttribute('data-suspended', next);
      if (!next) {
        synchronize();
        /* The orbits and twinkles step on a slow clock, scrolling included, so they never have to catch up; continuous CSS animations cost more CPU in Firefox for motion too slow to see between steps. */
        timer = window.setInterval(() => synchronize(), TICK_MS);
      }
    };
    refresh();
    /* Fullscreen hides the background without resizing it, unless a voyage to a table keeps it up: only page-layout and voyage marks change that state. */
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === 'attributes' ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) => node instanceof Element && (node.matches(LAYOUT_MARKS) || node.querySelector(LAYOUT_MARKS))
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
        attributeFilter: ['data-page-layout-height', 'data-voyage'],
      });
    }
    /* A departing page marks the document itself. */
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-voyage'] });
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(glide);
      observer.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      element.removeAttribute('data-suspended');
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
      <div className={styles.starsFrame} data-background-stars>
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
