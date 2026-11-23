// @vitest-environment jsdom

import { arrakisBoard } from '@shared/boards/geometry';
import { ARRAKIS_OFFICIAL } from '@shared/rulebooks/fixtures/arrakisOfficial';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  reference: undefined as unknown,
  fallback: undefined as unknown,
  fallbackNeeded: [] as boolean[],
  query: vi.fn(),
}));

vi.mock('@app/db/core/live', () => ({
  useLiveQuery: () => mocks.reference,
  useFallbackQuery: (_query: unknown, _args: unknown, needed: boolean) => {
    mocks.fallbackNeeded.push(needed);
    return needed ? mocks.fallback : undefined;
  },
}));
vi.mock('@db/core', () => ({ db: { query: mocks.query } }));

import { ARRAKIS_SSR_WAIT_MS, ArrakisBoardSeedProvider, loadArrakisBoard, useArrakisBoard } from './arrakis';
import type { ArrakisBoardSeed } from './arrakis';

const answer = {
  assetId: 'arrakis-board',
  name: 'Arrakis Official',
  imageUrl: ARRAKIS_OFFICIAL.imageUrl,
  geometry: ARRAKIS_OFFICIAL.geometry,
  board: arrakisBoard(),
  revision: 'token-1.2026-10-01',
} as unknown as NonNullable<ArrakisBoardSeed>;
const referenceTo = (board: NonNullable<ArrakisBoardSeed>) => ({
  assetId: board.assetId,
  name: board.name,
  revision: board.revision,
});
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
const edgeAnswers = (board: NonNullable<ArrakisBoardSeed> | undefined) =>
  fetchMock.mockImplementation(async () =>
    board ? Response.json(board) : new Response('<!doctype html>', { status: 200 })
  );

const seeded =
  (seed: ArrakisBoardSeed | undefined) =>
  ({ children }: { children: ReactNode }) => (
    <ArrakisBoardSeedProvider seed={seed}>{children}</ArrakisBoardSeedProvider>
  );

beforeEach(() => {
  mocks.reference = undefined;
  mocks.fallback = undefined;
  mocks.fallbackNeeded = [];
  fetchMock.mockReset();
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
  test('is loading on a page that embedded none, until the reference answers', () => {
    expect(renderHook(() => useArrakisBoard()).result.current).toBeUndefined();
  });

  test('draws the copy the page embedded, and fetches nothing while that copy is current', () => {
    const { result, rerender } = renderHook(() => useArrakisBoard(), { wrapper: seeded(answer) });
    expect(result.current?.assetId).toBe('arrakis-board');
    expect(result.current?.capture.asset.name).toBe('Arrakis Official');
    mocks.reference = referenceTo(answer);
    rerender();
    expect(result.current?.assetId).toBe('arrakis-board');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.fallbackNeeded).not.toContain(true);
  });

  test('follows the reference when it says the site has none, over the embedded copy', () => {
    mocks.reference = null;
    expect(renderHook(() => useArrakisBoard(), { wrapper: seeded(answer) }).result.current).toBeNull();
  });

  test('fetches a newer revision from the edge, without subscribing to the whole board', async () => {
    const newer = {
      ...answer,
      assetId: 'newer-board',
      name: 'Arrakis Revised',
      board: arrakisBoard(),
      revision: 'token-2.2026-10-02',
    };
    edgeAnswers(newer);
    const { result, rerender } = renderHook(() => useArrakisBoard(), { wrapper: seeded(answer) });
    mocks.reference = referenceTo(newer);
    rerender();
    await waitFor(() => expect(result.current?.assetId).toBe('newer-board'));
    expect(fetchMock).toHaveBeenCalledWith('/data/arrakis-board/token-2.2026-10-02.json');
    expect(result.current?.definition).toBe(result.current?.board);
    expect(result.current?.capture).toEqual({
      asset: { id: 'newer-board', slug: 'arrakis-official', name: 'Arrakis Revised' },
      definition: newer.board,
    });
    expect(mocks.fallbackNeeded).not.toContain(true);
  });

  test('subscribes to the whole board where the edge has no copy (Storybook, local dev)', async () => {
    const elsewhere = { ...answer, revision: 'token-3.2026-10-03' };
    edgeAnswers(undefined);
    mocks.reference = referenceTo(elsewhere);
    mocks.fallback = elsewhere;
    const { result } = renderHook(() => useArrakisBoard());
    await waitFor(() => expect(result.current?.revision).toBe('token-3.2026-10-03'));
    expect(mocks.fallbackNeeded).toContain(true);
  });
});
