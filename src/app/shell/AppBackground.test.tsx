/** @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { AppBackground } from './AppBackground';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 15, 15, 30));
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
  it('aligns both periods to the local clock, including after tab suspension', async () => {
    const { container } = render(<AppBackground motion />);
    expect(orbit(container, 'planet')).toBeCloseTo(93);
    expect(orbit(container, 'stars')).toBeCloseTo(-226.5);

    vi.setSystemTime(new Date(2026, 9, 22, 16, 0, 0));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(orbit(container, 'planet')).toBe(0);
    expect(orbit(container, 'stars')).toBe(0);
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
    expect(orbit(container, 'stars')).not.toBeCloseTo(-226.5);
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

  it('releases its clock on unmount', () => {
    const { unmount } = render(<AppBackground motion />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the orbits and twinkles stepping while scrolling, with no scroll work of its own', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const { container } = render(<AppBackground motion />);
    const star = container.querySelector('circle')!;
    const before = { orbit: orbit(container, 'planet'), opacity: star.style.opacity };
    act(() => {
      for (let step = 0; step < 5; step++) {
        document.documentElement.scrollTop = 100 * step;
        window.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(50);
      }
    });
    expect(orbit(container, 'planet')).not.toBe(before.orbit);
    expect(star.style.opacity).not.toBe(before.opacity);
    expect(addListener.mock.calls.map(([type]) => type)).not.toContain('scroll');
  });

  it('suspends the clock in a hidden tab and restores the current clock pose', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { container } = render(<AppBackground motion />);
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.querySelector('[data-app-background]')?.hasAttribute('data-suspended')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(new Date(2026, 9, 22, 16, 0, 0));
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.querySelector('[data-app-background]')?.hasAttribute('data-suspended')).toBe(false);
    expect(orbit(container, 'planet')).toBe(0);
    expect(orbit(container, 'stars')).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('freezes the current clock pose and marks reduced motion, which also turns off the CSS parallax', async () => {
    const { container, rerender } = render(<AppBackground motion />);
    rerender(<AppBackground motion={false} />);
    expect(container.querySelector('[data-app-background]')?.getAttribute('data-motion')).toBe('reduce');
    const angle = orbit(container, 'planet');
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(orbit(container, 'planet')).toBe(angle);
    expect(vi.getTimerCount()).toBe(0);
  });
});
