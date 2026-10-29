import { useEffect, useId, useRef } from 'react';

import styles from './AppBackground.module.css';
import planet from './planet.webp?url';

const HOUR = 3_600_000;

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

  useEffect(() => {
    const synchronize = () => {
      const now = new Date();
      const localTime =
        now.getHours() * HOUR + now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
      for (const [layer, duration] of [
        [planetLayer.current, HOUR],
        [starsLayer.current, 2 * HOUR],
      ] as const) {
        for (const animation of layer?.getAnimations?.() ?? []) {
          animation.currentTime = localTime % duration;
        }
      }
    };
    synchronize();
    if (!motion) {
      return;
    }
    const element = background.current;
    if (!element) {
      return;
    }
    let timer: number | undefined;
    let suspended: boolean | undefined;
    const refresh = () => {
      const next = document.visibilityState === 'hidden' || getComputedStyle(element).visibility === 'hidden';
      if (next === suspended) {
        if (!next) {
          synchronize();
          updateParallax(starsFrame.current);
        }
        return;
      }
      suspended = next;
      window.clearInterval(timer);
      element.toggleAttribute('data-suspended', next);
      if (!next) {
        synchronize();
        updateParallax(starsFrame.current);
        timer = window.setInterval(synchronize, 60_000);
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
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      element.removeAttribute('data-suspended');
    };
  }, [motion]);

  useEffect(() => {
    const frame = starsFrame.current;
    if (!frame) {
      return;
    }
    if (!motion) {
      frame.style.removeProperty('--scroll-progress');
      return;
    }
    let pending: number | null = null;
    const update = () => {
      pending = null;
      if (background.current?.hasAttribute('data-suspended')) {
        return;
      }
      updateParallax(frame);
    };
    const schedule = () => {
      if (background.current?.hasAttribute('data-suspended')) {
        return;
      }
      if (pending === null) {
        pending = requestAnimationFrame(update);
      }
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (pending !== null) {
        cancelAnimationFrame(pending);
      }
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
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
                className={star.id % 15 === 0 ? styles.star : undefined}
                cx={star.x}
                cy={star.y}
                r={star.radius}
                fillOpacity={star.opacity}
                style={
                  star.id % 15 === 0
                    ? { animationDuration: `${star.duration}s`, animationDelay: `${star.delay}s` }
                    : undefined
                }
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
