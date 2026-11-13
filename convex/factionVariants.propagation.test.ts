/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('pushing changes down to variants (#2927, #2907)', () => {
  test('a parent’s save reaches its children and theirs, through a soft-deleted middle variant', async () => {
    const { owner, root, addVariant, data, save, settle } = await variantsFixture();
    const middle = await addVariant('Middle', root._id);
    const grandchild = await addVariant('Grandchild', middle.id);
    await owner.mutation(api.factions.softDelete, { id: middle.id });

    await save(root._id, withStartText(await data(root._id), 'Start anywhere you like.'));
    await settle();

    expect((await data(middle.id)).rules.startText).toBe('Start anywhere you like.');
    expect((await data(grandchild.id)).rules.startText).toBe('Start anywhere you like.');
  });
  test('a shared field saved on one variant reaches every other variant of the faction', async () => {
    const { root, addVariant, data, save, settle } = await variantsFixture();
    const sibling = await addVariant('Homebrew');
    await save(sibling.id, { ...(await data(sibling.id)), themeColor: '#123456' });
    await settle();
    expect((await data(root._id)).themeColor).toBe('#123456');
  });

  test('a later shared-field save wins even when an earlier one is still being pushed', async () => {
    const { root, addVariant, data, save, settle } = await variantsFixture();
    const sibling = await addVariant('Homebrew');
    await save(root._id, { ...(await data(root._id)), themeColor: '#aa0000' });
    await save(sibling.id, { ...(await data(sibling.id)), themeColor: '#0000aa' });
    await settle();
    expect((await data(root._id)).themeColor).toBe('#0000aa');
    expect((await data(sibling.id)).themeColor).toBe('#0000aa');
  });
});
