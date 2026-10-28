/** @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { AppBackground } from './AppBackground';

const originalAnimations = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');
let animations: WeakMap<Element, { currentTime: number }[]>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 15, 15, 30));
  animations = new WeakMap();
  frames = new Map();
  nextFrame = 0;
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value(this: Element) {
      if (!animations.has(this)) {
        animations.set(this, [{ currentTime: 0 }]);
      }
      return animations.get(this);
    },
  });
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
  if (originalAnimations) {
    Object.defineProperty(Element.prototype, 'getAnimations', originalAnimations);
  } else {
    Reflect.deleteProperty(Element.prototype, 'getAnimations');
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function orbitTime(container: HTMLElement, layer: 'planet' | 'stars') {
  const svg = container.querySelector(`[data-background-${layer}] svg`);
  if (!svg) {
    throw new Error(`Missing ${layer} layer`);
  }
  return animations.get(svg)?.[0].currentTime;
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
    expect(orbitTime(container, 'planet')).toBe(930_000);
    expect(orbitTime(container, 'stars')).toBe(4_530_000);

    vi.setSystemTime(new Date(2026, 9, 22, 16, 0, 0));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(orbitTime(container, 'planet')).toBe(0);
    expect(orbitTime(container, 'stars')).toBe(0);
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
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    expect(stars?.style.getPropertyValue('--scroll-progress')).toBe('0.5');
    expect(planet?.getAttribute('style')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suspends clock and scroll work in a hidden tab and restores the current clock pose', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { container } = render(<AppBackground motion />);
    document.documentElement.scrollTop = 250;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(frames.size).toBe(1);
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
    expect(orbitTime(container, 'planet')).toBe(0);
    expect(orbitTime(container, 'stars')).toBe(0);
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
    const angle = orbitTime(container, 'planet');
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(orbitTime(container, 'planet')).toBe(angle);
    expect(vi.getTimerCount()).toBe(0);
  });
});
