// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  request: vi.fn(),
  withdraw: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  leave: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  remove: vi.fn(),
  add: vi.fn(),
}));

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: mocks.useMutation,
  usePaginatedQuery: vi.fn(),
}));
vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));

import { useGroupMembershipWorkflow } from './members';

/* In the order the hook registers them, which is how the mocked `useMutation` hands each one back. */
const mutations = [
  mocks.request,
  mocks.withdraw,
  mocks.accept,
  mocks.decline,
  mocks.leave,
  mocks.approve,
  mocks.reject,
  mocks.remove,
  mocks.add,
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const mutation of mutations) {
    mutation.mockResolvedValue({ membershipId: 'membership-1', status: 'active' });
  }
  mocks.useMutation.mockImplementation(() => mutations[(mocks.useMutation.mock.calls.length - 1) % mutations.length]);
});

describe('Group membership workflow', () => {
  test('exposes normalized commands and keeps Convex transport arguments private', async () => {
    const hook = renderHook(() => useGroupMembershipWorkflow());

    for (const command of Object.values(hook.result.current)) {
      expect(Object.keys(command).sort()).toEqual(['error', 'isError', 'isPending', 'reset', 'run']);
    }

    await act(() => hook.result.current.request.run('group-1'));
    await act(() => hook.result.current.withdraw.run('group-1'));
    await act(() => hook.result.current.accept.run('group-2'));
    await act(() => hook.result.current.decline.run('group-3'));
    await act(() => hook.result.current.leave.run('group-4'));
    await act(() => hook.result.current.approve.run('membership-1'));
    await act(() => hook.result.current.reject.run('membership-2'));
    await act(() => hook.result.current.remove.run('membership-3'));
    await act(() => hook.result.current.add.run({ groupId: 'group-1', userId: 'user-1' }));

    expect(mocks.request).toHaveBeenCalledWith({ group_id: 'group-1' });
    expect(mocks.withdraw).toHaveBeenCalledWith({ group_id: 'group-1' });
    expect(mocks.accept).toHaveBeenCalledWith({ group_id: 'group-2' });
    expect(mocks.decline).toHaveBeenCalledWith({ group_id: 'group-3' });
    expect(mocks.leave).toHaveBeenCalledWith({ group_id: 'group-4' });
    expect(mocks.approve).toHaveBeenCalledWith({ membershipId: 'membership-1' });
    expect(mocks.reject).toHaveBeenCalledWith({ membershipId: 'membership-2' });
    expect(mocks.remove).toHaveBeenCalledWith({ membershipId: 'membership-3' });
    expect(mocks.add).toHaveBeenCalledWith({ groupId: 'group-1', userId: 'user-1' });
  });

  test('only the latest moderation outcome is shown: success clears, failure replaces', async () => {
    mocks.approve.mockRejectedValueOnce(new Error('Approve failed'));
    mocks.reject.mockRejectedValueOnce(new Error('Reject failed'));
    const hook = renderHook(() => useGroupMembershipWorkflow());

    await act(async () => {
      await expect(hook.result.current.approve.run('membership-1')).rejects.toThrow('Approve failed');
    });
    expect(hook.result.current.approve.error?.message).toBe('Approve failed');

    await act(async () => {
      await expect(hook.result.current.reject.run('membership-1')).rejects.toThrow('Reject failed');
    });
    expect(hook.result.current.approve.error).toBeNull();
    expect(hook.result.current.reject.error?.message).toBe('Reject failed');

    await act(async () => {
      await hook.result.current.remove.run('membership-1');
    });
    expect(hook.result.current.reject.error).toBeNull();
    expect(hook.result.current.remove.error).toBeNull();
  });

  test("the viewer's own commands clear one another's outcome the same way", async () => {
    mocks.accept.mockRejectedValueOnce(new Error('Accept failed'));
    const hook = renderHook(() => useGroupMembershipWorkflow());

    await act(async () => {
      await expect(hook.result.current.accept.run('group-1')).rejects.toThrow('Accept failed');
    });
    expect(hook.result.current.accept.error?.message).toBe('Accept failed');

    await act(async () => {
      await hook.result.current.decline.run('group-1');
    });
    expect(hook.result.current.accept.error).toBeNull();
    expect(hook.result.current.decline.error).toBeNull();
  });
});
