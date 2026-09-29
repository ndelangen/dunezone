// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PUBLISHED_IMAGE_RETRIES, PublishedImage, publishedImageRetryDelayMs } from './PublishedImage';

/* jsdom neither fetches nor decodes images, so each probe's outcome is set by the test, one per retry. */
const probeOutcomes: boolean[] = [];
const probedSources: string[] = [];

class ProbeImage {
  src = '';
  decode() {
    probedSources.push(this.src);
    return probeOutcomes.shift() ? Promise.resolve() : Promise.reject(new Error('not decoded'));
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
