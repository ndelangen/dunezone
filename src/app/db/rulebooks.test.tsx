// @vitest-environment jsdom

import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsV1 } from '@shared/rulebooks/contents';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ConvexError } from 'convex/values';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), rehost: vi.fn() }));
vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: () => mocks.save,
  useAction: () => mocks.rehost,
}));

import { useSaveRulebook } from './rulebooks';
import type { RulebookMetadata } from './rulebooks';

const SOURCE_URL = 'https://images.example/cover.png';
const IMAGE = {
  url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
  sourceUrl: SOURCE_URL,
  width: 1100,
  height: 1600,
};

function variables() {
  return {
    rulebookId: 'rulebook-1' as RulebookMetadata['_id'],
    expectedRevision: 1,
    contents: rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['CVER'],
      pagesById: {
        CVER: {
          id: 'CVER',
          anchor: 'cover',
          title: 'Cover manual',
          layoutId: 'cover',
          showHeading: true,
          controlValues: { cover: { subtitle: '', supportingText: '', backgroundImageUrl: SOURCE_URL } },
          blocksById: {},
          blockOrderByRegion: {},
        },
      },
    }),
  };
}

function cover(contents: RulebookContentsV1) {
  const page = contents.pagesById.CVER;
  if (page.layoutId !== 'cover') {
    throw new Error('Expected a cover Page');
  }
  return page.controlValues.cover;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockImplementation(async ({ contents }) => ({ kind: 'saved', draft: { contents, revision: 2 } }));
  mocks.rehost.mockResolvedValue(IMAGE);
});

describe('Rulebook Save cover preparation', () => {
  test('mutateAsync stays pending across rehosting and saves the stored result without editing the caller draft', async () => {
    let finish!: (image: typeof IMAGE) => void;
    mocks.rehost.mockImplementation(
      () =>
        new Promise<typeof IMAGE>((resolve) => {
          finish = resolve;
        })
    );
    const hook = renderHook(() => useSaveRulebook());
    const input = variables();
    let saving!: ReturnType<typeof hook.result.current.mutateAsync>;
    act(() => {
      saving = hook.result.current.mutateAsync(input);
    });
    expect(hook.result.current.isPending).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => {
      finish(IMAGE);
      await saving;
    });
    expect(hook.result.current.isPending).toBe(false);
    expect(mocks.rehost).toHaveBeenCalledWith({ rulebookId: input.rulebookId, sourceUrl: SOURCE_URL });
    expect(cover(mocks.save.mock.calls[0][0].contents).backgroundImage).toEqual(IMAGE);
    expect(cover(input.contents).backgroundImage).toBeUndefined();
    expect(cover(hook.result.current.data!.draft.contents).backgroundImage).toEqual(IMAGE);
  });

  test('mutate reports rehost failure through the standard callbacks and does not save', async () => {
    mocks.rehost.mockRejectedValue(new ConvexError('The URL did not return an image'));
    const hook = renderHook(() => useSaveRulebook());
    const input = variables();
    const onError = vi.fn();
    const onSettled = vi.fn();
    act(() => {
      hook.result.current.mutate(input, { onError, onSettled });
    });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.isPending).toBe(false);
    expect(hook.result.current.error?.message).toBe('The URL did not return an image');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(hook.result.current.error, input);
    expect(onSettled).toHaveBeenCalledWith(undefined, hook.result.current.error, input);
    act(() => hook.result.current.reset());
    expect(hook.result.current.error).toBeNull();
  });

  test('mutate saves through the same rehost path and reports canonical contents to its callback', async () => {
    const hook = renderHook(() => useSaveRulebook());
    const input = variables();
    const onSuccess = vi.fn();
    act(() => hook.result.current.mutate(input, { onSuccess }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(cover(onSuccess.mock.calls[0][0].draft.contents).backgroundImage).toEqual(IMAGE);
    expect(onSuccess.mock.calls[0][1]).toBe(input);
  });

  test('an unchanged image is reused and an empty source clears it without a fetch', async () => {
    const hook = renderHook(() => useSaveRulebook());
    const input = variables();
    cover(input.contents).backgroundImage = IMAGE;
    await act(() => hook.result.current.mutateAsync(input));
    expect(mocks.rehost).not.toHaveBeenCalled();
    expect(cover(mocks.save.mock.calls[0][0].contents).backgroundImage).toEqual(IMAGE);
    cover(input.contents).backgroundImageUrl = '';
    await act(() => hook.result.current.mutateAsync(input));
    expect(mocks.rehost).not.toHaveBeenCalled();
    expect(cover(mocks.save.mock.calls[1][0].contents).backgroundImage).toBeUndefined();
  });
});
