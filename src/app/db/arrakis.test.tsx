// @vitest-environment jsdom

import { arrakisBoard } from '@shared/boards/geometry';
import { ARRAKIS_OFFICIAL } from '@shared/rulebooks/fixtures/arrakisOfficial';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ live: undefined as unknown, query: vi.fn() }));

vi.mock('@app/db/core/live', () => ({ useLiveQuery: () => mocks.live }));
vi.mock('@db/core', () => ({ db: { query: mocks.query } }));

import { ARRAKIS_SSR_WAIT_MS, ArrakisBoardSeedProvider, loadArrakisBoard, useArrakisBoard } from './arrakis';
import type { ArrakisBoardSeed } from './arrakis';

const answer = {
  assetId: 'arrakis-board',
  name: 'Arrakis Official',
  imageUrl: ARRAKIS_OFFICIAL.imageUrl,
  geometry: ARRAKIS_OFFICIAL.geometry,
  publicationRevision: ARRAKIS_OFFICIAL.revision,
  board: arrakisBoard(),
} as unknown as NonNullable<ArrakisBoardSeed>;

const seeded =
  (seed: ArrakisBoardSeed | undefined) =>
  ({ children }: { children: ReactNode }) => (
    <ArrakisBoardSeedProvider seed={seed}>{children}</ArrakisBoardSeedProvider>
  );

beforeEach(() => {
  mocks.live = undefined;
  mocks.query.mockReset();
  vi.unstubAllEnvs();
});

describe('the loader that embeds the saved Arrakis board', () => {
  test('asks the server while it renders the page', async () => {
    vi.stubEnv('SSR', true);
    mocks.query.mockResolvedValue(answer);
    await expect(loadArrakisBoard()).resolves.toBe(answer);
  });

  test('leaves the page to load it live when the server cannot answer', async () => {
    vi.stubEnv('SSR', true);
    mocks.query.mockRejectedValue(new Error('offline'));
    await expect(loadArrakisBoard()).resolves.toBeUndefined();
  });

  test('stops waiting after a short while, so a slow server does not hold up the page', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('SSR', true);
      mocks.query.mockReturnValue(new Promise(() => undefined));
      const loading = loadArrakisBoard();
      await vi.advanceTimersByTimeAsync(ARRAKIS_SSR_WAIT_MS);
      await expect(loading).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test('never holds up a navigation in the browser', async () => {
    vi.stubEnv('SSR', false);
    await expect(loadArrakisBoard()).resolves.toBeUndefined();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('the saved Arrakis board', () => {
  test('is loading on a page that embedded none, until the live query answers', () => {
    expect(renderHook(() => useArrakisBoard()).result.current).toBeUndefined();
  });

  test('draws the copy the page embedded before the live query answers', () => {
    const { result } = renderHook(() => useArrakisBoard(), { wrapper: seeded(answer) });
    expect(result.current?.assetId).toBe('arrakis-board');
    expect(result.current?.capture.asset.name).toBe('Arrakis Official');
  });

  test('follows the live answer once it arrives, even when it says the site has none', () => {
    mocks.live = null;
    expect(renderHook(() => useArrakisBoard(), { wrapper: seeded(answer) }).result.current).toBeNull();
  });
});
