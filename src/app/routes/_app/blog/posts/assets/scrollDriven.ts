import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';

/*
 * How far a scroll-driven figure has played when its centre is `height` of the way up the screen, 0 at the bottom edge and 1 at the top.
 * It starts as the centre passes 30% of the way up, finishes at 65%, and stays finished after that.
 * Between those points the motion eases in and out, so a reader scrolling at a steady pace sees it start slowly, speed up and settle.
 */
function playedAt(height: number): number {
  const linear = Math.min(1, Math.max(0, (height - 0.3) / 0.35));
  return linear * linear * linear * (linear * (linear * 6 - 15) + 10);
}

/**
 * Reports how far a figure has played, from 0 to 1, each frame the page scrolls.
 * A reader who asked for less motion gets a single report of 1, so the figure shows its end state and holds still.
 */
export function useScrollDriven(element: RefObject<HTMLElement | null>, onPlayed: (played: number) => void) {
  const report = useEffectEvent(onPlayed);

  /* The scroll position is read from the page, so this subscribes to it. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      report(1);
      return;
    }
    const scrolled = () => {
      const { top, height } = element.current!.getBoundingClientRect();
      report(playedAt(1 - (top + height / 2) / window.innerHeight));
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scrolled);
    };
    scrolled();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [element]);
}
