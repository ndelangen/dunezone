import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function freshModule(scrollY: number) {
  vi.stubGlobal('window', { scrollX: 0, scrollY });
  return import('./scrollRestoration');
}

describe('scroll restoration', () => {
  it('keeps a position the visitor reached before hydration', async () => {
    const { restoresScroll } = await freshModule(640);
    expect(restoresScroll()).toBe(false);
  });

  it('scrolls as usual on the hydrating render of an unscrolled page', async () => {
    const { restoresScroll } = await freshModule(0);
    expect(restoresScroll()).toBe(true);
  });

  it('scrolls as usual after hydration, wherever the window is', async () => {
    const { restoresScroll } = await freshModule(640);
    restoresScroll();
    expect(restoresScroll()).toBe(true);
  });
});
