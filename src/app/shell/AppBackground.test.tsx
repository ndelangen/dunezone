/** @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { AppBackground } from './AppBackground';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 15, 15, 30));
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('innerHeight', 600);
  vi.stubGlobal('scrollY', 0);
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1600);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600);
  document.documentElement.scrollTop = 0;
  vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(1600);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function orbit(container: HTMLElement, layer: 'planet' | 'stars') {
  const svg = container.querySelector<SVGSVGElement>(`[data-background-${layer}] svg`);
  if (!svg) {
    throw new Error(`Missing ${layer} layer`);
  }
  const angle = Number(svg.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]);
  if (!Number.isFinite(angle)) {
    throw new Error(`Missing rotation on ${layer} layer: ${svg.style.transform}`);
  }
  return angle;
}

describe('orbital background', () => {
  it('reaches the end of parallax using the document scroller even when body content extends farther', () => {
    vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(1800);
    document.documentElement.scrollTop = 1000;
    vi.stubGlobal('scrollY', 1000);
    const { container } = render(<AppBackground motion />);
    expect(
      container.querySelector<HTMLElement>('[data-background-stars]')?.style.getPropertyValue('--scroll-progress')
    ).toBe('1');
  });

  it('aligns both periods to the local clock, including after tab suspension', async () => {
    const { container } = render(<AppBackground motion />);
    expect(orbit(container, 'planet') % 360).toBeCloseTo(93);
    expect(orbit(container, 'stars') % 360).toBeCloseTo(-226.5);

    vi.setSystemTime(new Date(2026, 9, 22, 16, 0, 0));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(orbit(container, 'planet') % 360).toBeCloseTo(0);
    expect(orbit(container, 'stars') % 360).toBeCloseTo(0);
  });

  it('updates the orbits and twinkles only on the shared slow clock', () => {
    const { container } = render(<AppBackground motion />);
    const pose = () => [...container.querySelectorAll('svg, circle')].map((element) => element.getAttribute('style'));
    const before = pose();
    const planetBefore = orbit(container, 'planet');
    const star = container.querySelector('circle')!;
    const opacityBefore = star.style.opacity;
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(pose()).toEqual(before);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(orbit(container, 'planet')).not.toBe(planetBefore);
    expect(orbit(container, 'stars') % 360).not.toBeCloseTo(-226.5);
    expect(pose()).not.toEqual(before);
    expect(star.style.opacity).not.toBe(opacityBefore);
    const afterTick = pose();
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(pose()).toEqual(afterTick);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('alternates the twinkle and returns to the same opacity after a complete period', () => {
    /* The first seeded star has an 11.59s duration and a -7.7s delay. */
    const elapsed = vi.spyOn(performance, 'now').mockReturnValue(3890);
    const { container } = render(<AppBackground motion />);
    const star = container.querySelector('circle')!;
    expect(Number(star.style.opacity)).toBeCloseTo(1);
    elapsed.mockReturnValue(15_480);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(Number(star.style.opacity)).toBeCloseTo(0.45);
    elapsed.mockReturnValue(27_070);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(Number(star.style.opacity)).toBeCloseTo(1);
  });

  it('updates only star parallax and releases pending work on unmount', async () => {
    const { container, unmount } = render(<AppBackground motion />);
    const stars = container.querySelector<HTMLElement>('[data-background-stars]');
    const planet = container.querySelector<HTMLElement>('[data-background-planet]');
    document.documentElement.scrollTop = 500;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(stars?.style.getPropertyValue('--scroll-progress')).toBe('0.5');
    expect(planet?.getAttribute('style')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds the whole background still until the last scroll event has settled', () => {
    const { container } = render(<AppBackground motion />);
    const stars = container.querySelector<HTMLElement>('[data-background-stars]')!;
    const star = container.querySelector('circle')!;
    const before = { orbit: orbit(container, 'planet'), opacity: star.style.opacity };
    act(() => {
      document.documentElement.scrollTop = 400;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(100);
      document.documentElement.scrollTop = 500;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(100);
      document.documentElement.scrollTop = 600;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(149);
    });
    expect(orbit(container, 'planet')).toBe(before.orbit);
    expect(star.style.opacity).toBe(before.opacity);
    expect(stars.style.getPropertyValue('--scroll-progress')).toBe('0');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(stars.style.getPropertyValue('--scroll-progress')).toBe('0.6');
    expect(orbit(container, 'planet')).not.toBe(before.orbit);
    expect(star.style.opacity).not.toBe(before.opacity);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('eases into the settled pose after scrolling and returns to plain ticks afterwards', () => {
    const elapsed = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { container } = render(<AppBackground motion />);
    const background = container.querySelector('[data-app-background]')!;
    expect(background.hasAttribute('data-gliding')).toBe(false);
    act(() => {
      document.documentElement.scrollTop = 500;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(150);
    });
    expect(background.hasAttribute('data-gliding')).toBe(true);
    elapsed.mockReturnValue(1600);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(background.hasAttribute('data-gliding')).toBe(true);
    elapsed.mockReturnValue(1900);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(background.hasAttribute('data-gliding')).toBe(false);
  });

  it('keeps counting turns across the hour so a glide never spins backwards', () => {
    vi.setSystemTime(new Date(2026, 9, 22, 15, 59, 59, 900));
    const { container } = render(<AppBackground motion />);
    const before = orbit(container, 'planet');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(orbit(container, 'planet')).toBeGreaterThan(before);
    expect(orbit(container, 'planet') - before).toBeLessThan(1);
  });

  it('suspends clock and scroll work in a hidden tab and restores the current clock pose', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { container } = render(<AppBackground motion />);
    document.documentElement.scrollTop = 250;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(vi.getTimerCount()).toBe(2);
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.querySelector('[data-app-background]')?.hasAttribute('data-suspended')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    expect(
      container.querySelector<HTMLElement>('[data-background-stars]')?.style.getPropertyValue('--scroll-progress')
    ).toBe('0');
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(frames.size).toBe(0);

    vi.setSystemTime(new Date(2026, 9, 22, 16, 0, 0));
    document.documentElement.scrollTop = 500;
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.querySelector('[data-app-background]')?.hasAttribute('data-suspended')).toBe(false);
    expect(orbit(container, 'planet') % 360).toBeCloseTo(0);
    expect(orbit(container, 'stars') % 360).toBeCloseTo(0);
    expect(
      container.querySelector<HTMLElement>('[data-background-stars]')?.style.getPropertyValue('--scroll-progress')
    ).toBe('0.5');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('freezes the current clock pose and removes parallax when motion is disabled', async () => {
    const { container, rerender } = render(<AppBackground motion />);
    rerender(<AppBackground motion={false} />);
    expect(container.querySelector('[data-app-background]')?.getAttribute('data-motion')).toBe('reduce');
    expect(
      container.querySelector<HTMLElement>('[data-background-stars]')?.style.getPropertyValue('--scroll-progress')
    ).toBe('');
    const angle = orbit(container, 'planet');
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(orbit(container, 'planet')).toBe(angle);
    expect(vi.getTimerCount()).toBe(0);
  });
});
