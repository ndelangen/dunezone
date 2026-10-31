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

/* Keep scrolling for the given time, then let the last scroll settle. */
function scrollFor(ms: number) {
  act(() => {
    for (let held = 0; held < ms; held += 100) {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(100);
    }
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(149);
  });
}

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

  it('glides the orbits from their held pose to the settled one and holds the clock until the glide ends', () => {
    const glides: { layer: Element; keyframes: Keyframe[]; playState: string; cancel: () => void }[] = [];
    vi.stubGlobal('getComputedStyle', (layer: HTMLElement) => ({ transform: layer.style.transform }));
    Element.prototype.animate = function (this: Element, keyframes: Keyframe[]) {
      const glide = {
        layer: this,
        keyframes,
        playState: 'running',
        cancel() {
          glide.playState = 'idle';
        },
      };
      glides.push(glide);
      return glide as unknown as Animation;
    } as Element['animate'];
    try {
      const { container } = render(<AppBackground motion />);
      const planet = container.querySelector<SVGSVGElement>('[data-background-planet] svg')!;
      const held = planet.style.transform;
      scrollFor(2000);
      expect(planet.style.transform).toBe(held);
      act(() => {
        vi.advanceTimersByTime(150);
      });
      const settled = planet.style.transform;
      expect(settled).not.toBe(held);
      expect(glides.map((glide) => glide.layer)).toContain(planet);
      expect(glides.find((glide) => glide.layer === planet)?.keyframes).toEqual([
        { transform: held },
        { transform: settled },
      ]);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(planet.style.transform).toBe(settled);
      for (const glide of glides) {
        glide.playState = 'finished';
      }
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(planet.style.transform).not.toBe(settled);

      /* A second settle starts from the running glide's pose and cancels it. */
      const count = glides.length;
      scrollFor(1000);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(glides.length).toBeGreaterThan(count);
      const second = glides.slice(count);
      scrollFor(300);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(second.every((glide) => glide.playState === 'idle')).toBe(true);
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
  });

  it('takes the new orbit pose directly after a clock jump instead of gliding a long way', () => {
    const glides: Element[] = [];
    vi.stubGlobal('getComputedStyle', (layer: HTMLElement) => ({ transform: layer.style.transform }));
    Element.prototype.animate = function (this: Element) {
      glides.push(this);
      return { playState: 'running', cancel() {} } as unknown as Animation;
    } as Element['animate'];
    try {
      vi.setSystemTime(new Date(2026, 9, 22, 23, 59, 59));
      const { container } = render(<AppBackground motion />);
      scrollFor(2000);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(glides).toHaveLength(0);
      expect(orbit(container, 'planet')).toBeLessThan(1);
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
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
