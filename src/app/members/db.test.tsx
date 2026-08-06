// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  request: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  remove: vi.fn(),
  add: vi.fn(),
}));

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: mocks.useMutation,
}));
vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));

import { useGroupMembershipWorkflow } from './db';

beforeEach(() => {
  vi.clearAllMocks();
  for (const mutation of [mocks.request, mocks.approve, mocks.reject, mocks.remove, mocks.add]) {
    mutation.mockResolvedValue({ membershipId: 'membership-1', status: 'active' });
  }
  const mutations = [mocks.request, mocks.approve, mocks.reject, mocks.remove, mocks.add];
  mocks.useMutation.mockImplementation(
    () => mutations[(mocks.useMutation.mock.calls.length - 1) % mutations.length]
  );
});

describe('Group membership workflow', () => {
  test('exposes normalized commands and keeps Convex transport arguments private', async () => {
    const hook = renderHook(() => useGroupMembershipWorkflow());

    for (const command of Object.values(hook.result.current)) {
      expect(Object.keys(command).sort()).toEqual([
        'error',
        'isError',
        'isPending',
        'reset',
        'run',
      ]);
    }

    await act(() => hook.result.current.request.run('group-1'));
    await act(() => hook.result.current.approve.run('membership-1'));
    await act(() => hook.result.current.reject.run('membership-2'));
    await act(() => hook.result.current.remove.run('membership-3'));
    await act(() => hook.result.current.add.run({ groupId: 'group-1', userId: 'user-1' }));

    expect(mocks.request).toHaveBeenCalledWith({ group_id: 'group-1' });
    expect(mocks.approve).toHaveBeenCalledWith({ membershipId: 'membership-1' });
    expect(mocks.reject).toHaveBeenCalledWith({ membershipId: 'membership-2' });
    expect(mocks.remove).toHaveBeenCalledWith({ membershipId: 'membership-3' });
    expect(mocks.add).toHaveBeenCalledWith({ groupId: 'group-1', userId: 'user-1' });
  });

  test('clears an earlier moderation failure when a different command succeeds', async () => {
    mocks.approve.mockRejectedValueOnce(new Error('Approve failed'));
    const hook = renderHook(() => useGroupMembershipWorkflow());

    await act(async () => {
      await expect(hook.result.current.approve.run('membership-1')).rejects.toThrow(
        'Approve failed'
      );
    });
    expect(hook.result.current.approve.error?.message).toBe('Approve failed');

    await act(async () => {
      await hook.result.current.reject.run('membership-1');
    });

    expect(hook.result.current.approve.error).toBeNull();
    expect(hook.result.current.reject.error).toBeNull();
    expect(hook.result.current.remove.error).toBeNull();
  });

  test('replaces an earlier moderation failure with the latest command failure', async () => {
    mocks.approve.mockRejectedValueOnce(new Error('Approve failed'));
    mocks.reject.mockRejectedValueOnce(new Error('Reject failed'));
    const hook = renderHook(() => useGroupMembershipWorkflow());

    await act(async () => {
      await expect(hook.result.current.approve.run('membership-1')).rejects.toThrow(
        'Approve failed'
      );
    });
    await act(async () => {
      await expect(hook.result.current.reject.run('membership-1')).rejects.toThrow('Reject failed');
    });

    expect(hook.result.current.approve.error).toBeNull();
    expect(hook.result.current.reject.error?.message).toBe('Reject failed');
    expect(hook.result.current.remove.error).toBeNull();
  });
});
