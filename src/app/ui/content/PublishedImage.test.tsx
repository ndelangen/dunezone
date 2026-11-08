// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { markDecoded } from './imageArrival';
import { PUBLISHED_IMAGE_RETRIES, PublishedImage, publishedImageRetryDelayMs } from './PublishedImage';

/* jsdom neither fetches nor decodes images, so each probe's outcome is set by the test, one per retry. */
const probeOutcomes: boolean[] = [];
const probedSources: string[] = [];

class ProbeImage {
  src = '';
  naturalWidth = 0;
  decode() {
    probedSources.push(this.src);
    if (probeOutcomes.shift()) {
      this.naturalWidth = 600;
      return Promise.resolve();
    }
    return Promise.reject(new Error('not decoded'));
  }
}

const MISSING = 'Atreides: preview unavailable';

function renderFailed(src = '/published/atreides.png') {
  render(<PublishedImage src={src} name="Atreides" aspect={1} />);
  /* The tile is on screen, so its image starts fetching at once, and here the fetch fails. */
  fireEvent.error(screen.getByRole('img', { name: 'Atreides' }));
  expect(screen.getByRole('img', { name: MISSING })).toBeTruthy();
}

async function waitOutRetry(attempt: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(publishedImageRetryDelayMs(attempt));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Image', ProbeImage);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  probeOutcomes.length = 0;
  probedSources.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PublishedImage retries a failed publication', () => {
  test('waits 5 s, doubling to a minute', () => {
    expect([0, 1, 2, 3, 4, 5].map(publishedImageRetryDelayMs)).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  test('replaces the missing state with the image once a retry decodes it', async () => {
    renderFailed();
    probeOutcomes.push(false, true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(publishedImageRetryDelayMs(0) - 1);
    });
    expect(probedSources).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(probedSources).toEqual(['/published/atreides.png']);
    expect(screen.getByRole('img', { name: MISSING })).toBeTruthy();

    await waitOutRetry(1);
    expect(probedSources).toHaveLength(2);
    expect(screen.queryByRole('img', { name: MISSING })).toBeNull();
    expect(screen.getByRole('img', { name: 'Atreides' }).getAttribute('src')).toBe('/published/atreides.png');
  });

  test('stops after its last retry and stays missing', async () => {
    renderFailed();
    for (let attempt = 0; attempt < PUBLISHED_IMAGE_RETRIES; attempt += 1) {
      await waitOutRetry(attempt);
    }
    expect(probedSources).toHaveLength(PUBLISHED_IMAGE_RETRIES);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(probedSources).toHaveLength(PUBLISHED_IMAGE_RETRIES);
    expect(screen.getByRole('img', { name: MISSING })).toBeTruthy();
  });

  test('counts a failure after a recovery against the same budget', async () => {
    renderFailed();
    probeOutcomes.push(true);
    await waitOutRetry(0);
    fireEvent.error(screen.getByRole('img', { name: 'Atreides' }));

    for (let attempt = 1; attempt < PUBLISHED_IMAGE_RETRIES + 2; attempt += 1) {
      await waitOutRetry(attempt);
    }
    expect(probedSources).toHaveLength(PUBLISHED_IMAGE_RETRIES);
  });

  test('never retries an image with no publication', async () => {
    render(<PublishedImage src={null} name="Atreides" aspect={1} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(probedSources).toEqual([]);
  });
});

describe("PublishedImage as a page's main image", () => {
  test('writes its src into the server HTML, fetched first and shown, and only then', () => {
    const main = renderToString(<PublishedImage src="/published/atreides.jpg" name="Atreides" aspect={1} priority />);
    expect(main).toContain('src="/published/atreides.jpg"');
    expect(main).toContain('alt="Atreides"');
    expect(main).toContain('fetchPriority="high"');
    /* Shown as it lands, so the page paints it before scripts run. */
    expect(main).toContain('data-phase="shown"');
    expect(main).toContain('data-arrival="instant"');
    expect(renderToString(<PublishedImage src="/published/atreides.jpg" name="Atreides" aspect={1} />)).not.toContain(
      '<img'
    );
  });

  test('arrives like any other image when the client mounts it, as after navigation', () => {
    const { container } = render(<PublishedImage src="/published/atreides.jpg" name="Atreides" aspect={1} priority />);
    const root = container.firstElementChild!;
    expect(root.getAttribute('data-phase')).toBe('loading');
    expect(root.getAttribute('data-arrival')).toBe('animate');
    expect(container.querySelector('img')?.getAttribute('fetchpriority')).toBe('high');
  });

  test('settles a load that failed before hydration, which no error event reports', async () => {
    const element = <PublishedImage src="/published/atreides.jpg" name="Atreides" aspect={1} priority />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const img = container.querySelector('img')!;
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 0 });
    const errors = vi.spyOn(console, 'error');
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, element);
    });
    expect(screen.getByRole('img', { name: MISSING })).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    act(() => root!.unmount());
    container.remove();
  });
});

describe('PublishedImage asks for a copy sized to its tile', () => {
  const card = '/published/cards/j57c8t9m2q4w6e8r0y2u4i6o8p0a2s4d/card.jpg?v=1';

  function renderAtWidth(width: number, src = card, full = false) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width, height: width })
    );
    vi.stubGlobal('devicePixelRatio', 2);
    const { container } = render(<PublishedImage src={src} name="Trishula" aspect={1.4} full={full} />);
    return container.querySelector('img')?.getAttribute('src');
  }

  afterEach(() => vi.restoreAllMocks());

  test('a 60px tile on a 2x screen draws the 160px copy', () => {
    expect(renderAtWidth(60)).toBe(`${card}&w=160`);
  });

  test('a tile wider than every copy draws the capture itself', () => {
    expect(renderAtWidth(400)).toBe(card);
  });

  test('a full image draws the capture itself however small its tile', () => {
    expect(renderAtWidth(60, card, true)).toBe(card);
  });

  test('a source that is not a publication is drawn as given', () => {
    expect(renderAtWidth(60, '/published/atreides.png')).toBe('/published/atreides.png');
  });
});

describe('PublishedImage shown from a copy another tile decoded', () => {
  /* Each test its own card, since the page-wide record of decoded copies outlives a test. */
  const card = () => `/published/cards/${crypto.randomUUID().replaceAll('-', '')}/card.jpg?v=1`;

  /* The small copy is already in the browser, so the tile draws it complete and decoded. */
  function renderDecoded(width: number, src: string, full = false) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width, height: width })
    );
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(160);
    vi.stubGlobal('devicePixelRatio', 2);
    const { container } = render(<PublishedImage src={src} name="Trishula" aspect={1.4} full={full} />);
    return () => container.querySelector('img')?.getAttribute('src');
  }

  afterEach(() => vi.restoreAllMocks());

  test("a full image shows the hand's copy at once, then the capture once it has loaded", async () => {
    const src = card();
    markDecoded(src, `${src}&w=160`);
    probeOutcomes.push(true);
    const drawn = renderDecoded(60, src, true);
    expect(drawn()).toBe(`${src}&w=160`);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(probedSources).toEqual([src]);
    expect(drawn()).toBe(src);
  });

  test('keeps the smaller copy when the capture fails to load', async () => {
    const src = card();
    markDecoded(src, `${src}&w=160`);
    probeOutcomes.push(false);
    const drawn = renderDecoded(60, src, true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(drawn()).toBe(`${src}&w=160`);
  });

  test('a small tile after a close look draws the small copy, not the capture', async () => {
    const src = card();
    markDecoded(src, src);
    markDecoded(src, `${src}&w=160`);
    const drawn = renderDecoded(60, src);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(drawn()).toBe(`${src}&w=160`);
    expect(probedSources).toEqual([]);
  });

  test('a larger tile sharpens past the small copy to the one it needs', async () => {
    const src = card();
    markDecoded(src, `${src}&w=160`);
    probeOutcomes.push(true);
    const drawn = renderDecoded(240, src);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(drawn()).toBe(`${src}&w=640`);
  });
});
