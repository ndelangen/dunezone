/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { INHERITABLE_FIELDS } from '../src/shared/factions/variantFields';
import { api } from './_generated/api';
import { variantsFixture } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('adding faction variants (#2927)', () => {
  test('a variant with a parent starts following it in every field, at its own address', async () => {
    const { root, addVariant, row } = await variantsFixture();
    const created = await addVariant('Dreamrules', root._id);
    const child = await row(created.id);

    expect(created.slug).toBe('atreides-dreamrules');
    expect(child).toMatchObject({
      family_id: (await row(root._id)).family_id,
      parent_id: root._id,
      variant_name: 'Dreamrules',
      variant_slug: 'dreamrules',
      inherited: [...INHERITABLE_FIELDS],
      problems: [],
    });
    expect(child.data).toEqual((await row(root._id)).data);
  });
  test('a variant without a parent is a copy with fields of its own', async () => {
    const { root, addVariant, row } = await variantsFixture();
    const created = await addVariant('Homebrew');
    const variant = await row(created.id);
    expect(variant.parent_id).toBeUndefined();
    expect(variant.inherited).toBeUndefined();
    expect(variant.data).toEqual((await row(root._id)).data);
  });
  test('only the faction’s maintainers add variants, never twice under one name, and only under a parent of the same faction', async () => {
    const { owner, stranger, root, addVariant } = await variantsFixture();
    await expect(
      stranger.mutation(api.factionVariants.create, { faction_id: root._id, name: 'Mine', group_id: null })
    ).rejects.toThrow('Not authorized');
    await addVariant('Dreamrules');
    await expect(addVariant('dreamrules!')).rejects.toThrow('already has a variant called');

    const other = await owner.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Harkonnen' },
      group_id: null,
    });
    await expect(addVariant('Crossed', other._id)).rejects.toThrow('same faction');
  });
});
