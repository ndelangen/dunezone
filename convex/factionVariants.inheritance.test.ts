/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { INHERITABLE_FIELDS } from '../src/shared/factions/variantFields';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('per-field inheritance (#2927)', () => {
  test('a custom field stays the child’s own, and switching it back to the parent takes the parent’s value', async () => {
    const { root, addVariant, data, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const custom = INHERITABLE_FIELDS.filter((field) => field !== 'rules.startText');

    await save(child.id, withStartText(await data(child.id), 'Our own start.'), custom);
    await save(root._id, withStartText(await data(root._id), 'The parent’s new start.'));
    await settle();
    expect((await data(child.id)).rules.startText).toBe('Our own start.');

    /* Whatever the draft holds for a field it follows, the parent's value is what is stored. */
    await save(child.id, withStartText(await data(child.id), 'Hidden draft text.'), [...INHERITABLE_FIELDS]);
    expect((await data(child.id)).rules.startText).toBe('The parent’s new start.');
  });
  test('a parent change that leaves the child invalid still reaches it, and its page lists the problem', async () => {
    const { root, addVariant, data, row, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const custom = INHERITABLE_FIELDS.filter((field) => field !== 'troops');
    const parentData = await data(root._id);
    await save(
      child.id,
      { ...(await data(child.id)), troops: [{ ...parentData.troops[0], planet: 'Caladan' }] },
      custom
    );
    await save(root._id, {
      ...parentData,
      planet: [{ image: 'https://example.com/caladan.png', name: 'Caladan', description: '' }],
    });
    await settle();
    expect((await row(child.id)).problems).toEqual([]);

    await save(root._id, { ...(await data(root._id)), planet: [] });
    await settle();
    expect((await data(child.id)).planet).toEqual([]);
    expect((await row(child.id)).problems).toEqual([
      'The troop "Regular troop" names the planet "Caladan", which this variant does not have.',
    ]);
  });
  test('a variant without a parent cannot follow one', async () => {
    const { root, data, save } = await variantsFixture();
    await expect(save(root._id, await data(root._id), ['leaders'])).rejects.toThrow('parent variant');
  });
});
