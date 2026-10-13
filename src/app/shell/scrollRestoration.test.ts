import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const plain = { location: { hash: '' } };

async function freshModule({
  scrollX = 0,
  scrollY = 0,
  navigation = 'navigate',
}: { scrollX?: number; scrollY?: number; navigation?: string } = {}) {
  vi.stubGlobal('window', { scrollX, scrollY });
  vi.stubGlobal('performance', { getEntriesByType: () => [{ type: navigation }] });
  return import('./scrollRestoration');
}

describe('scroll restoration', () => {
  it('keeps a position the visitor reached before the first client render', async () => {
    const { restoresScroll } = await freshModule({ scrollY: 640 });
    expect(restoresScroll(plain)).toBe(false);
  });

  it('keeps a sideways position too', async () => {
    const { restoresScroll } = await freshModule({ scrollX: 80 });
    expect(restoresScroll(plain)).toBe(false);
  });

  it('scrolls as usual on the first client render of an unscrolled page', async () => {
    const { restoresScroll } = await freshModule();
    expect(restoresScroll(plain)).toBe(true);
  });

  it('scrolls as usual after the first client render, wherever the window is', async () => {
    const { restoresScroll } = await freshModule({ scrollY: 640 });
    restoresScroll(plain);
    expect(restoresScroll(plain)).toBe(true);
  });

  it.each(['reload', 'back_forward'])(
    'lets the router restore its saved position on a %s visit',
    async (navigation) => {
      const { restoresScroll } = await freshModule({ scrollY: 640, navigation });
      expect(restoresScroll(plain)).toBe(true);
    }
  );

  it('lets a location with a hash scroll to its section', async () => {
    const { restoresScroll } = await freshModule({ scrollY: 640 });
    expect(restoresScroll({ location: { hash: 'make' } })).toBe(true);
  });

  it('always scrolls on the server, without using up the first client render', async () => {
    const { restoresScroll } = await import('./scrollRestoration');
    expect(restoresScroll(plain)).toBe(true);
    vi.stubGlobal('window', { scrollX: 0, scrollY: 640 });
    vi.stubGlobal('performance', { getEntriesByType: () => [{ type: 'navigate' }] });
    expect(restoresScroll(plain)).toBe(false);
  });
});
