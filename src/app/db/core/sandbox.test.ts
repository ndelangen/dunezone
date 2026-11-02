import { makeFunctionReference } from 'convex/server';
import { describe, expect, test, vi } from 'vite-plus/test';

import { db, enterSandbox } from './index';

const page = makeFunctionReference<'query', { slug: string }>('factions:pageBySlug');
const save = makeFunctionReference<'mutation', { slug: string }>('factions:save');

describe('the database while a sandbox is open', () => {
  test('reads and writes go to the sandbox until it is left, and never after', async () => {
    const sandbox = { query: vi.fn(async () => 'practice'), mutation: vi.fn(async () => 'saved'), action: vi.fn() };
    const leave = enterSandbox(sandbox as never);
    await expect(db.query(page, { slug: 'atreides' })).resolves.toBe('practice');
    await expect(db.mutation(save, { slug: 'atreides' })).resolves.toBe('saved');
    leave();
    sandbox.mutation.mockClear();
    /* The deployment is unreachable in a unit test, so the write fails: what matters is that the sandbox never sees it. */
    await db.mutation(save, { slug: 'atreides' }).catch(() => undefined);
    expect(sandbox.mutation).not.toHaveBeenCalled();
  });

  test('leaving an older sandbox does not close a newer one', async () => {
    const older = { query: vi.fn(async () => 'older'), mutation: vi.fn(), action: vi.fn() };
    const newer = { query: vi.fn(async () => 'newer'), mutation: vi.fn(), action: vi.fn() };
    const leaveOlder = enterSandbox(older as never);
    const leaveNewer = enterSandbox(newer as never);
    leaveOlder();
    await expect(db.query(page, { slug: 'atreides' })).resolves.toBe('newer');
    leaveNewer();
  });
});
